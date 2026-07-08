import * as XLSX from 'xlsx';
import { toggleModal } from './modal-handler';
import { fetchInventory, fetchOrders, fetchUserProfile, getCachedUserProfile } from './firebase';
import { getItemCategories } from './item_categories';
import { showToast } from './toast';
import { allItems } from './search_item';

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

// One row per inventory item. Money columns stay numeric (sortable/summable),
// with the active currency code carried in the header.
function buildInventoryRows(items, cur) {
    return items.map((item) => ({
        'SKU': item.sku || '',
        'Item Name': item.itemName || '',
        'Category': getItemCategories(item).join(', '),
        [`Cost Price (${cur})`]: item.costPrice ?? 0,
        [`Sell Price (${cur})`]: item.sellPrice ?? 0,
        'Stock Level': item.stockLevel ?? 0,
        'Min Stock Level': item.minStockLevel ?? 0,
        'Unit': item.unit || '',
        'Supplier': item.supplier || '',
        'Description': item.description || '',
        'Created At': formatCellDate(item.createdAt),
        'Last Updated': formatCellDate(item.lastUpdated),
    }));
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

// Turn rows into a worksheet and append it. Empty datasets get a friendly
// placeholder cell so the tab still exists.
function appendSheet(wb, name, rows) {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'No data': '' }]);
    sheet['!cols'] = computeColWidths(rows);
    XLSX.utils.book_append_sheet(wb, sheet, name);
}

async function runExport() {
    if (isExporting) return;
    if (!currentUser) { showToast('Please sign in to export.', 'error'); return; }

    isExporting = true;
    const runBtn = document.getElementById('js-export-run');
    const originalLabel = runBtn ? runBtn.textContent : '';
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Exporting…'; }

    try {
        const profile = getCachedUserProfile() || await fetchUserProfile(currentUser.uid);
        const cur = profile?.currency || 'IDR';
        // Prefer the live in-memory inventory; fall back to a fetch if it isn't loaded yet.
        const items = (allItems && allItems.length) ? allItems : await fetchInventory(currentUser.uid);
        const orders = await fetchOrders(currentUser.uid);

        if (!items.length && !orders.length) {
            showToast('No data to export yet.', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        appendSheet(wb, 'Summary', buildSummaryRows(profile, items, orders, cur));
        appendSheet(wb, 'Inventory', buildInventoryRows(items, cur));
        appendSheet(wb, 'Orders', buildOrderRows(orders, cur));
        appendSheet(wb, 'Order Line Items', buildLineItemRows(orders, cur));

        const bizName = (profile?.business_name || 'POS').replace(/[^\w-]+/g, '_');
        XLSX.writeFile(wb, `${bizName}_export_${fileDateStamp()}.xlsx`);
        showToast('Export downloaded.');
        toggleModal('export-data-modal');
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed. Please try again.', 'error');
    } finally {
        isExporting = false;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = originalLabel || 'Export to Excel'; }
    }
}
