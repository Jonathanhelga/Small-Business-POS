import { updateItemData, deleteInventoryItem, getCachedUserProfile, addMetaUpdateHistory, fetchMetaHistory, getCurrentCurrency as currentCurrency } from './firebase';
import { getCurrencySymbol, formatCurrency } from './formatCurrency';
import { attachMoneyInput, parseMoneyInput, formatMoneyInput } from './moneyInput';
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
import { endOfDayMs, toDateInputValue, promoRemaining } from './promo';
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
    document.querySelector(`#mi-edit-categories .mi-chip[data-category="${name}"]`)?.classList.toggle('mi-chip--active');
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    // Firestore Timestamp has toDate(); fall back to raw Date/string.
    const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', }).format(date);
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

    // Editable fields. The money inputs are masked, so load them grouped (1.500.000)
    // to match what typing into them produces.
    document.getElementById('mi-edit-cost').value     = item.costPrice == null ? '' : formatMoneyInput(String(item.costPrice), currentCurrency());
    document.getElementById('mi-edit-sell').value     = item.sellPrice == null ? '' : formatMoneyInput(String(item.sellPrice), currentCurrency());
    document.getElementById('mi-edit-min').value      = item.minStockLevel ?? '';
    document.getElementById('mi-edit-supplier').value = item.supplier ?? '';
    fillPromoFields(item.promo);
    selectedCategories = new Set(getItemCategories(item));
    buildCategoryChips();
    setActiveTheme(item.tagColor || 'primary');

    clearFeedback();

    historyLastDoc = null;
    historyItemId  = item.id;
    loadMetaHistory(item.id, false);
}

//  Promotion fields

function promoInputs() {
    return {
        pct:   document.getElementById('mi-edit-promo-pct'),
        ends:  document.getElementById('mi-edit-promo-ends'),
        total: document.getElementById('mi-edit-promo-total'),
        max:   document.getElementById('mi-edit-promo-max'),
    };
}

function fillPromoFields(promo) {
    const { pct, ends, total, max } = promoInputs();
    pct.value   = promo?.discountPct ?? '';
    ends.value  = toDateInputValue(promo?.endsAt);
    total.value = promo?.totalLimit ?? '';
    max.value   = promo?.maxDiscountedQty ?? '';

    renderPromoUsage(promo);
    document.getElementById('mi-promo-remove').disabled = !promo;
    setPctLocked(Boolean(promo));
}

// The discount rate is what usedQty counts against, so it is fixed for the life of
// a promotion. The other three rules stay editable: changing the cap, the per-order
// limit or the date never makes the existing count mean something different.
// Removing the promotion writes `promo: null`, which drops usedQty too, so the next
// promotion starts from a clean counter with the rate editable again.
function setPctLocked(locked) {
    promoInputs().pct.disabled = locked;
    document.getElementById('mi-promo-pct-lock').classList.toggle('is-hidden', !locked);
}

function clearPromoFields() {
    const { pct, ends, total, max } = promoInputs();
    pct.value = '';
    ends.value = '';
    total.value = '';
    max.value = '';
    renderPromoUsage(null);
    setPctLocked(false);
}

// The count can lag: `allItems` is loaded once per modal open, so it reflects
// the total as of that load. The order transaction is always exact; only this
// display can trail behind sales made on another device.
function renderPromoUsage(promo) {
    const el = document.getElementById('mi-promo-usage');
    if (!promo) { el.textContent = '—'; return; }

    const used  = Number(promo.usedQty) || 0;
    const limit = promo.totalLimit == null ? '∞' : promo.totalLimit;

    let state = '';
    if (promo.endsAt != null && Date.now() > Number(promo.endsAt)) state = ' (expired)';
    else if (promoRemaining(promo) === 0) state = ' (sold out)';

    el.textContent = `${used} / ${limit}${state}`;
}

// Read the four inputs back into a promo object.
//
// Returns { promo } on success or { error } with a message to show. A promo of
// null means "this item has no promotion", which is also how one gets removed:
// clear every field and save.
function readPromoFromForm() {
    const { pct, ends, total, max } = promoInputs();
    const rawPct   = pct.value.trim();
    const rawEnds  = ends.value.trim();
    const rawTotal = total.value.trim();
    const rawMax   = max.value.trim();

    if (!rawPct && !rawEnds && !rawTotal && !rawMax) return { promo: null };

    const discountPct = Number(rawPct);
    if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > 100) {
        return { error: 'Promotion discount must be a whole number between 1 and 100.' };
    }

    const maxDiscountedQty = Number(rawMax);
    if (!Number.isInteger(maxDiscountedQty) || maxDiscountedQty < 1) {
        return { error: 'Promotion "Max Per Order" must be a whole number of 1 or more.' };
    }

    const endsAt = endOfDayMs(rawEnds);
    if (endsAt == null)     return { error: 'Promotion needs a "Valid Until" date.' };
    if (endsAt < Date.now()) return { error: 'Promotion "Valid Until" date has already passed.' };

    // Blank means unlimited, so only validate the total when one was typed.
    let totalLimit = null;
    if (rawTotal) {
        totalLimit = Number(rawTotal);
        if (!Number.isInteger(totalLimit) || totalLimit < 1) {
            return { error: 'Promotion "Max Discounted Units" must be a whole number of 1 or more.' };
        }
    }

    return {
        promo: {
            discountPct,
            maxDiscountedQty,
            totalLimit,
            endsAt,
        },
    };
}

function promoWriteFields(promo) {
    if (promo == null) return { promo: null };
    return {
        'promo.discountPct':      promo.discountPct,
        'promo.maxDiscountedQty': promo.maxDiscountedQty,
        'promo.totalLimit':       promo.totalLimit,
        'promo.endsAt':           promo.endsAt,
    };
}

//  Change diffing

function themeName(token) {
    return (THEMES.find(t => t.token === token) || {}).name || token || '—';
}

// usedQty is deliberately left out: it moves on every sale, and the history is for changes the owner made, not for a running sales log.
function fmtPromo(promo) {
    if (!promo) return '(none)';
    const total = promo.totalLimit == null ? 'unlimited' : `${promo.totalLimit} total`;
    return `${promo.discountPct}% off, max ${promo.maxDiscountedQty}/order, ${total}, until ${formatTimestamp(promo.endsAt)}`;
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
        { key: 'promo',         label: 'Promotion',     format: fmtPromo },
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

    // parseMoneyInput reports a blank or unreadable field as invalid instead of 0.
    // Number('') is 0, which passed the old isFinite check, so clearing the cost field
    // used to save a silent 0 and report the whole sale as profit in the export.
    const cost          = parseMoneyInput(document.getElementById('mi-edit-cost').value, currentCurrency());
    const sell          = parseMoneyInput(document.getElementById('mi-edit-sell').value, currentCurrency());
    const costPrice     = cost.value;
    const sellPrice     = sell.value;
    const minStockLevel = parseFloat(document.getElementById('mi-edit-min').value);
    const supplier      = document.getElementById('mi-edit-supplier').value.trim();
    const categories    = [...selectedCategories];
    const tagColor      = selectedTheme;

    if (!cost.valid || costPrice < 0) {
        showFeedback('Cost Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!sell.valid || sellPrice < 0) {
        showFeedback('Sell Price must be a number of 0 or more.', 'error');
        return;
    }
    if (!Number.isFinite(minStockLevel) || minStockLevel < 0) {
        showFeedback('Minimum Stock must be a number of 0 or more.', 'error');
        return;
    }

    const { promo, error: promoError } = readPromoFromForm();
    if (promoError) {
        showFeedback(promoError, 'error');
        return;
    }

    const fields = { costPrice, sellPrice, minStockLevel, supplier, categories, tagColor, promo };

    // Diff against the item's current (pre-save) values BEFORE we mutate `item`
    // below, so the history captures exactly what this save changed.
    const currencyCode = getCachedUserProfile()?.currency || 'IDR';
    const changes = computeChanges(item, fields, currencyCode);

    const btn = document.getElementById('mi-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        const { promo: promoRules, ...rest } = fields;
        await updateItemData(item.id, { ...rest, ...promoWriteFields(promoRules) });

        // The local copy keeps a usedQty so the usage readout still renders. It
        // is only ever a guess, which is why it never leaves this device.
        const localFields = { ...fields, promo: promo && { ...promo, usedQty: Number(item.promo?.usedQty) || 0 } };
        updateLocalItem(item.id, localFields);
        Object.assign(item, localFields);

        // Re-sync the promo block so the usage readout and the Remove button
        // reflect what was just saved (a removal disables the button).
        fillPromoFields(item.promo);

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

//  Remove promotion

// Only empties the fields. Nothing is written until Save Changes, which is how
// every other edit in this panel behaves, so there is nothing to confirm here
// and nothing to undo beyond re-selecting the item.
function handlePromoRemove() {
    if (!selection.get()) return;
    clearPromoFields();
    document.getElementById('mi-promo-remove').disabled = true;
    showFeedback('Promotion cleared. Press Save Changes to confirm.', 'success');
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

    const pin = await requireAdminPin();
    if (!pin) return;

    const btn = document.getElementById('mi-delete-btn');
    btn.disabled    = true;
    btn.textContent = 'Deleting...';

    try {
        await deleteInventoryItem(item.id, pin);
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

    // Attached once at boot, not on each open, so the listener does not stack.
    attachMoneyInput(document.getElementById('mi-edit-cost'), currentCurrency);
    attachMoneyInput(document.getElementById('mi-edit-sell'), currentCurrency);

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('manage-item-modal');
        if (!user) return;
        openManageItem(user);
    });

    document.getElementById('mi-save-btn').addEventListener('click', handleSave);
    document.getElementById('mi-delete-btn').addEventListener('click', handleDelete);
    document.getElementById('mi-promo-remove').addEventListener('click', handlePromoRemove);

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
