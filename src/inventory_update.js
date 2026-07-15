import { db, getCurrentCurrency as currentCurrency, addStockUpdateHistory, fetchStockHistory } from './firebase';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { toggleModal } from './modal-handler';
import { allItems, loadAllItems, updateLocalStock } from './search_item';
import { createSelection } from './selection';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';
import { skeletonBar } from './skeleton';
import { attachListKeyNav } from './listKeyNav';

let filteredItems = [];
const selection   = createSelection();

const HISTORY_PAGE = 5;
let historyLastDoc = null;
let historyItemId  = null;

function getStockStatus(current, min) {
    return Number(current ?? 0) >= Number(min ?? 0) ? 'good' : 'alert';
}

// ─── Render item list

function renderItemList_Inventory(items) {
    const container = document.getElementById('iu-item-list');
    container.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'iu-empty';
        empty.textContent = 'No items found.';
        container.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const status = getStockStatus(item.stockLevel, item?.minStockLevel || 0);
        const card = document.createElement('div');
        card.className = 'iu-card';
        card.dataset.itemId = item.id;

        const topRow = document.createElement('div');
        topRow.className = 'iu-card__top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'iu-card__name';
        nameSpan.textContent = item.itemName ?? '—';
        const badge = document.createElement('span');
        badge.className = `iu-badge iu-badge--${status}`;
        badge.textContent = status === 'good' ? 'GOOD' : 'ALERT';
        topRow.append(nameSpan, badge);

        const bottomRow = document.createElement('div');
        bottomRow.className = 'iu-card__bottom';
        const skuSpan = document.createElement('span');
        skuSpan.className = 'iu-card__sku';
        skuSpan.textContent = item.sku ?? '—';
        const stockInfo = document.createElement('span');
        stockInfo.className = 'iu-card__stock-info';
        const unitSpan = document.createElement('span');
        unitSpan.className = 'iu-card__unit';
        unitSpan.textContent = item.unit ?? '';
        stockInfo.append(
            document.createTextNode(`${item.stockLevel ?? 0} `),
            unitSpan,
            document.createTextNode(` \u00a0/\u00a0 min ${item.minStockLevel ?? 0}`)
        );
        bottomRow.append(skuSpan, stockInfo);

        card.append(topRow, bottomRow);

        card.addEventListener('click', () => selectItem(item, card));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// Placeholder cards mirroring .iu-card, shown while inventory loads.
function buildItemSkeleton_Inventory(count = 5) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'iu-card is-skeleton';

        const topRow = document.createElement('div');
        topRow.className = 'iu-card__top';
        topRow.append(skeletonBar('40%', '1rem'), skeletonBar('10%', '1rem'));

        const bottomRow = document.createElement('div');
        bottomRow.className = 'iu-card__bottom';
        bottomRow.append(skeletonBar('30%', '0.8rem'), skeletonBar('10%', '0.5rem'));

        card.append(topRow, bottomRow);
        frag.appendChild(card);
    }
    return frag;
}


// ─── Select item 

function selectItem(item, cardEl) {
    document.querySelectorAll('.iu-card').forEach(c => c.classList.remove('iu-card--active'));
    cardEl.classList.add('iu-card--active');
    selection.set(item);
    populateDetail(item);
    
}

// ─── Populate right panel 

function populateDetail(item) {
    document.getElementById('iu-placeholder').classList.add('is-hidden');
    document.getElementById('iu-detail-view').classList.remove('is-hidden');

    const status = getStockStatus(item.stockLevel, item?.minStockLevel || 0);
    const badgeEl = document.getElementById('iu-status-badge');
    badgeEl.textContent = status === 'good' ? 'GOOD' : 'ALERT';
    badgeEl.className = `iu-detail-badge iu-badge--${status}`;

    const tagDot = document.getElementById('iu-detail-tag');
    tagDot.className = `iu-detail-tag iu-tag--${status === 'good' ? 'good' : 'alert'}`;

    document.getElementById('iu-detail-name').textContent = item.itemName ?? '—';
    document.getElementById('iu-detail-sku').textContent  = `SKU: ${item.sku ?? '—'}`;

    document.getElementById('iu-current-stock').textContent = `${item.stockLevel ?? 0} ${item.unit ?? ''}`;
    document.getElementById('iu-min-stock').textContent     = `${item.minStockLevel ?? 0} ${item.unit ?? ''}`;
    document.getElementById('iu-unit').textContent          = item.unit || '—';
    document.getElementById('iu-supplier').textContent      = item.supplier || '—';

    const currency = currentCurrency();
    const symbol = getCurrencySymbol(currency);
    document.getElementById('iu-cost-price').textContent = `${symbol} ${formatCurrency(item.costPrice, currency)}`;
    document.getElementById('iu-sell-price').textContent = `${symbol} ${formatCurrency(item.sellPrice, currency)}`;

    document.getElementById('iu-incoming-qty').value = '';
    clearFeedback();

    historyLastDoc = null;
    historyItemId  = item.id;
    loadStockHistory(item.id, false);
}

// ─── Save stock update

async function handleSave() {
    const item = selection.get();
    if (!item) return;

    const input = document.getElementById('iu-incoming-qty');
    const qty   = Number(input.value);

    if (!Number.isInteger(qty) || qty <= 0) {
        showFeedback('Please enter a valid whole number greater than 0.', 'error');
        return;
    }

    const btn = document.getElementById('iu-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        const previousStock = item.stockLevel ?? 0;

        await updateDoc(doc(db, 'inventory', item.id), {
            stockLevel:  increment(qty),
            lastUpdated: serverTimestamp(),
        });

        try {
            await addStockUpdateHistory(item.id, qty, previousStock);
        } catch (e) {
            console.error('History write failed:', e);
        }

        updateLocalStock(item.id, qty);

        // Refresh the card in the list
        const cardEl = document.querySelector(`.iu-card[data-item-id="${item.id}"]`);
        if (cardEl) {
            const status = getStockStatus(item.stockLevel, item.minStockLevel);
            cardEl.querySelector('.iu-badge').textContent = status === 'good' ? 'GOOD' : 'ALERT';
            cardEl.querySelector('.iu-badge').className   = `iu-badge iu-badge--${status}`;
            const stockInfoEl = cardEl.querySelector('.iu-card__stock-info');
            const updatedUnitSpan = document.createElement('span');
            updatedUnitSpan.className = 'iu-card__unit';
            updatedUnitSpan.textContent = item.unit ?? '';
            stockInfoEl.replaceChildren(
                document.createTextNode(`${item.stockLevel} `),
                updatedUnitSpan,
                document.createTextNode(` \u00a0/\u00a0 min ${item.minStockLevel ?? 0}`)
            );
        }

        populateDetail(item);
        input.value = '';
        showFeedback( `Added ${qty} ${item.unit ?? 'units'}. New stock: ${item.stockLevel}.`, 'success');

    } catch (err) {
        console.error('Stock update failed:', err);
        showFeedback('Failed to update stock. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save';
    }
}

// ─── Feedback helpers 

function showFeedback(msg, type) {
    const el = document.getElementById('iu-feedback');
    el.textContent = msg;
    el.className   = `iu-feedback iu-feedback--${type}`;
}

function clearFeedback() {
    const el = document.getElementById('iu-feedback');
    el.textContent = '';
    el.className   = 'iu-feedback';
}

// ─── Stock update history

async function loadStockHistory(itemId, append) {
    const { docs, records } = await fetchStockHistory(itemId, HISTORY_PAGE, append ? historyLastDoc : null);
    if (!append) historyLastDoc = null;
    if (docs.length > 0) historyLastDoc = docs[docs.length - 1];

    const moreBtn = document.getElementById('iu-history-more');
    moreBtn.classList.toggle('is-hidden', docs.length < HISTORY_PAGE);

    renderStockHistory(records, append);
}

function renderStockHistory(records, append) {
    const list = document.getElementById('iu-history-list');
    if (!append) list.replaceChildren();

    if (records.length === 0 && !append) {
        const empty = document.createElement('p');
        empty.className = 'iu-history__empty';
        empty.textContent = 'No stock updates yet.';
        list.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    records.forEach(r => {
        const row = document.createElement('div');
        row.className = 'iu-history__row';

        const ts = document.createElement('span');
        ts.className = 'iu-history__ts';
        ts.textContent = r.timestamp
            ? r.timestamp.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '—';

        const delta = document.createElement('span');
        delta.className = 'iu-history__delta';
        delta.textContent = `+${r.qtyAdded}`;

        const trail = document.createElement('span');
        trail.className = 'iu-history__trail';
        trail.textContent = `${r.previousStock} → ${r.previousStock + r.qtyAdded}`;

        row.append(ts, delta, trail);
        frag.appendChild(row);
    });
    list.appendChild(frag);
}

// ─── Load inventory on open

async function openInventoryUpdate(user) {
    if (!user) return;

    // Reset panel state
    selection.clear();
    document.getElementById('iu-detail-view').classList.add('is-hidden');
    document.getElementById('iu-placeholder').classList.remove('is-hidden');
    document.getElementById('iu-search').value = '';

    document.getElementById('iu-item-list').replaceChildren(buildItemSkeleton_Inventory());
    try {
        await loadAllItems();
        filteredItems = [...allItems];
        renderItemList_Inventory(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        const errMsg = document.createElement('p');
        errMsg.className = 'iu-empty iu-empty--error';
        errMsg.textContent = 'Failed to load inventory.';
        document.getElementById('iu-item-list').replaceChildren(errMsg);
    }
}

export function initInventoryUpdate(user) {
    const openBtn = document.getElementById('inventory-update-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('inventory-update-modal');
        if (!user) return;

        openInventoryUpdate(user);
    });

    document.getElementById('iu-save-btn').addEventListener('click', handleSave);

    attachListKeyNav({
        scope:       document.getElementById('inventory-update-modal'),
        container:   document.getElementById('iu-item-list'),
        cardSelector: '.iu-card',
        searchInput: document.getElementById('iu-search'),
        getItems:    () => filteredItems,
        onOpen:      (item, card) => selectItem(item, card),
    });

    document.getElementById('iu-history-more').addEventListener('click', () => {
        if (historyItemId) loadStockHistory(historyItemId, true);
    });

    document.getElementById('iu-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku ?? '').toLowerCase().includes(q))
            : [...allItems];
        renderItemList_Inventory(filteredItems);
    });
}
