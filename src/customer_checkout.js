import { toggleModal } from './modal-handler';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';
import { getOrderedItems, getOrderSubtotal, getTaxRate } from './order-add_item';
import { promoSplit } from './promo';
import { auth, fetchCustomers, getCachedUserProfile, fetchUserProfile, getCurrentCurrency as currentCurrency } from './firebase';
import { initCustomFields, resetCustomFields, collectCustomFields, collectFieldDefinitions, renderSavedFields } from './checkout_custom_fields';

const MODAL_ID = 'customer-checkout-modal';
const CUSTOMER_FIELDS = ['js-checkout-customer-name', 'js-checkout-customer-phone'];

let customerCache = [];

export function initCustomerCheckout() {
    const discountInput = document.getElementById('js-checkout-discount');
    const select = document.getElementById('js-checkout-customer-select');
    if (!discountInput || !select) return;
    discountInput.addEventListener('input', recalcTotals);
    select.addEventListener('change', handleCustomerSelect);

    initCustomFields();
}

export async function openCustomerCheckout() {
    renderOrderRecap();
    resetDiscount();
    recalcTotals();
    resetCustomFields();
    await populateSavedFields();
    await populateCustomerDropdown();
    resetCustomerSelection();
    toggleModal(MODAL_ID);
}

export function closeCustomerCheckout() {
    // document.querySelector(`[data-modal-close="${MODAL_ID}"]`)?.click();
    toggleModal(MODAL_ID);
}


// Read the reusable field library off the user profile (cached after app init; fall back to a fetch) and render it into the Add-field menu.
async function populateSavedFields() {
    const profile = getCachedUserProfile() || (auth.currentUser && await fetchUserProfile(auth.currentUser.uid));
    renderSavedFields(profile?.orderFieldLibrary || []);
}

export function getCheckoutFormData() {
    const subtotal = getOrderSubtotal();
    const discountPct = clampDiscount(Number(document.getElementById('js-checkout-discount')?.value) || 0);
    const discountAmount = subtotal * (discountPct / 100);
    const selectedId = document.getElementById('js-checkout-customer-select')?.value || '';
    return {
        selectedCustomerId: selectedId,
        customer: {
            name: document.getElementById('js-checkout-customer-name')?.value.trim() || '',
            phone: document.getElementById('js-checkout-customer-phone')?.value.trim() || '',
        },
        orderNote: document.getElementById('js-checkout-order-note')?.value.trim() || '',
        customFields: collectCustomFields(),
        fieldDefinitions: collectFieldDefinitions(),
        discountPct,
        discountAmount,
    };
}

export function setCheckoutSubmitting(isSubmitting, label) {
    const submitBtn = document.getElementById('js-checkout-submit');
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    if (label !== undefined) submitBtn.textContent = label;
}

async function populateCustomerDropdown() {
    const user = auth.currentUser;
    if (!user) return;
    const select = document.getElementById('js-checkout-customer-select');
    if (!select) return;

    try {
        customerCache = await fetchCustomers(user.uid);
    } catch (err) {
        console.error('Failed to load customers:', err);
        customerCache = [];
    }

    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— New customer —';
    select.appendChild(placeholder);

    customerCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.phone ? `${c.name} • ${c.phone}` : c.name;
        select.appendChild(opt);
    });
}

function resetCustomerSelection() {
    const select = document.getElementById('js-checkout-customer-select');
    if (select) select.value = '';
    clearCustomerFields();
    setCustomerFieldsLocked(false);
    const noteEl = document.getElementById('js-checkout-order-note');
    if (noteEl) noteEl.value = '';
}

function handleCustomerSelect(e) {
    const id = e.target.value;
    if (!id) {
        clearCustomerFields();
        setCustomerFieldsLocked(false);
        return;
    }
    const customer = customerCache.find(c => c.id === id);
    if (!customer) return;
    setFieldValue('js-checkout-customer-name', customer.name || '');
    setFieldValue('js-checkout-customer-phone', customer.phone || '');
    setCustomerFieldsLocked(true);
}

function clearCustomerFields() {
    CUSTOMER_FIELDS.forEach(id => setFieldValue(id, ''));
}

function setCustomerFieldsLocked(locked) {
    CUSTOMER_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = locked;
    });
}

function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function renderOrderRecap() {
    const tbody = document.getElementById('js-checkout-recap-body');
    if (!tbody) return;
    tbody.replaceChildren();

    const items = getOrderedItems();
    if (items.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'c-checkout__recap-empty';
        td.textContent = 'No items in this order yet.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    items.forEach(item => tbody.appendChild(buildRecapRow(item)));
}

function buildRecapRow(item) {
    const tr = document.createElement('tr');
    const split = promoSplit(item.price, item.quantity, item.promo);

    const nameTd = document.createElement('td');
    nameTd.textContent = item.name;
    if (split.discountedQty > 0) {
        const note = document.createElement('span');
        note.className = 'c-checkout__recap-promo';
        note.textContent = split.discountedQty === item.quantity
            ? `${split.discountPct}% off`
            : `${split.discountPct}% off on ${split.discountedQty} of ${item.quantity}`;
        nameTd.appendChild(note);
    }

    const qtyTd = document.createElement('td');
    qtyTd.className = 'c-checkout__col-qty';
    qtyTd.textContent = `x${item.quantity}`;

    const subtotalTd = document.createElement('td');
    subtotalTd.className = 'c-checkout__col-subtotal';
    subtotalTd.textContent = formatCurrency(split.discountedTotal + split.fullTotal, currentCurrency());

    tr.appendChild(nameTd);
    tr.appendChild(qtyTd);
    tr.appendChild(subtotalTd);
    return tr;
}

function resetDiscount() {
    const discountInput = document.getElementById('js-checkout-discount');
    if (discountInput) discountInput.value = '';
}

function recalcTotals() {
    const subtotal = getOrderSubtotal();

    const discountInput = document.getElementById('js-checkout-discount');
    const discountPct = clampDiscount(Number(discountInput?.value) || 0);
    const discountAmount = subtotal * (discountPct / 100);
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    const taxRate = getTaxRate();
    const taxAmount = subtotalAfterDiscount * (taxRate / 100);
    const total = subtotalAfterDiscount + taxAmount;

    const currency = currentCurrency();
    const symbol = getCurrencySymbol(currency);
    setText('js-checkout-subtotal', `${symbol} ${formatCurrency(subtotal, currency)}`);
    setText('js-checkout-discount-amount', `- ${symbol} ${formatCurrency(discountAmount, currency)}`);
    setText('js-checkout-tax-label', taxRate);
    setText('js-checkout-tax-amount', `${symbol} ${formatCurrency(taxAmount, currency)}`);
    setText('js-checkout-total', `${symbol} ${formatCurrency(total, currency)}`);
}

function clampDiscount(value) {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
