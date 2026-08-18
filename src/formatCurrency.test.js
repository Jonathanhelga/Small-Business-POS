import { describe, it, expect } from 'vitest';
import {
    formatCurrency,
    getCurrencySymbol,
    getCurrencyFractionDigits,
    getCurrencySeparators,
    getExcelCurrencyFormat,
    getSupportedCurrencies,
    roundToCurrency,
} from './formatCurrency';

describe('formatCurrency', () => {
    it('formats IDR with no decimal places', () => {
        expect(formatCurrency(15000, 'IDR')).toBe('15.000');
    });

    it('formats USD with two decimal places', () => {
        expect(formatCurrency(19.9, 'USD')).toBe('19.90');
    });

    it('defaults to IDR when no currency code is given', () => {
        expect(formatCurrency(1000)).toBe('1.000');
    });

    it('falls back to IDR for an unknown currency code', () => {
        expect(formatCurrency(1000, 'XXX')).toBe(formatCurrency(1000, 'IDR'));
    });

    it('treats null/undefined amounts as zero', () => {
        expect(formatCurrency(null, 'IDR')).toBe('0');
        expect(formatCurrency(undefined, 'USD')).toBe('0.00');
    });

    it('reuses the same formatter instance across calls for the same currency', () => {
        formatCurrency(1, 'EUR');
        formatCurrency(2, 'EUR');
        expect(formatCurrency(1234.5, 'EUR')).toBe('1.234,50');
    });
});

describe('getCurrencySymbol', () => {
    it('returns the configured symbol', () => {
        expect(getCurrencySymbol('IDR')).toBe('Rp');
        expect(getCurrencySymbol('USD')).toBe('$');
    });

    it('falls back to IDR symbol for unknown codes', () => {
        expect(getCurrencySymbol('XXX')).toBe('Rp');
    });
});

describe('getCurrencyFractionDigits', () => {
    it('returns 0 for zero-decimal currencies', () => {
        expect(getCurrencyFractionDigits('IDR')).toBe(0);
        expect(getCurrencyFractionDigits('JPY')).toBe(0);
    });

    it('returns 2 for two-decimal currencies', () => {
        expect(getCurrencyFractionDigits('USD')).toBe(2);
    });
});

describe('getCurrencySeparators', () => {
    it('reports the correct group/decimal separators for IDR', () => {
        const separators = getCurrencySeparators('IDR');
        expect(separators.group).toBe('.');
        expect(separators.decimal).toBe(',');
        expect(separators.fractionDigits).toBe(0);
    });

    it('reports the correct group/decimal separators for USD', () => {
        const separators = getCurrencySeparators('USD');
        expect(separators.group).toBe(',');
        expect(separators.decimal).toBe('.');
        expect(separators.fractionDigits).toBe(2);
    });
});

describe('getExcelCurrencyFormat', () => {
    it('builds a zero-decimal excel format for IDR', () => {
        expect(getExcelCurrencyFormat('IDR')).toBe('"Rp"#,##0');
    });

    it('builds a two-decimal excel format for USD', () => {
        expect(getExcelCurrencyFormat('USD')).toBe('"$"#,##0.00');
    });
});

describe('roundToCurrency', () => {
    it('rounds IDR (0 fraction digits) to the nearest whole rupiah', () => {
        expect(roundToCurrency(1234.5, 'IDR')).toBe(1235);
        expect(roundToCurrency(1234.4, 'IDR')).toBe(1234);
    });

    it('rounds USD (2 fraction digits) to the nearest cent', () => {
        expect(roundToCurrency(19.995, 'USD')).toBe(20);
        expect(roundToCurrency(19.994, 'USD')).toBe(19.99);
    });

    it('leaves already-precise values unchanged', () => {
        expect(roundToCurrency(15000, 'IDR')).toBe(15000);
    });

    it('defaults to IDR when no currency code is given', () => {
        expect(roundToCurrency(10.5)).toBe(11);
    });
});

describe('getSupportedCurrencies', () => {
    it('includes IDR and USD', () => {
        const currencies = getSupportedCurrencies();
        expect(currencies).toContain('IDR');
        expect(currencies).toContain('USD');
    });
});
