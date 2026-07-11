import * as XLSX from 'xlsx-js-style';

// ============================================================
// Design tokens
// ============================================================

const INK = '16202B';    // business name, KPI values
const SLATE = '6B7A8C';  // labels, meta line, footnote
const RULE = 'C7D0DA';   // hairlines
const ACCENT = '0F7B5A'; // profit, used exactly once
const PAPER = 'FFFFFF';  // painted everywhere to erase gridlines

const IDR_FORMAT = '"Rp"#,##0';
const PCT_FORMAT = '0.0%';

const hairline = { style: 'thin', color: { rgb: RULE } };

const titleStyle = {
    font: { name: 'Georgia', sz: 20, bold: true, color: { rgb: INK } },
    fill: { fgColor: { rgb: PAPER } },
    alignment: { vertical: 'center' },
};

const metaStyle = {
    font: { name: 'Calibri', sz: 9, color: { rgb: SLATE } },
    fill: { fgColor: { rgb: PAPER } },
    alignment: { vertical: 'center' },
};

const ruleRowStyle = {
    fill: { fgColor: { rgb: PAPER } },
    border: { bottom: hairline },
};

const kpiLabelStyle = {
    font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: SLATE } },
    fill: { fgColor: { rgb: PAPER } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: hairline },
};

const kpiValueStyle = {
    font: { name: 'Consolas', sz: 14, bold: true, color: { rgb: INK } },
    fill: { fgColor: { rgb: PAPER } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: hairline },
};

// The one place the sheet raises its voice.
const kpiProfitStyle = {
    ...kpiValueStyle,
    font: { name: 'Consolas', sz: 14, bold: true, color: { rgb: ACCENT } },
};

const footnoteStyle = {
    font: { name: 'Calibri', sz: 8, italic: true, color: { rgb: SLATE } },
    fill: { fgColor: { rgb: PAPER } },
    alignment: { vertical: 'center' },
};

// ============================================================
// Cell helpers
// ============================================================

// Write a value into a cell, creating it if the sheet has no entry there yet.
function setCell(ws, address, value, style, numFmt) {
    const cell = ws[address] || { t: typeof value === 'number' ? 'n' : 's', v: value ?? '' };
    cell.v = value ?? '';
    cell.t = typeof value === 'number' ? 'n' : 's';
    if (style) cell.s = style;
    if (numFmt) cell.z = numFmt;
    ws[address] = cell;
    return cell;
}

// Paint every cell in a rectangle white. Empty cells have to be created first,
// otherwise Excel falls back to the default gridlines underneath them.
function paintPaper(ws, startRow, endRow, startCol, endCol) {
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const address = XLSX.utils.encode_cell({ r, c });
            if (!ws[address]) ws[address] = { t: 's', v: '' };
            if (!ws[address].s) ws[address].s = { fill: { fgColor: { rgb: PAPER } } };
        }
    }
}

// A merged band spanning columns B..F on one row.
function mergeBand(row) {
    return { s: { r: row, c: 1 }, e: { r: row, c: 5 } };
}

// ============================================================
// Sheet
// ============================================================

const KPI_COLUMNS = [
    { label: 'TOTAL ORDERS', value: 123 },
    { label: 'ITEMS SOLD', value: 500 },
    { label: 'REVENUE', value: 10000000, numFmt: IDR_FORMAT },
    { label: 'PROFIT', value: 5000000, numFmt: IDR_FORMAT, accent: true },
    { label: 'MARGIN', value: 0.5, numFmt: PCT_FORMAT },
];

function buildSummarySheet(business, currency, period, generatedOn) {
    const ws = {};

    // Reserve the full canvas: col A is a gutter, col G closes the right margin,
    // rows 0..8 are the document. Everything gets painted before we style on top.
    ws['!ref'] = 'A1:G9';
    paintPaper(ws, 0, 8, 0, 6);

    setCell(ws, 'B2', business, titleStyle);
    setCell(ws, 'B3', `SUMMARY REPORT · ${currency} · ${period.toUpperCase()}`, metaStyle);

    // Row 4 carries the rule under the header, so it needs no text of its own.
    for (let c = 1; c <= 5; c++) {
        ws[XLSX.utils.encode_cell({ r: 3, c })].s = ruleRowStyle;
    }

    KPI_COLUMNS.forEach((kpi, i) => {
        const col = i + 1;
        setCell(ws, XLSX.utils.encode_cell({ r: 5, c: col }), kpi.label, kpiLabelStyle);
        setCell(
            ws,
            XLSX.utils.encode_cell({ r: 6, c: col }),
            kpi.value,
            kpi.accent ? kpiProfitStyle : kpiValueStyle,
            kpi.numFmt,
        );
    });

    setCell(ws, 'B8', `Generated ${generatedOn}`, footnoteStyle);

    ws['!merges'] = [mergeBand(1), mergeBand(2), mergeBand(7)];

    ws['!cols'] = [
        { wch: 2 },  // A: left gutter
        { wch: 17 }, // B
        { wch: 17 }, // C
        { wch: 17 }, // D
        { wch: 17 }, // E
        { wch: 17 }, // F
        { wch: 2 },  // G: right gutter
    ];

    ws['!rows'] = [
        { hpt: 6 },  // 1: top margin
        { hpt: 28 }, // 2: business name
        { hpt: 14 }, // 3: meta line
        { hpt: 8 },  // 4: hairline
        { hpt: 12 }, // 5: breathing room
        { hpt: 18 }, // 6: KPI labels
        { hpt: 28 }, // 7: KPI values
        { hpt: 16 }, // 8: footnote
        { hpt: 6 },  // 9: bottom margin
    ];

    return ws;
}

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
    workbook,
    buildSummarySheet('Nike', 'IDR', '12 Jun 2026 to 30 Jun 2026', '11 Jul 2026'),
    'Summary',
);

XLSX.writeFile(workbook, 'Nike_Summary_Report.xlsx');
