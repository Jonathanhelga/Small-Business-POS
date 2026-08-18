import { describe, it, expect } from 'vitest';
import {
    endOfDayMs,
    toDateInputValue,
    promoRemaining,
    isPromoActive,
    discountedQty,
    promoSplit,
    promoLineTotal,
} from './promo';

const activePromo = (overrides = {}) => ({
    discountPct: 20,
    maxDiscountedQty: 5,
    totalLimit: 10,
    usedQty: 0,
    endsAt: null,
    ...overrides,
});

describe('endOfDayMs', () => {
    it('returns the millisecond timestamp of 23:59:59.999 on the given date', () => {
        const ms = endOfDayMs('2026-08-19');
        const date = new Date(ms);
        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(7);
        expect(date.getDate()).toBe(19);
        expect(date.getHours()).toBe(23);
        expect(date.getMinutes()).toBe(59);
    });

    it('returns null for an empty/invalid input', () => {
        expect(endOfDayMs('')).toBeNull();
        expect(endOfDayMs(null)).toBeNull();
        expect(endOfDayMs('not-a-date')).toBeNull();
    });
});

describe('toDateInputValue', () => {
    it('round-trips a timestamp back into a yyyy-mm-dd string', () => {
        const ms = endOfDayMs('2026-08-19');
        expect(toDateInputValue(ms)).toBe('2026-08-19');
    });

    it('returns an empty string for null/invalid input', () => {
        expect(toDateInputValue(null)).toBe('');
        expect(toDateInputValue('garbage')).toBe('');
    });
});

describe('promoRemaining', () => {
    it('returns the gap between totalLimit and usedQty', () => {
        expect(promoRemaining(activePromo({ totalLimit: 10, usedQty: 4 }))).toBe(6);
    });

    it('never goes negative when usedQty exceeds totalLimit', () => {
        expect(promoRemaining(activePromo({ totalLimit: 10, usedQty: 15 }))).toBe(0);
    });

    it('returns Infinity when there is no totalLimit', () => {
        expect(promoRemaining(activePromo({ totalLimit: null }))).toBe(Infinity);
    });

    it('returns 0 for a missing promo', () => {
        expect(promoRemaining(null)).toBe(0);
    });
});

describe('isPromoActive', () => {
    it('is active for a well-formed promo with remaining allowance', () => {
        expect(isPromoActive(activePromo())).toBe(true);
    });

    it('is inactive once totalLimit is exhausted', () => {
        expect(isPromoActive(activePromo({ totalLimit: 5, usedQty: 5 }))).toBe(false);
    });

    it('is inactive past its end date', () => {
        const promo = activePromo({ endsAt: Date.now() - 1000 });
        expect(isPromoActive(promo)).toBe(false);
    });

    it('is inactive for a non-positive or out-of-range discount percentage', () => {
        expect(isPromoActive(activePromo({ discountPct: 0 }))).toBe(false);
        expect(isPromoActive(activePromo({ discountPct: 150 }))).toBe(false);
    });

    it('is inactive when maxDiscountedQty is missing or below 1', () => {
        expect(isPromoActive(activePromo({ maxDiscountedQty: 0 }))).toBe(false);
    });

    it('is inactive for a null promo', () => {
        expect(isPromoActive(null)).toBe(false);
    });
});

describe('discountedQty', () => {
    it('caps at the smallest of quantity, maxDiscountedQty, and remaining allowance', () => {
        const promo = activePromo({ maxDiscountedQty: 3, totalLimit: 10, usedQty: 0 });
        expect(discountedQty(promo, 7)).toBe(3);
    });

    it('is capped by remaining promo allowance even below maxDiscountedQty', () => {
        const promo = activePromo({ maxDiscountedQty: 5, totalLimit: 10, usedQty: 8 });
        expect(discountedQty(promo, 7)).toBe(2);
    });

    it('returns 0 for an inactive promo', () => {
        expect(discountedQty(null, 7)).toBe(0);
    });
});

describe('promoSplit', () => {
    it('splits a line of 7 with a 20% promo capped at 5 into 5 discounted + 2 full-price', () => {
        const promo = activePromo({ discountPct: 20, maxDiscountedQty: 5, totalLimit: 100 });
        const split = promoSplit(10000, 7, promo);
        expect(split.discountedQty).toBe(5);
        expect(split.fullQty).toBe(2);
        expect(split.discountedTotal).toBe(5 * (10000 * 0.8));
        expect(split.fullTotal).toBe(2 * 10000);
    });

    it('applies no discount when the promo is inactive', () => {
        const split = promoSplit(10000, 4, null);
        expect(split.discountPct).toBe(0);
        expect(split.discountedQty).toBe(0);
        expect(split.discountedTotal).toBe(0);
        expect(split.fullQty).toBe(4);
        expect(split.fullTotal).toBe(40000);
    });
});

describe('promoLineTotal', () => {
    it('matches the sum of the discounted and full-price halves from promoSplit', () => {
        const promo = activePromo({ discountPct: 25, maxDiscountedQty: 2, totalLimit: 100 });
        const split = promoSplit(8000, 5, promo);
        expect(promoLineTotal(8000, 5, promo)).toBe(split.discountedTotal + split.fullTotal);
    });

    it('equals price times quantity when there is no promo', () => {
        expect(promoLineTotal(5000, 3, null)).toBe(15000);
    });
});
