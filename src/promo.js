//ITEM LEVEL PROMOTIONS

/*
a promo lives on the inventory item as `item.promo` and has four rules and 1 counter
1. discount Percentage
2. maxDiscountedQty
3. totalLimit
4. endsPromotionDate
5. usedQty
*/

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

export function isPromoActive(promo, now = Date.now()) {
    if (!promo) return false;

    const pct = Number(promo.discountPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return false;

    const perOrder = Number(promo.maxDiscountedQty);
    if (!Number.isFinite(perOrder) || perOrder < 1) return false;

    if (promo.endsAt != null && now > Number(promo.endsAt)) return false;

    return promoRemaining(promo) > 0;
}


