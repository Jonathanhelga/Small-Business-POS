// Single source of truth for the payment methods a checkout can be tagged
// with. Kept as its own module since firebase.js (validation on write),
// customer_checkout.js (the picker UI), order_history.js (display + filter)
// and sales_insight.js (revenue breakdown) all need the same enum/labels.
export const PAYMENT_METHODS = ['cash', 'transfer', 'card'];

export const PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    transfer: 'Transfer',
    card: 'Card',
};

export const DEFAULT_PAYMENT_METHOD = PAYMENT_METHODS[0];

export function isValidPaymentMethod(method) {
    return PAYMENT_METHODS.includes(method);
}
