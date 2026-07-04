import { updateItemData, deleteInventoryItem, getCachedUserProfile, addMetaUpdateHistory, fetchMetaHistory } from './firebase';
import { getCurrencySymbol, formatCurrency } from './formatCurrency';
import { toggleModal } from './modal-handler';
import { allItems, loadAllItems, updateLocalItem, removeLocalItem, refreshGrid } from './search_item';
import { createSelection } from './selection';
import { showConfirm } from './confirm_modal';
import { requireAdminPin } from './admin_pin';
import { showToast } from "./toast";
import { skeletonBar } from './skeleton';
import { attachListKeyNav } from './listKeyNav';
import { getCategories } from './categories';
import { getItemCategories } from './item_categories';
let filteredItems  = [];
const selection    = createSelection();
let selectedTheme  = 'primary';
let selectedCategories = new Set();

// Change-history paging state (mirrors the stock-update history in the
// inventory-update modal).
const HISTORY_PAGE = 5;
let historyLastDoc = null;
let historyItemId  = null;

const TAG_SWATCH = {
    primary:    '#4E7397',
    success:    '#86A38C',
    neutral:    '#718096',
    priority:   '#C58B8B',
    legibility: '#2D3748',
    pink:       '#ea8cd1',
    yellow:     '#ebdfa4',
};
const THEMES = [
    { token: 'primary',    name: 'Muted Cobalt' },
    { token: 'success',    name: 'Sage Green' },
    { token: 'neutral',    name: 'Soft Blue' },
    { token: 'priority',   name: 'Dusty Rose' },
    { token: 'legibility', name: 'Deep Charcoal' },
    { token: 'pink',       name: 'Baby Pink' },
    { token: 'yellow',     name: 'Yellow Butter' },
];

function swatchFor(tagColor) {
    return TAG_SWATCH[tagColor] || 'var(--clr-border)';
}

// Build the theme swatch row once. Each swatch is a button so it styles
// identically across browsers; clicking sets the in-memory selectedTheme.
function buildThemeSwatches() {
    const container = document.getElementById('mi-edit-theme');
    const frag = document.createDocumentFragment();
    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mi-swatch';
        btn.dataset.theme = theme.token;
        btn.title = theme.name;            // native tooltip on hover
        btn.style.backgroundColor = swatchFor(theme.token);
        btn.addEventListener('click', () => setActiveTheme(theme.token));
        frag.appendChild(btn);
    });
    container.replaceChildren(frag);
}

function setActiveTheme(token) {
    selectedTheme = token;
    document.querySelectorAll('#mi-edit-theme .mi-swatch').forEach(sw => {
        sw.classList.toggle('mi-swatch--active', sw.dataset.theme === token);
    });
}


function buildCategoryChips() {
    const container = document.getElementById('mi-edit-categories');
    const library = getCategories();
    const names = [...new Set([...library, ...selectedCategories])];

    const frag = document.createDocumentFragment();
    names.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mi-chip';
        btn.dataset.category = name;
        btn.textContent = name;
        btn.classList.toggle('mi-chip--active', selectedCategories.has(name));
        if (!library.includes(name)) btn.classList.add('mi-chip--orphan');
        btn.addEventListener('click', () => toggleCategory(name));
        frag.appendChild(btn);
    });
    container.replaceChildren(frag);

    if (names.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'mi-chip-empty';
        hint.textContent = 'No categories yet — add some in Manage Categories.';
        container.appendChild(hint);
    }
}

function toggleCategory(name) {
    if (selectedCategories.has(name)) selectedCategories.delete(name);
    else selectedCategories.add(name);
    document.querySelector(`#mi-edit-categories .mi-chip[data-category="${name}"]`)
        ?.classList.toggle('mi-chip--active');
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    // Firestore Timestamp has toDate(); fall back to raw Date/string.
    const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
}


function buildItemSkeleton(count = 6) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'mi-card is-skeleton';

        const top = document.createElement('div');
        top.className = 'mi-card__top';
        const dot = skeletonBar('9px', '9px');
        dot.classList.add('skeleton-bar--dot');
        top.append(dot, skeletonBar('60%', '1rem'));

        card.append(top, skeletonBar('40%', '1rem'));
        frag.appendChild(card);
    }
    return frag;
}

function renderItemList_Manage(items) {
    const container = document.getElementById('mi-item-list');
    container.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'mi-empty';
        empty.textContent = 'No items found.';
        container.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'mi-card';
        card.dataset.itemId = item.id;

        const topRow = document.createElement('div');
        topRow.className = 'mi-card__top';

        const dot = document.createElement('span');
        dot.className = 'mi-card__dot';
        dot.style.backgroundColor = swatchFor(item.tagColor);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mi-card__name';
        nameSpan.textContent = item.itemName ?? '—';

        topRow.append(dot, nameSpan);

        const skuSpan = document.createElement('span');
        skuSpan.className = 'mi-card__sku';
        skuSpan.textContent = item.sku ?? '—';

        card.append(topRow, skuSpan);
        card.addEventListener('click', () => selectItem(item, card));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

//  Select + populate 

function selectItem(item, cardEl) {
    document.querySelectorAll('.mi-card').forEach(c => c.classList.remove('mi-card--active'));
    cardEl.classList.add('mi-card--active');
    selection.set(item);
    populateDetail(item);
}

// Re-render the detail panel for the currently selected item, e.g. after its
// stock is mutated elsewhere (order deletion restock) while the modal is open
export function refreshSelectedItemDetail() {
    const item = selection.get();
    if (!item) return;
    populateDetail(item);
}

function populateDetail(item) {
    document.getElementById('mi-placeholder').classList.add('is-hidden');
    document.getElementById('mi-detail-view').classList.remove('is-hidden');
    document.getElementById('mi-save-btn').disabled = false;
    document.getElementById('mi-delete-btn').disabled = false;

    document.getElementById('mi-detail-dot').style.backgroundColor = swatchFor(item.tagColor);
    document.getElementById('mi-detail-name').textContent = item.itemName ?? '—';
    document.getElementById('mi-detail-sku').textContent  = `SKU: ${item.sku ?? '—'}`;

    // Read-only overview
    document.getElementById('mi-ro-stock').textContent   = `${item.stockLevel ?? 0} ${item.unit ?? ''}`.trim();
    document.getElementById('mi-ro-unit').textContent    = item.unit || '—';
    document.getElementById('mi-ro-created').textContent = formatTimestamp(item.createdAt);
    document.getElementById('mi-ro-updated').textContent = formatTimestamp(item.lastUpdated);
    document.getElementById('mi-ro-desc').textContent    = item.description || '—';

    // Editable fields
    document.getElementById('mi-edit-cost').value     = item.costPrice ?? '';
    document.getElementById('mi-edit-sell').value     = item.sellPrice ?? '';
    document.getElementById('mi-edit-min').value      = item.minStockLevel ?? '';
    document.getElementById('mi-edit-supplier').value = item.supplier ?? '';
    selectedCategories = new Set(getItemCategories(item));
    buildCategoryChips();
    setActiveTheme(item.tagColor || 'primary');

    clearFeedback();

    historyLastDoc = null;
    historyItemId  = item.id;
    loadMetaHistory(item.id, false);
}

//  Change diffing

function themeName(token) {
    return (THEMES.find(t => t.token === token) || {}).name || token || '—';
}

function fmtCategories(list) {
    const arr = Array.isArray(list) ? [...list] : [];
    return arr.length ? arr.sort().join(', ') : '(none)';
}

// Each field knows its human label and how to render a value as display text.
// Equality is decided by comparing the two display strings, so cosmetic
// differences (category order, missing value) never log a spurious change.
function historyFieldSpecs(currencyCode) {
    const symbol = getCurrencySymbol(currencyCode);
    const money  = v => `${symbol}${formatCurrency(Number(v ?? 0), currencyCode)}`;
    return [
        { key: 'costPrice',     label: 'Cost price',    format: money },
        { key: 'sellPrice',     label: 'Sell price',    format: money },
        { key: 'minStockLevel', label: 'Minimum stock', format: v => `${v ?? 0}` },
        { key: 'supplier',      label: 'Supplier',      format: v => (v && String(v).trim()) ? String(v).trim() : '(none)' },
        { key: 'categories',    label: 'Categories',    format: fmtCategories },
        { key: 'tagColor',      label: 'Theme',         format: v => themeName(v) },
    ];
}

// Compare the item's previous values against the newly-saved fields and return
// an array of { field, label, from, to } for only the fields that changed.
function computeChanges(oldItem, newFields, currencyCode) {
    return historyFieldSpecs(currencyCode).reduce((changes, spec) => {
        const from = spec.format(oldItem[spec.key]);
        const to   = spec.format(newFields[spec.key]);
        if (from !== to) changes.push({ field: spec.key, label: spec.label, from, to });
        return changes;
    }, []);
}

//  Save edits

async function handleSave() {
    const item = selection.get();
    if (!item) return;

    const costPrice     = Number(document.getElementById('mi-edit-cost').value);
    const sellPrice     = Number(document.getElementById('mi-edit-sell').value);
    const minStockLevel = parseFloat(document.getElementById('mi-edit-min').value);
    const supplier      = document.getElementById('mi-edit-supplier').value.trim();
    const categories    = [...selectedCategories];
    const tagColor      = selectedTheme;

    if (!Number.isFinite(costPrice) || costPrice < 0) {
        showFeedback('Cost Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!Number.isFinite(sellPrice) || sellPrice < 0) {
        showFeedback('Sell Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!Number.isFinite(minStockLevel) || minStockLevel < 0) {
        showFeedback('Minimum Stock must be a number of 0 or more.', 'error');
        return;
    }

    const fields = { costPrice, sellPrice, minStockLevel, supplier, categories, tagColor };

    // Diff against the item's current (pre-save) values BEFORE we mutate `item`
    // below, so the history captures exactly what this save changed.
    const currencyCode = getCachedUserProfile()?.currency || 'IDR';
    const changes = computeChanges(item, fields, currencyCode);

    const btn = document.getElementById('mi-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        await updateItemData(item.id, fields);
        updateLocalItem(item.id, fields);
        Object.assign(item, fields);

        // Log a history entry only when something actually changed.
        if (changes.length > 0) {
            try {
                await addMetaUpdateHistory(item.id, changes);
                loadMetaHistory(item.id, false);
            } catch (e) {
                console.error('History write failed:', e);
            }
        }

        // Rebuild the POS grid from the now-updated in-memory items so the
        // button reflects the new colour (and re-sorts) without a page reload.
        refreshGrid();

        // Refresh the selected card's swatch in the list.
        const cardEl = document.querySelector(`.mi-card[data-item-id="${item.id}"]`);
        if (cardEl) cardEl.querySelector('.mi-card__dot').style.backgroundColor = swatchFor(tagColor);

        document.getElementById('mi-detail-dot').style.backgroundColor = swatchFor(tagColor);
        showFeedback('Item updated successfully.', 'success');
    } catch (err) {
        console.error('Item update failed:', err);
        showFeedback('Failed to update item. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save Changes';
    }
}

//  Delete item

async function handleDelete() {
    const item = selection.get();
    if (!item) return;

    const confirmed = await showConfirm({
        title: 'Delete item?',
        message: `This will permanently delete "${item.itemName ?? 'this item'}". This cannot be undone.`,
        confirmText: 'Delete',
        danger: true,
    });
    if (!confirmed) return;

    const pinOk = await requireAdminPin();
    if (!pinOk) return;

    const btn = document.getElementById('mi-delete-btn');
    btn.disabled    = true;
    btn.textContent = 'Deleting...';

    try {
        await deleteInventoryItem(item.id);
        removeLocalItem(item.id);
        selection.clear();
        document.getElementById('mi-detail-view').classList.add('is-hidden');
        document.getElementById('mi-placeholder').classList.remove('is-hidden');
        document.getElementById('mi-save-btn').disabled = true;
        renderItemList_Manage(filteredItems = filteredItems.filter(i => i.id !== item.id));
        showToast(`Successfully delete item ${item.id}`);
        btn.textContent = 'Delete Item';
    } catch (err) {
        console.error('Item delete failed:', err);
        showFeedback('Failed to delete item. Please try again.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Delete Item';
    }
}

//  Feedback helpers

function showFeedback(msg, type) {
    const el = document.getElementById('mi-feedback');
    el.textContent = msg;
    el.className   = `mi-feedback mi-feedback--${type}`;
}

function clearFeedback() {
    const el = document.getElementById('mi-feedback');
    el.textContent = '';
    el.className   = 'mi-feedback';
}

//  Change history

async function loadMetaHistory(itemId, append) {
    const { docs, records } = await fetchMetaHistory(itemId, HISTORY_PAGE, append ? historyLastDoc : null);
    if (!append) historyLastDoc = null;
    if (docs.length > 0) historyLastDoc = docs[docs.length - 1];

    const moreBtn = document.getElementById('mi-history-more');
    moreBtn.classList.toggle('is-hidden', docs.length < HISTORY_PAGE);

    renderMetaHistory(records, append);
}

function renderMetaHistory(records, append) {
    const list = document.getElementById('mi-history-list');
    if (!append) list.replaceChildren();

    if (records.length === 0 && !append) {
        const empty = document.createElement('p');
        empty.className = 'mi-history__empty';
        empty.textContent = 'No changes yet.';
        list.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    records.forEach(r => {
        const row = document.createElement('div');
        row.className = 'mi-history__row';

        const ts = document.createElement('span');
        ts.className = 'mi-history__ts';
        ts.textContent = r.timestamp
            ? r.timestamp.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '—';
        row.appendChild(ts);

        const changes = document.createElement('div');
        changes.className = 'mi-history__changes';
        (r.changes ?? []).forEach(c => {
            const line = document.createElement('div');
            line.className = 'mi-history__change';

            const label = document.createElement('span');
            label.className = 'mi-history__field';
            label.textContent = c.label;

            const delta = document.createElement('span');
            delta.className = 'mi-history__delta';
            delta.textContent = `${c.from} → ${c.to}`;

            line.append(label, delta);
            changes.appendChild(line);
        });
        row.appendChild(changes);

        frag.appendChild(row);
    });
    list.appendChild(frag);
}

//  Open / load

async function openManageItem(user) {
    if (!user) return;

    selection.clear();
    document.getElementById('mi-detail-view').classList.add('is-hidden');
    document.getElementById('mi-save-btn').disabled = true;
    document.getElementById('mi-delete-btn').disabled = true;
    document.getElementById('mi-placeholder').classList.remove('is-hidden');
    document.getElementById('mi-search').value = '';
    

    // Set currency symbol from user profile
    const currency = getCachedUserProfile()?.currency || 'IDR';
    const symbol = getCurrencySymbol(currency);
    document.getElementById('mi-cost-currency').textContent = symbol;
    document.getElementById('mi-sell-currency').textContent = symbol;

    document.getElementById('mi-item-list').replaceChildren(buildItemSkeleton());

    try {
        await loadAllItems();
        filteredItems = [...allItems];
        renderItemList_Manage(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        const errMsg = document.createElement('p');
        errMsg.className = 'mi-empty mi-empty--error';
        errMsg.textContent = 'Failed to load inventory.';
        document.getElementById('mi-item-list').replaceChildren(errMsg);
    }
}

export function initManageItem(user) {
    const openBtn = document.getElementById('manage-item-open');
    if (!openBtn) return;

    buildThemeSwatches();

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('manage-item-modal');
        if (!user) return;
        openManageItem(user);
    });

    document.getElementById('mi-save-btn').addEventListener('click', handleSave);
    document.getElementById('mi-delete-btn').addEventListener('click', handleDelete);

    document.getElementById('mi-history-more').addEventListener('click', () => {
        if (historyItemId) loadMetaHistory(historyItemId, true);
    });

    attachListKeyNav({
        scope:       document.getElementById('manage-item-modal'),
        container:   document.getElementById('mi-item-list'),
        cardSelector: '.mi-card',
        searchInput: document.getElementById('mi-search'),
        getItems:    () => filteredItems,
        onOpen:      (item, card) => selectItem(item, card),
    });

    document.getElementById('mi-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q))
            : [...allItems];
        renderItemList_Manage(filteredItems);
    });
}
