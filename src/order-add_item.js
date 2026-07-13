import { toggleModal } from './modal-handler';
import { formatCurrency, getCurrencySymbol } from "./formatCurrency";
import { allItems, updateLocalStock } from "./search_item";
import { auth, submitOrder, upsertCustomerByPhone, saveOrderFieldDefinitions, getCachedUserProfile } from "./firebase";
import { refreshInsights } from './sales_insight';
import {
    openCustomerCheckout,
    closeCustomerCheckout,
    getCheckoutFormData,
    setCheckoutSubmitting,
} from './customer_checkout';
import { showToast } from './toast';
import { showConfirm } from './confirm_modal';

let orderedItems = [];
let selectedRowIndex = -1;
let taxRate = 0;

export function getOrderedItems(){ return orderedItems; }

export function setTaxRate(rate) {
    taxRate = parseFloat(rate) || 0;
    updateTotals();
}

export function getTaxRate() { return taxRate; }

function currentCurrency() { return getCachedUserProfile()?.currency || 'IDR'; }

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
    const stockItem = allItems.find(i => i.id === itemID);
    if (stockItem && itemQuantity > stockItem.stockLevel) {
        showToast(`Only ${stockItem.stockLevel} ${stockItem.unit || 'units'} available`, 'error');
        return;
    }
    const existingIndex = orderedItems.findIndex(item => item.name === itemName);
    if(existingIndex !== -1){
        orderedItems[existingIndex].quantity = itemQuantity;
        updateRow(existingIndex);
    }
    else{
        orderedItems.push({id: itemID, name: itemName, price: itemPrice, costPrice: costPrice, quantity: itemQuantity });
        appendRow(orderedItems.length - 1);
        if(orderedItems.length === 1){ fullRender(); }
    }
    updateTotals();
    persistOrder();
}

export function scanAddItem(itemID){
    const item = allItems.find(item => item.id === itemID);
    if (!item) return;
    if (item.stockLevel <= 0) { showToast(`${item.itemName} is out of stock`, 'error'); return; }

    const existingIndex = orderedItems.findIndex(item => item.id === itemID);
    if(existingIndex === -1){
        orderedItems.push({id: item.id, name: item.itemName, price: item.sellPrice, costPrice: item.costPrice, quantity: 1});
        appendRow(orderedItems.length - 1);
        if(orderedItems.length === 1){ fullRender(); }
    }
    else{
        const newQuantity = orderedItems[existingIndex].quantity + 1;
        if (newQuantity > item.stockLevel) {
            showToast(`Max stock reached (${item.stockLevel})`, 'error');
            return;
        }
        orderedItems[existingIndex].quantity = newQuantity;
        updateRow(existingIndex);
    }
    updateTotals();
    persistOrder();
    showToast(`${item.itemName} added`);
}

function fullRender(){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;
    if(orderedItems.length === 0){
        tableBody.replaceChildren();
        const row = document.createElement('tr');
        row.className = 'c-table__empty';
        const tableData = document.createElement('td');
        tableData.textContent = 'No Items Ordered Yet.';
        tableData.colSpan = 3;
        row.appendChild(tableData);
        tableBody.appendChild(row);
        return;
    }
    tableBody.replaceChildren();
    orderedItems.forEach((_, index) => appendRow(index));
}

function appendRow(index){
    const tableBody = document.getElementById('order-items');
    if(!tableBody) return;

    const item = orderedItems[index];
    const row = document.createElement('tr');
    row.id = rowIdFor(item.id)

    row.style.cursor = 'pointer';

    row.addEventListener('click', () => { handleRowClick(index, row); })

    row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openOrderItemModal(item.id)
    })
    const tdName = document.createElement('td');
    tdName.textContent = item.name;
    const tdQty = document.createElement('td');
    tdQty.textContent = item.quantity;
    const tdTotal = document.createElement('td');
    tdTotal.textContent = formatCurrency(item.price * item.quantity, currentCurrency());
    row.append(tdName, tdQty, tdTotal);

    tableBody.appendChild(row);
} 
function updateRow(index){
    const item = orderedItems[index];
    const row = document.getElementById(rowIdFor(item.id));
    if(!row){
        appendRow(index);
        return;
    }
    row.cells[1].textContent = item.quantity;
    row.cells[2].textContent = formatCurrency(item.price * item.quantity, currentCurrency());
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

    const removeBtn = document.getElementById('js-order-remove');
    if (removeBtn) removeBtn.disabled = true;
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
        if(orderedItems.length === 0){
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(orderedItems));
        }
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
        subtotal += item.price * item.quantity;
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
function rowIdFor(itemID){ return `order-row-${itemID}`; }

let lastSelectedRow = null;
function handleRowClick(index, rowElement){
    const removeBtn = document.getElementById('js-order-remove');

    if(lastSelectedRow === rowElement){
        rowElement.classList.remove('selected');
        selectedRowIndex  = -1;
        lastSelectedRow = null;
        if (removeBtn) removeBtn.disabled = true;
        return;
    }
    if(lastSelectedRow) { lastSelectedRow.classList.remove('selected'); }

    rowElement.classList.add('selected');
    selectedRowIndex = index;
    lastSelectedRow = rowElement;
    if (removeBtn) removeBtn.disabled = false;
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

    // Items added before costPrice existed have no cost recorded, so fall back to 0 rather than
    // letting undefined reach Firestore, which rejects the whole batch.
    const mappedItems = orderedItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        cost: item.costPrice ?? 0,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
    }));

    const subtotal = orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    const taxAmount = subtotalAfterDiscount * (taxRate / 100);
    const totalWithTax = subtotalAfterDiscount + taxAmount;

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
        currency: getCachedUserProfile()?.currency || 'IDR',
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

    // Best-effort: grow the reusable field library. A failure here must never
    // surface as an order error — the order is already committed.
    saveOrderFieldDefinitions(fieldDefinitions, user.uid).catch(err =>
        console.error("Failed to save custom field definitions to library:", err)
    );

    try {
        mappedItems.forEach(item => updateLocalStock(item.id, -item.quantity));
        clearOrderTable();
        refreshInsights(user);
        closeCustomerCheckout();
        showToast('Order submitted successfully!');
    } catch (err) {
        console.error("Post-submit local update failed:", err);
        mappedItems.forEach(item => updateLocalStock(item.id, item.quantity));
        showToast('Order was submitted, but display failed to update. Please refresh.', 'error');
    } finally {
        setCheckoutSubmitting(false, "Submit Order");
    }
}
