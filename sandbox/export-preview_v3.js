import * as XLSX from 'xlsx-js-style';
import { getExcelCurrencyFormat } from '../src/formatCurrency.js';

const CURRENT_CURRENCY = () => document.getElementById('currency').value;

const COL_PADDING = 2;
const COL_MIN_WCH = 10;
const COL_MAX_WCH = 40;

// Row/column map of the summary sheet. The title banner at row 0 pushes every
// other block down by one, so these are the single source of truth: the style
// functions below derive their cell addresses from them rather than hardcoding.
const SUMMARY_TITLE_ROW      = 0;
const SUMMARY_META_FIRST_ROW = 1;
const SUMMARY_META_LAST_ROW  = 4; // rows 1-4: label / value pairs
const SUMMARY_SPACER_ROW     = 5;
const SUMMARY_HEADER_ROW     = 6;
const SUMMARY_FIRST_DATA_ROW = 7;
const SUMMARY_LAST_COL       = 4; // column E
const SUMMARY_MONEY_COLS     = [2, 3]; // Total Revenue, Total Profit

const LEFT_ALIGN = { alignment: { horizontal: 'left' } };

function dummySummaryRows(cur) {
    return [
        ['Nike Sales Report'],

        ['Report Type:',   'Summary'],
        ['Business Name:', 'Nike'],
        ['Currency:',      cur],
        ['Period:',        '12-06-2026 to 30-06-2026'],

        [],

        ['Total Orders', 'Total Item Sold', 'Total Revenue', 'Total Profit', 'Profit Percentage'],

        [123, 500, 10000000, 5000000, '50%'],
        [100, 40, 10000000, 6000000, '40%'],
    ];
}

function sizeColumn(maxLen) {
    const desired = maxLen + COL_PADDING;
    return {
        wch:      Math.min(Math.max(desired, COL_MIN_WCH), COL_MAX_WCH),
        overflow: desired > COL_MAX_WCH,
    };
}

// The title banner is merged across every column, so its length says nothing
// about how wide column A needs to be. Measure the rows below it only.
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

function mergeCellStyle(cell, patch) {
    if (!cell) return;
    const prev = cell.s || {};
    const next = { ...prev, ...patch };
    if (prev.alignment || patch.alignment) {
        next.alignment = { ...(prev.alignment || {}), ...(patch.alignment || {}) };
    }
    cell.s = next;
}

// Wrap is a per-cell flag, not a per-column one: the xlsx format has no "wrap this
// column" switch, so every cell in an overflowing column has to be stamped.
function wrapColumns(worksheet, wrapCols) {
    if (!wrapCols.length) return;
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
        wrapCols.forEach((c) => {
            mergeCellStyle(worksheet[XLSX.utils.encode_cell({ r, c })], {
                alignment: { wrapText: true, vertical: 'top' },
            });
        });
    }
}

function MetaDataStyle(worksheet) {
    const cleanPaperBoldLabel = { font: { bold: true, color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };
    const cleanPaperNormalValue = { font: { color: { rgb: '000000' } }, fill: { fgColor: { rgb: 'FFFFFF' } } };

    // Paint through the spacer row as well, so the white block reads as one
    // continuous sheet of paper instead of stopping short above the table.
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

function TableDataStyle(worksheet, cur) {
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
        SUMMARY_MONEY_COLS.forEach((C) => {
            const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell || typeof cell.v !== 'number') return;
            cell.z = fmt;
            mergeCellStyle(cell, LEFT_ALIGN);
        });
    }
}

function makeSummarySheet(cur) {
    const rows = dummySummaryRows(cur);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    const { cols, wrapCols } = computeAoaColWidths(rows);
    worksheet['!cols'] = cols;

    MetaDataStyle(worksheet);
    TableDataStyle(worksheet, cur);

    // Last, so the wrap flag merges into the styles above instead of being
    // overwritten by them.
    wrapColumns(worksheet, wrapCols);

    return worksheet;
}

function generate() {
    const cur = CURRENT_CURRENCY();
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, makeSummarySheet(cur), 'Summary Report');

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-preview-${cur}-v3.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

document.getElementById('generate').addEventListener('click', generate);
