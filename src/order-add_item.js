import { toggleModal } from './modal-handler';
import { formatCurrency, getCurrencySymbol, roundToCurrency } from "./formatCurrency";
import { allItems, updateLocalStock, updateLocalPromoUsage } from "./search_item";
import { auth, submitOrder, upsertCustomerByPhone, saveOrderFieldDefinitions, getCachedUserProfile, getCurrentCurrency as currentCurrency } from "./firebase";
import { refreshInsights } from './sales_insight';
import {
    openCustomerCheckout,
    closeCustomerCheckout,
    getCheckoutFormData,
    setCheckoutSubmitting,
} from './customer_checkout';
import { showToast } from './toast';
import { showConfirm } from './confirm_modal';
import { discountedQty, promoSplit, promoLineTotal } from './promo';

let orderedItems = [];
let selectedRowIndex = -1;
let taxRate = 0;

export function getOrderedItems(){ return orderedItems; }

export function setTaxRate(rate) {
    taxRate = parseFloat(rate) || 0;
    updateTotals();
}

export function getTaxRate() { return taxRate; }

export function openOrderItemModal(itemID) {
    const item = allItems.find(item => item.id === itemID); 
    if (!item) { return; }

    let matchedItem = orderedItems.find(o => o.id === itemID);
    document.getElementById('js-order-qty').value = matchedItem ? matchedItem.quantity : 1;
    document.getElementById('js-order-qty').max = item.stockLevel;

    document.getElementById('js-current-item-id').value = item.id;
    document.getElementById('order-item-sku').textContent = item.sku || '';
    document.getElementById('order-item-name').textContent = item.itemName;
    document.getElementById('order-item-stock').textContent = item.stockLevel;
    document.getElementById('order-item-price').textContent = `${getCurrencySymbol(currentCurrency())} ${formatCurrency(item.sellPrice, currentCurrency())}`;
    document.getElementById('order-item-unit').textContent = ' ' + item.unit;

    toggleModal('order-item-modal');

    // Move focus into the quantity field so the user can type a quantity and  press Enter to submit immediately (HTML implicit form submission)
    const qtyInput = document.getElementById('js-order-qty');
    requestAnimationFrame(() => { qtyInput.focus(); qtyInput.select(); });
}

export function initializeOrderForm(){
    const form = document.getElementById('js-order-item-form');
    if(form){
        fullRender();
        orderModifier();
        updateTotals();
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            
            const itemId = document.getElementById('js-current-item-id').value; //is the itemID
            const quantity = parseFloat(document.getElementById('js-order-qty').value) || 1;
            const item = allItems.find(item => item.id === itemId);
            if (!item) return;
            
            addItemToOrder(item.id, item.itemName, item.sellPrice, item.costPrice, quantity);
            toggleModal('order-item-modal');
        });
    }
}

export function addItemToOrder(itemID, itemName, itemPrice, costPrice, itemQuantity){
    const itemInfo = allItems.find(i => i.id === itemID);
    const itemPromo = itemInfo?.promo ?? null;
    if (itemInfo && itemQuantity > itemInfo.stockLevel) {
        showToast(`Only ${itemInfo.stockLevel} ${itemInfo.unit || 'units'} available`, 'error');
        return;
    }
    const existingIndex = orderedItems.findIndex(item => item.id === itemID);
    if(existingIndex !== -1){
        orderedItems[existingIndex].quantity = itemQuantity;
    }
    else{
        orderedItems.push({id: itemID, name: itemName, price: itemPrice, costPrice: costPrice, quantity: itemQuantity, promo: itemPromo});
    }
    fullRender();
    updateTotals();
    persistOrder();
}

export function scanAddItem(itemID){
    const item = allItems.find(item => item.id === itemID);
    if (!item) return;
    if (item.stockLevel <= 0) { showToast(`${item.itemName} is out of stock`, 'error'); return; }

    const existingIndex = orderedItems.findIndex(item => item.id === itemID);
    if(existingIndex === -1){
        orderedItems.push({id: item.id, name: item.itemName, price: item.sellPrice, costPrice: item.costPrice, quantity: 1, promo: item.promo ?? null});
    }
    else{
        const newQuantity = orderedItems[existingIndex].quantity + 1;
        if (newQuantity > item.stockLevel) {
            showToast(`Max stock reached (${item.stockLevel})`, 'error');
            return;
        }
        orderedItems[existingIndex].quantity = newQuantity;
    }
    fullRender();
    updateTotals();
    persistOrder();
    showToast(`${item.itemName} added`);
}

function fullRender(){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;
    tableBody.replaceChildren();

    if(orderedItems.length === 0){
        const row = document.createElement('tr');
        row.className = 'c-table__empty';
        const tableData = document.createElement('td');
        tableData.textContent = 'No Items Ordered Yet.';
        tableData.colSpan = 4;
        row.appendChild(tableData);
        tableBody.appendChild(row);
    } else {
        const fragment = document.createDocumentFragment();
        displayRows().forEach(line => fragment.appendChild(buildRow(line)));
        tableBody.appendChild(fragment);
    }
    applySelectionStyles();
}

// The cart holds one entry per item, but a partly-discounted item needs two
// table rows: the units the promo covers, then the remainder at full price.
// Both rows point back at the same cart entry through `index`, so clicking,
// removing or editing either one acts on the whole item.
function displayRows(){
    const rows = [];
    orderedItems.forEach((item, index) => {
        const split = promoSplit(item.price, item.quantity, item.promo, currentCurrency());
        if(split.discountedQty > 0){
            rows.push({ index, item, quantity: split.discountedQty, discountPct: split.discountPct, total: split.discountedTotal });
        }
        if(split.fullQty > 0 || split.discountedQty === 0){
            rows.push({ index, item, quantity: split.fullQty, discountPct: 0, total: split.fullTotal });
        }
        rows[rows.length - 1].isLastOfItem = true;
    });
    return rows;
}

function buildRow(line){
    const row = document.createElement('tr');
    row.dataset.itemIndex = String(line.index);
    if(line.discountPct > 0) row.classList.add('c-table__row--promo');
    if(line.isLastOfItem) row.classList.add('c-table__row--group-end');

    row.addEventListener('click', () => { handleRowClick(line.index); })

    row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openOrderItemModal(line.item.id)
    })

    const tdName = document.createElement('td');
    tdName.textContent = line.item.name;
    const tdQty = document.createElement('td');
    tdQty.textContent = line.quantity;
    const tdDiscount = document.createElement('td');
    tdDiscount.className = 'c-table__discount';
    tdDiscount.textContent = `${line.discountPct}%`;
    const tdTotal = document.createElement('td');
    tdTotal.textContent = formatCurrency(line.total, currentCurrency());
    row.append(tdName, tdQty, tdDiscount, tdTotal);
    return row;
}

function lineTotal(item){
    return promoLineTotal(item.price, item.quantity, item.promo, currentCurrency());
}

export function getOrderSubtotal(){
    return orderedItems.reduce((sum, item) => sum + lineTotal(item), 0);
}

function orderModifier(){
    const resetButton = document.getElementById('js-order-reset');
    const removeButton = document.getElementById('js-order-remove');
    resetButton.addEventListener('click', () => { resetOrderTable(); })
    removeButton.addEventListener('click', () => { removeSelectedItem(); })
    document.addEventListener('keydown', handleDeleteKey);
}

function handleDeleteKey(e){
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (selectedRowIndex === -1) return;
    if (isTypingTarget(document.activeElement)) return;
    e.preventDefault();
    removeSelectedItem();
}

function isTypingTarget(el){
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;
}

function removeSelectedItem(){
    if(selectedRowIndex === -1) { return; }

    orderedItems.splice(selectedRowIndex, 1);
    selectedRowIndex = -1;

    fullRender();
    updateTotals();
    persistOrder();
}
async function resetOrderTable() {                                                                                                            
    const ok = await showConfirm({                 
        title: 'Reset order?',                                                                                                                                   
        message: 'This will clear all items in the current order.',                                                                                              
        confirmText: 'Reset',                                      
        danger: true,                                                                                                                                            
    });                                                                                                                                                        
    if (!ok) return;
    orderedItems = [];
    selectedRowIndex = -1;
    fullRender();
    updateTotals();
    persistOrder();
}

export function clearOrderTable(){
    orderedItems = [];
    selectedRowIndex = -1;
    fullRender();
    updateTotals();
    persistOrder();
}

// The cart is autosaved to localStorage so an accidental reload or tab close does not wipe an in-progress order. We store the orderedItems array (the data),
function storageKey(){
    const uid = auth.currentUser?.uid;
    return uid ? `pos-order-draft-${uid}` : null;
}

function persistOrder(){
    const key = storageKey();
    if(!key) return;
    try{
        if(orderedItems.length === 0){ localStorage.removeItem(key); } 
        else { localStorage.setItem(key, JSON.stringify(orderedItems)); }
    } catch(err){
        console.error('Failed to persist order draft:', err);
    }
}

export function restoreOrderFromStorage(){
    const key = storageKey();
    if(!key) return;

    let saved;
    try{
        const raw = localStorage.getItem(key);
        if(!raw) return;
        saved = JSON.parse(raw);
    } catch(err){
        console.error('Failed to read order draft:', err);
        return;
    }

    if(!Array.isArray(saved)){
        try{ localStorage.removeItem(key); } catch(_){}
        return;
    }

    let adjusted = false;
    const reconciled = [];
    saved.forEach(line => {
        const live = allItems.find(i => i.id === line.id);
        // Drop items that were deleted from inventory or are now out of stock.
        if(!live || live.stockLevel <= 0){
            adjusted = true;
            return;
        }
        const quantity = Math.min(line.quantity, live.stockLevel);
        if(quantity !== line.quantity) adjusted = true;
        // Refresh name/price/cost from the live item so the cart reflects current inventory (and scanned lines saved without costPrice get repaired).
        reconciled.push({
            id: live.id,
            name: live.itemName,
            price: live.sellPrice,
            costPrice: live.costPrice,
            promo: live.promo ?? null,
            quantity,
        });
    });

    orderedItems = reconciled;
    selectedRowIndex = -1;
    fullRender();
    updateTotals();
    persistOrder();

    if(reconciled.length === 0){ if(adjusted) showToast('Your saved order items are no longer available.', 'info'); return; }
    if(adjusted){ showToast('Restored your order. Some items were adjusted to current stock.', 'info');} 
    else { showToast('Restored your previous order.'); }
}

function updateTotals(){
    let subtotal = 0;
    let totalQty = 0;
    orderedItems.forEach(item => {
        subtotal += lineTotal(item);
        totalQty += item.quantity;
    });
    const taxAmount = subtotal * (taxRate / 100);
    const totalWithTax = subtotal + taxAmount;

    const currency = currentCurrency();
    const symbol = getCurrencySymbol(currency);
    document.getElementById('order-total-items').textContent = totalQty;
    document.getElementById('order-total-price').textContent = `${symbol} ${formatCurrency(subtotal, currency)}`;
    document.getElementById('order-tax-label').textContent = taxRate;
    document.getElementById('order-tax-amount').textContent = `${symbol} ${formatCurrency(taxAmount, currency)}`;
    document.getElementById('order-with-tax').textContent = `${symbol} ${formatCurrency(totalWithTax, currency)}`;
}
// Selection tracks the cart entry, not the row element, so a split item
// highlights both of its rows and either one can be clicked to deselect.
function handleRowClick(index){
    selectedRowIndex = selectedRowIndex === index ? -1 : index;
    applySelectionStyles();
}

function applySelectionStyles(){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;
    Array.from(tableBody.rows).forEach(row => {
        row.classList.toggle('selected', Number(row.dataset.itemIndex) === selectedRowIndex);
    });
    const removeBtn = document.getElementById('js-order-remove');
    if (removeBtn) removeBtn.disabled = selectedRowIndex === -1;
    updateHint();
}

function updateHint(){
    const hint = document.getElementById('order-edit-hint');
    if(!hint) return;

    hint.hidden = orderedItems.length === 0;
    hint.textContent = selectedRowIndex === -1
        ? 'Click a row to select it'
        : 'Double-click to edit quantity, Delete to remove';
}

export async function initSubmitOrder(){
    const printBillBtn = document.getElementById('js-order-submit');
    const checkoutForm = document.getElementById('js-customer-checkout-form');
    if (!printBillBtn || !checkoutForm) return;

    printBillBtn.addEventListener('click', handlePrintBillClick);
    checkoutForm.addEventListener('submit', handleCheckoutFormSubmit);
}

function handlePrintBillClick() {
    if (orderedItems.length === 0) {
        showToast('No items in the order yet.', 'error');
        return;
    }
    if (!auth.currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }
    openCustomerCheckout();
}

async function handleCheckoutFormSubmit(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { showToast('Session expired. Please log in again.', 'error'); return; }
    if (orderedItems.length === 0) { showToast('No items in the order yet.', 'error'); return; }

    const { selectedCustomerId, customer, orderNote, customFields, fieldDefinitions, discountPct, discountAmount } = getCheckoutFormData();

    let customerId = selectedCustomerId;
    let customerSnapshot = customer;
    const hasCustomerInfo = customer.name || customer.phone;
    if (!customerId && hasCustomerInfo) {
        try {
            const saved = await upsertCustomerByPhone(customer, user.uid);
            customerId = saved.id;
            customerSnapshot = { name: saved.name, phone: saved.phone };
        } catch (err) {
            console.error("Failed to save customer:", err);
            showToast("Couldn't save customer info, continuing with order.", 'error');
        }
    }

    // `subtotal` is what the line actually costs, promo included, so order
    // history, insights and profit all read the discounted figure.
    const mappedItems = orderedItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        cost: item.costPrice ?? 0,
        quantity: item.quantity,
        subtotal: lineTotal(item),
        promoDiscountPct: discountedQty(item.promo, item.quantity) > 0 ? Number(item.promo.discountPct) : 0,
        promoDiscountedQty: discountedQty(item.promo, item.quantity),
    }));

    const currency = getCachedUserProfile()?.currency || 'IDR';
    const subtotal = mappedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const subtotalAfterDiscount = roundToCurrency(Math.max(0, subtotal - discountAmount), currency);
    const taxAmount = roundToCurrency(subtotalAfterDiscount * (taxRate / 100), currency);
    const totalWithTax = roundToCurrency(subtotalAfterDiscount + taxAmount, currency);

    const orderPayload = {
        items: mappedItems,
        totalQuantity: orderedItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        discountPct,
        discountAmount,
        subtotalAfterDiscount,
        taxRate,
        taxAmount,
        totalPrice: totalWithTax,
        currency,
        customerId: customerId || null,
        customer: customerSnapshot,
        orderNote,
        customFields
    };

    setCheckoutSubmitting(true, "Submitting...");

    try {
        await submitOrder(orderPayload, user.uid);
    } catch (err) {
        console.error("Order submission failed:", err);
        const userMessage = err.code === 'permission-denied'
            ? "You don't have permission to submit orders."
            : err.code === 'not-found'
            ? "One or more items no longer exist in inventory."
            : err.message;
        showToast(`Failed to submit order: ${userMessage}`, 'error');
        setCheckoutSubmitting(false, "Submit Order");
        return;
    }

    saveOrderFieldDefinitions(fieldDefinitions, user.uid).catch(err =>
        console.error("Failed to save custom field definitions to library:", err)
    );

    try {
        mappedItems.forEach(item => {
            updateLocalStock(item.id, -item.quantity);
            updateLocalPromoUsage(item.id, item.promoDiscountedQty);
        });
        clearOrderTable();
        refreshInsights(user);
        closeCustomerCheckout();
        showToast('Order submitted successfully!');
    } catch (err) {
        console.error("Post-submit local update failed:", err);
        mappedItems.forEach(item => {
            updateLocalStock(item.id, item.quantity);
            updateLocalPromoUsage(item.id, -item.promoDiscountedQty);
        });
        showToast('Order was submitted, but display failed to update. Please refresh.', 'error');
    } finally {
        setCheckoutSubmitting(false, "Submit Order");
    }
}
