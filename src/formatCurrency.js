const CURRENCY_CONFIG = {
    IDR: { locale: 'id-ID', symbol: 'Rp',  fractionDigits: 0 },
    USD: { locale: 'en-US', symbol: '$',   fractionDigits: 2 },
    EUR: { locale: 'de-DE', symbol: '€',   fractionDigits: 2 },
    GBP: { locale: 'en-GB', symbol: '£',   fractionDigits: 2 },
    JPY: { locale: 'ja-JP', symbol: '¥',   fractionDigits: 0 },
    SGD: { locale: 'en-SG', symbol: 'S$',  fractionDigits: 2 },
    MYR: { locale: 'ms-MY', symbol: 'RM',  fractionDigits: 2 },
    AUD: { locale: 'en-AU', symbol: 'A$',  fractionDigits: 2 },
    CNY: { locale: 'zh-CN', symbol: '¥',   fractionDigits: 2 },
    KRW: { locale: 'ko-KR', symbol: '₩',   fractionDigits: 0 },
    THB: { locale: 'th-TH', symbol: '฿',   fractionDigits: 2 },
    PHP: { locale: 'en-PH', symbol: '₱',   fractionDigits: 2 },
    VND: { locale: 'vi-VN', symbol: '₫',   fractionDigits: 0 },
    INR: { locale: 'en-IN', symbol: '₹',   fractionDigits: 2 },
};

export function formatCurrency(amount, currencyCode = 'IDR') {
    const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR;
    return new Intl.NumberFormat(cfg.locale, {
        minimumFractionDigits: cfg.fractionDigits,
        maximumFractionDigits: cfg.fractionDigits,
    }).format(amount ?? 0);
}

export function getCurrencySymbol(currencyCode = 'IDR') {
    return (CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR).symbol;
}

export function getCurrencySeparators(currencyCode = 'IDR') {
    const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR;
    const parts = new Intl.NumberFormat(cfg.locale).formatToParts(11111.1);
    return {
        group: parts.find(p => p.type === 'group')?.value ?? ',',
        decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
        fractionDigits: cfg.fractionDigits,
    };
}

export function getExcelCurrencyFormat(currencyCode = 'IDR') {
    const cfg = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.IDR;
    const decimals = cfg.fractionDigits > 0 ? '.' + '0'.repeat(cfg.fractionDigits) : '';
    return `"${cfg.symbol}"#,##0${decimals}`;
}

export function getSupportedCurrencies() {
    return Object.keys(CURRENCY_CONFIG);
}
