import { toggleModal } from './modal-handler';
import { fetchInventory, fetchOrders, fetchUserProfile, getCachedUserProfile } from './firebase';
import { showToast } from './toast';
import { allItems } from './search_item';
import { getExcelCurrencyFormat } from './formatCurrency';

const COL_PADDING = 2;
const COL_MIN_WCH = 10;
const COL_MAX_WCH = 40;

// Row/column map of the summary sheet. The title banner at row 0 pushes every other block down by one, so these are the single source of truth: the style. Functions below derive their cell addresses from them rather than hardcoding.
const SUMMARY_TITLE_ROW      = 0;
const SUMMARY_META_FIRST_ROW = 1;
const SUMMARY_META_LAST_ROW  = 4; 
const SUMMARY_SPACER_ROW     = 5;
const SUMMARY_HEADER_ROW     = 6;
const SUMMARY_FIRST_DATA_ROW = 7;
const SUMMARY_LAST_COL       = 4; // column E
const SUMMARY_MONEY_COLS     = [2, 3]; // Total Revenue, Total Profit
const SUMMARY_MARGIN_COL     = 4; // Margin Percentage

// Excel's percent format multiplies the cell by 100 when it renders, so the cell must hold the raw fraction (0.325) rather than 32.5, or it would read 3250%.
const PCT_FORMAT = '0.0%';

const LEFT_ALIGN = { alignment: { horizontal: 'left' } };

let currentUser = null;
let isExporting = false;

// xlsx-js-style is a ~2.7 MB library. Loaded on demand the first time an export runs (see runExport) rather than statically, so it stays out of the main
let XLSX = null;

export function initExport(user) {
    if (!user) return;
    currentUser = user;

    const openBtn = document.getElementById('export-data-open');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            toggleModal('features-modal');
            toggleModal('export-data-modal');
            // Start each visit with a clean slate — no stale card from last time.
            resetFileCard();
        });
    }

    const runBtn = document.getElementById('js-export-run');
    if (runBtn) runBtn.addEventListener('click', runExport);
}

async function runExport(){
    if (isExporting) return;
    if (!currentUser) { showToast('Please sign in to export.', 'error'); return; }

    const from = parseRangeInput(document.getElementById('js-export-from')?.value, false);
    const to = parseRangeInput(document.getElementById('js-export-to')?.value, true);
    if (from && to && from > to) { showToast('The "From" date is after the "To" date.', 'error'); return; }

    isExporting = true;
    const runBtn = document.getElementById('js-export-run');
    const originalLabel = runBtn ? runBtn.textContent : '';
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Generating…'; }

    try {
        // Fetch the spreadsheet library on first use. Cached in the module-level
        // XLSX binding so subsequent exports reuse it without re-importing.
        if (!XLSX) XLSX = await import('xlsx-js-style');

        const profile = getCachedUserProfile() || await fetchUserProfile(currentUser.uid);
        const currency = profile?.currency || 'IDR';
        const items = (allItems && allItems.length) ? allItems : await fetchInventory(currentUser.uid);
        const orders = filterOrdersByRange(await fetchOrders(currentUser.uid), from, to);

        if (!items.length && !orders.length) { showToast('No data to export for this range.', 'error'); return; }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, buildSummarySheet(profile, orders, from, to, currency), 'Summary');
        const bizName = (profile?.business_name || 'POS').replace(/[^\w-]+/g, '_');
        const fileName = `${bizName}_export_${fileDateStamp()}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', });
        renderFileCard(fileName, blob, orders.length);
        showToast('Export ready to download.');
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        isExporting = false;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = originalLabel || 'Generate export'; }
    }
} 

function buildSummarySheet(profile, orders, fromDate, toDate, currency){
    const rows = summaryRows(profile, orders, fromDate, toDate, currency);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const { cols, wrapCols } = computeAoaColWidths(rows);
    worksheet['!cols'] = cols;
    metaDataStyle(worksheet);
    
    tableDataStyle(worksheet, currency);

    wrapColumns(worksheet, wrapCols);

    return worksheet;
}

function summaryRows(profile, orders, fromDate, toDate, currency){
    const businessName = profile?.business_name || 'POS';

    let totalOrders = orders.length;
    let revenue = 0;
    let profit = 0;
    let itemsSold = 0;
    orders.forEach((order) => {
        revenue += order.totalPrice ?? 0;
        const lis = Array.isArray(order.items) ? order.items : [];
        lis.forEach((li) => {
            itemsSold += li.quantity ?? 0;
            profit += (li.subtotal ?? 0) - (li.cost ?? 0) * (li.quantity ?? 0);
        });
    });
    // Stored as a fraction for PCT_FORMAT. An empty range leaves revenue at 0;
    // guard so the cell holds 0 rather than NaN.
    const marginPercentage = revenue > 0 ? profit / revenue : 0;

    return [
        [`${businessName} Sales Report`],
        ['Report Type:', 'Summary'],
        ['Business Name:', businessName],
        ['Currency:', currency],
        ['Period', formatPeriod(fromDate, toDate)],
        [],
        ['Total Orders', 'Total Item Sold', 'Total Revenue', 'Total Profit', 'Margin Percentage'],
        [totalOrders, itemsSold, revenue, profit, marginPercentage]
    ];
}

// Both bounds are optional, so the period reads as a closed range, an open one,
// or "All time" when the user exported without picking any dates.
function formatPeriod(fromDate, toDate) {
    const from = formatRangeDate(fromDate);
    const to = formatRangeDate(toDate);
    if (from && to) return `${from} - ${to}`;
    if (from) return `${from} onwards`;
    if (to) return `Up to ${to}`;
    return 'All time';
}

function formatRangeDate(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function metaDataStyle(worksheet) {
    const cleanPaperBoldLabel = { font: { bold: true, color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };
    const cleanPaperNormalValue = { font: { color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };

    for (let R = SUMMARY_META_FIRST_ROW; R <= SUMMARY_SPACER_ROW; R++) {
        for (let C = 0; C <= SUMMARY_LAST_COL; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });

            if (!worksheet[cellAddress]) { worksheet[cellAddress] = { t: 's', v: '' }; }

            if (C === 0 && R <= SUMMARY_META_LAST_ROW) { mergeCellStyle(worksheet[cellAddress], cleanPaperBoldLabel); }
            else { mergeCellStyle(worksheet[cellAddress], cleanPaperNormalValue); }
        }
    }

    const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F3864' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };

    // Excel paints a merged range using the top-left cell's value, but it draws
    // the fill per underlying cell, so B1 to E1 need the style too.
    for (let C = 0; C <= SUMMARY_LAST_COL; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: SUMMARY_TITLE_ROW, c: C });
        if (!worksheet[cellAddress]) { worksheet[cellAddress] = { t: 's', v: '' }; }
        mergeCellStyle(worksheet[cellAddress], titleStyle);
    }

    worksheet['!merges'] = [{ s: { r: SUMMARY_TITLE_ROW, c: 0 }, e: { r: SUMMARY_TITLE_ROW, c: SUMMARY_LAST_COL } }];
    worksheet['!rows'] = [{ hpt: 50 }];
}

function tableDataStyle(worksheet, cur) {
    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4F81BD' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };

    for (let C = 0; C <= SUMMARY_LAST_COL; C++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: SUMMARY_HEADER_ROW, c: C })];
        if (cell) { mergeCellStyle(cell, headerStyle); }
    }

    const fmt = getExcelCurrencyFormat(cur);
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    for (let R = SUMMARY_FIRST_DATA_ROW; R <= range.e.r; R++) {
        // Left-align every cell in the data row.
        for (let C = 0; C <= SUMMARY_LAST_COL; C++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell) mergeCellStyle(cell, LEFT_ALIGN);
        }
        // Currency number format applies only to the money columns.
        SUMMARY_MONEY_COLS.forEach((C) => {
            const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell || typeof cell.v !== 'number') return;
            cell.z = fmt;
        });
    }

    const margin = worksheet[XLSX.utils.encode_cell({ r: SUMMARY_FIRST_DATA_ROW, c: SUMMARY_MARGIN_COL })];
    if (margin) margin.z = PCT_FORMAT;
}

function computeAoaColWidths(rows) {
    const measured = rows.slice(SUMMARY_TITLE_ROW + 1);

    let widest = 0;
    measured.forEach((row) => { if (row.length > widest) widest = row.length; });
    if (!widest) return { cols: [{ wch: COL_MIN_WCH }], wrapCols: [] };

    const cols = [];
    const wrapCols = [];
    for (let c = 0; c < widest; c++) {
        let max = 0;
        measured.forEach((row) => {
            const v = row[c];
            const len = v == null ? 0 : String(v).length;
            if (len > max) max = len;
        });
        const { wch, overflow } = sizeColumn(max);
        cols.push({ wch });
        if (overflow) wrapCols.push(c);
    }
    return { cols, wrapCols };
}

// Wrapping the merged title banner would fight the merge, so start at the header.
function wrapColumns(worksheet, wrapCols) {
    if (!wrapCols.length) return;
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let r = SUMMARY_HEADER_ROW; r <= range.e.r; r++) {
        wrapCols.forEach((c) => {
            mergeCellStyle(worksheet[XLSX.utils.encode_cell({ r, c })], {
                alignment: { wrapText: true, vertical: 'top' },
            });
        });
    }
}

function sizeColumn(maxLen) {
    const desired = maxLen + COL_PADDING;
    return {
        wch: Math.min(Math.max(desired, COL_MIN_WCH), COL_MAX_WCH),
        overflow: desired > COL_MAX_WCH,
    };
}

function mergeCellStyle(cell, patch) {
    if (!cell) return;
    const prev = cell.s || {};
    const next = { ...prev, ...patch };
    if (prev.alignment || patch.alignment) {
        next.alignment = { ...(prev.alignment || {}), ...(patch.alignment || {}) };
    }
    cell.s = next;
}

// Bytes → a compact human-readable size for the download card.
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

// Tear down the previous card and release its blob URL, so repeated exports in
// one session don't leak object URLs.
function resetFileCard() {
    const box = document.getElementById('generated-file-box');
    if (!box) return;
    if (box.dataset.url) {
        URL.revokeObjectURL(box.dataset.url);
        delete box.dataset.url;
    }
    box.replaceChildren();
    box.hidden = true;
}

function renderFileCard(fileName, blob, orderCount) {
    const box = document.getElementById('generated-file-box');
    if (!box) return;

    resetFileCard();

    const url = URL.createObjectURL(blob);
    box.dataset.url = url;

    const icon = document.createElement('span');
    icon.className = 'c-export__file-icon';
    icon.textContent = '📄';

    const info = document.createElement('div');
    info.className = 'c-export__file-info';

    const name = document.createElement('p');
    name.className = 'c-export__file-name';
    name.textContent = fileName;

    const meta = document.createElement('p');
    meta.className = 'c-export__file-meta';
    const orderLabel = orderCount === 1 ? 'order' : 'orders';
    meta.textContent = `1 sheet · ${orderCount} ${orderLabel} · ${formatFileSize(blob.size)}`;

    info.append(name, meta);

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'c-export__download';
    download.textContent = 'Download';
    download.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    box.append(icon, info, download);
    box.hidden = false;
}

function filterOrdersByRange(orders, from, to) {
    if (!from && !to) return orders;
    return orders.filter((order) => {
        const d = toJsDate(order.createdAt);
        if (!d || isNaN(d)) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    });
}

function parseRangeInput(value, endOfDay) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return endOfDay
        ? new Date(y, m - 1, d, 23, 59, 59, 999)
        : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toJsDate(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
}

function formatCellDate(ts) {
    const d = toJsDate(ts);
    if (!d || isNaN(d)) return '';
    return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function fileDateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}