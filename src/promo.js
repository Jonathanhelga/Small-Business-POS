//ITEM LEVEL PROMOTIONS

/*
a promo lives on the inventory item as `item.promo` and has four rules and 1 counter
1. discount Percentage
2. maxDiscountedQty
3. totalLimit
4. endsPromotionDate
5. usedQty
*/

import { roundToCurrency } from './formatCurrency';

export function endOfDayMs(dateString) {
    if (!dateString) return null;
    const [year, month, day] = String(dateString).split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day, 23, 59, 59, 999);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function toDateInputValue(endsAt){
    if (endsAt == null) return '';
    const date = new Date(Number(endsAt));
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function promoRemaining(promo) {
    if (!promo) return 0;
    if (promo.totalLimit == null) return Infinity;
    return Math.max(0, Number(promo.totalLimit) - (Number(promo.usedQty) || 0));
}

// Pulled out so the checkout transaction can run the same expiry check against
// server time (Tier 3, item 9) instead of only the device clock used for the
// client-side "is this promo still worth showing" check below.
export function isPromoExpired(promo, now = Date.now()) {
    return promo?.endsAt != null && now > Number(promo.endsAt);
}

export function isPromoActive(promo, now = Date.now()) {
    if (!promo) return false;

    const pct = Number(promo.discountPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return false;

    const perOrder = Number(promo.maxDiscountedQty);
    if (!Number.isFinite(perOrder) || perOrder < 1) return false;

    if (isPromoExpired(promo, now)) return false;

    return promoRemaining(promo) > 0;
}

// How many units of a line actually get the promo price. Two ceilings apply:
export function discountedQty(promo, quantity, now = Date.now()) {
    if (!isPromoActive(promo, now)) return 0;
    return Math.min(quantity, Number(promo.maxDiscountedQty), promoRemaining(promo));
}

// Cut a line into its discounted half and its full-price half. A line of 7 with
// a 20% promo capped at 5 comes back as 5 discounted units + 2 at full price.
// Both halves are always returned, so callers can render or total them without repeating the arithmetic.
// Both totals are rounded to the currency's smallest unit (IDR whole rupiah,
// USD cents, ...) so a percentage discount never leaves fractional-unit drift
// in a value that gets stored or summed into an order total.
export function promoSplit(price, quantity, promo, currencyCode = 'IDR', now = Date.now()) {
    const discounted = discountedQty(promo, quantity, now);
    const discountPct = discounted > 0 ? Number(promo.discountPct) : 0;
    const unitAfterDiscount = price * (1 - discountPct / 100);
    return {
        discountPct,
        discountedQty: discounted,
        discountedTotal: roundToCurrency(unitAfterDiscount * discounted, currencyCode),
        fullQty: quantity - discounted,
        fullTotal: roundToCurrency(price * (quantity - discounted), currencyCode),
    };
}

// Line total with the discount applied to the eligible units only; the rest of
// the line stays at full price.
export function promoLineTotal(price, quantity, promo, currencyCode = 'IDR', now = Date.now()) {
    const split = promoSplit(price, quantity, promo, currencyCode, now);
    return roundToCurrency(split.discountedTotal + split.fullTotal, currencyCode);
}


