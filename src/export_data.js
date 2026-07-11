
import * as XLSX from 'xlsx';
import { toggleModal } from './modal-handler';
import { fetchInventory, fetchOrders, fetchUserProfile, getCachedUserProfile } from './firebase';
import { showToast } from './toast';
import { allItems } from './search_item';
import { getExcelCurrencyFormat } from './formatCurrency';

// The signed-in user, captured on init so runExport can scope its owner queries.
let currentUser = null;
// Guards against double-clicks kicking off two exports at once.
let isExporting = false;

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

// Firestore Timestamp | Date | ms → JS Date (or null). Mirrors the pattern used
// across order_history.js / sales_insight.js.
function toJsDate(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
}

// Human-readable date+time for a spreadsheet cell, in the device's local time.
function formatCellDate(ts) {
    const d = toJsDate(ts);
    if (!d || isNaN(d)) return '';
    return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// Local YYYY-MM-DD stamp for the download filename.
function fileDateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A YYYY-MM-DD date input → a local Date at the start (or end) of that day, so
// the range is inclusive of both boundary days. Returns null for empty/invalid.
function parseRangeInput(value, endOfDay) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return endOfDay
        ? new Date(y, m - 1, d, 23, 59, 59, 999)
        : new Date(y, m - 1, d, 0, 0, 0, 0);
}

// Keep only orders whose createdAt falls inside [from, to]. Either bound may be
// null (open-ended); both null returns every order untouched.
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

// Bytes → a compact human-readable size for the download card.
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

// One row per inventory item, columns in the order the modal advertises. Money
// columns stay numeric (sortable/summable), with the currency code in the header.
// Margin/Profit is the per-unit gain (Sell − Cost).
function buildInventoryRows(items, cur) {
    return items.map((item) => {
        const cost = item.costPrice ?? 0;
        const sell = item.sellPrice ?? 0;
        return {
            'Item Name': item.itemName || '',
            'SKU': item.sku || '',
            'Stock Level': item.stockLevel ?? 0,
            'Unit': item.unit || '',
            [`Cost Price (${cur})`]: cost,
            [`Sell Price (${cur})`]: sell,
            [`Margin/Profit (${cur})`]: sell - cost,
            'Supplier': item.supplier || '',
            'Description': item.description || '',
        };
    });
}

// An order's custom fields flattened to { label: value } so they become their
// own columns. Orders without a given field simply get a blank cell.
function customFieldColumns(order) {
    const out = {};
    const cf = order.customFields;
    if (cf && typeof cf === 'object') {
        Object.values(cf).forEach((field) => {
            if (field && field.label != null) out[field.label] = field.value ?? '';
        });
    }
    return out;
}

// One row per order (summary view). Custom fields appended as trailing columns.
function buildOrderRows(orders, cur) {
    return orders.map((order) => ({
        'Order ID': order.id ? order.id.slice(-8).toUpperCase() : '',
        'Date': formatCellDate(order.createdAt),
        'Customer Name': order.customer?.name || '',
        'Customer Phone': order.customer?.phone || '',
        'Total Quantity': order.totalQuantity ?? 0,
        [`Subtotal (${cur})`]: order.subtotal ?? 0,
        'Discount %': order.discountPct ?? 0,
        [`Discount Amount (${cur})`]: order.discountAmount ?? 0,
        'Tax Rate %': order.taxRate ?? 0,
        [`Tax Amount (${cur})`]: order.taxAmount ?? 0,
        [`Total (${cur})`]: order.totalPrice ?? 0,
        'Order Note': order.orderNote || '',
        ...customFieldColumns(order),
    }));
}

// One row per line item across all orders — the normalized sheet that makes the
// sales data pivot-table-friendly (order items[] is a nested array otherwise).
function buildLineItemRows(orders, cur) {
    const rows = [];
    orders.forEach((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach((li) => {
            rows.push({
                'Order ID': order.id ? order.id.slice(-8).toUpperCase() : '',
                'Date': formatCellDate(order.createdAt),
                'Item Name': li.name || '',
                [`Unit Price (${cur})`]: li.price ?? 0,
                'Quantity': li.quantity ?? 0,
                [`Line Subtotal (${cur})`]: li.subtotal ?? 0,
                [`Unit Cost (${cur})`]: li.cost ?? 0,
            });
        });
    });
    return rows;
}

// A small KPI block mirroring the Sales Insights dashboard. Revenue = sum of
// order totals (incl. tax); profit = per-item (subtotal − cost × qty).
function buildSummaryRows(profile, items, orders, cur) {
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
    return [
        { Metric: 'Business Name', Value: profile?.business_name || '' },
        { Metric: 'Export Date', Value: formatCellDate(new Date()) },
        { Metric: 'Currency', Value: cur },
        { Metric: 'Total Orders', Value: orders.length },
        { Metric: 'Total Items Sold', Value: itemsSold },
        { Metric: `Total Revenue (${cur})`, Value: revenue },
        { Metric: `Total Profit (${cur})`, Value: profit },
        { Metric: 'Inventory Item Count', Value: items.length },
    ];
}

// Rough column widths so the workbook opens readable rather than cramped.
function computeColWidths(rows) {
    if (!rows.length) return [{ wch: 12 }];
    const keys = [];
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
    return keys.map((key) => {
        let max = key.length;
        rows.forEach((r) => {
            const v = r[key];
            const len = v == null ? 0 : String(v).length;
            if (len > max) max = len;
        });
        return { wch: Math.min(Math.max(max + 2, 10), 40) };
    });
}

// Stamp the currency mask onto money cells so Excel shows "Rp 15.000" while the
// cell stays a real number. Money cells are the ones our row builders tagged with
// the "(<currency>)" marker: in the header for the tabular sheets, or in the
// Metric label for the two money rows on the Summary sheet.
function applyCurrencyFormat(ws, cur) {
    if (!ws['!ref']) return;
    const fmt = getExcelCurrencyFormat(cur);
    const marker = `(${cur})`;
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Scan the header row: collect money columns, and note the Summary "Value" column.
    const moneyCols = new Set();
    let valueCol = -1;
    for (let c = range.s.c; c <= range.e.c; c++) {
        const head = ws[XLSX.utils.encode_cell({ r: 0, c })];
        const text = head && typeof head.v === 'string' ? head.v : '';
        if (text.includes(marker)) moneyCols.add(c);
        if (text === 'Value') valueCol = c;
    }

    for (let r = 1; r <= range.e.r; r++) {
        moneyCols.forEach((c) => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === 'number') cell.z = fmt;
        });
        // Summary sheet: a row is money when its Metric label carries the marker.
        if (valueCol >= 0) {
            const metric = ws[XLSX.utils.encode_cell({ r, c: 0 })];
            const value = ws[XLSX.utils.encode_cell({ r, c: valueCol })];
            if (metric && typeof metric.v === 'string' && metric.v.includes(marker)
                && value && typeof value.v === 'number') {
                value.z = fmt;
            }
        }
    }
}

// Turn rows into a worksheet and append it. Empty datasets get a friendly
// placeholder cell so the tab still exists.
function appendSheet(wb, name, rows, cur) {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'No data': '' }]);
    sheet['!cols'] = computeColWidths(rows);
    applyCurrencyFormat(sheet, cur);
    XLSX.utils.book_append_sheet(wb, sheet, name);
}

// Clear the result box, releasing any object URL from a previous generate.
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

// Build the download card: icon, filename, a "4 sheets · N orders · size" meta
// line, and a Download button that saves the blob.
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
    meta.textContent = `4 sheets · ${orderCount} ${orderLabel} · ${formatFileSize(blob.size)}`;

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

async function runExport() {
    if (isExporting) return;
    if (!currentUser) { showToast('Please sign in to export.', 'error'); return; }

    const from = parseRangeInput(document.getElementById('js-export-from')?.value, false);
    const to = parseRangeInput(document.getElementById('js-export-to')?.value, true);
    if (from && to && from > to) {
        showToast('The "From" date is after the "To" date.', 'error');
        return;
    }

    isExporting = true;
    const runBtn = document.getElementById('js-export-run');
    const originalLabel = runBtn ? runBtn.textContent : '';
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Generating…'; }

    try {
        const profile = getCachedUserProfile() || await fetchUserProfile(currentUser.uid);
        const cur = profile?.currency || 'IDR';
        // Prefer the live in-memory inventory; fall back to a fetch if it isn't loaded yet.
        const items = (allItems && allItems.length) ? allItems : await fetchInventory(currentUser.uid);
        const orders = filterOrdersByRange(await fetchOrders(currentUser.uid), from, to);

        if (!items.length && !orders.length) {
            showToast('No data to export for this range.', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        appendSheet(wb, 'Summary', buildSummaryRows(profile, items, orders, cur), cur);
        appendSheet(wb, 'Inventory', buildInventoryRows(items, cur), cur);
        appendSheet(wb, 'Orders', buildOrderRows(orders, cur), cur);
        appendSheet(wb, 'Order Line Items', buildLineItemRows(orders, cur), cur);

        const bizName = (profile?.business_name || 'POS').replace(/[^\w-]+/g, '_');
        const fileName = `${bizName}_export_${fileDateStamp()}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        renderFileCard(fileName, blob, orders.length);
        showToast('Export ready to download.');
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        isExporting = false;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = originalLabel || 'Generate export'; }
    }
}
