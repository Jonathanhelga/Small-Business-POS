const CURRENCY_CONFIG = {
    IDR: { name: 'Indonesian Rupiah', locale: 'id-ID', symbol: 'Rp',  fractionDigits: 0 },
    USD: { name: 'US Dollar', locale: 'en-US', symbol: '$',   fractionDigits: 2 },
    EUR: { name: 'Euro', locale: 'de-DE', symbol: '€',   fractionDigits: 2 },
    GBP: { name: 'British Pound', locale: 'en-GB', symbol: '£',   fractionDigits: 2 },
    JPY: { name: 'Japanese Yen', locale: 'ja-JP', symbol: '¥',   fractionDigits: 0 },
    SGD: { name: 'Singapore Dollar', locale: 'en-SG', symbol: 'S$',  fractionDigits: 2 },
    MYR: { name: 'Malaysian Ringgit', locale: 'ms-MY', symbol: 'RM',  fractionDigits: 2 },
    AUD: { name: 'Australian Dollar', locale: 'en-AU', symbol: 'A$',  fractionDigits: 2 },
    CNY: { name: 'Chinese Yuan', locale: 'zh-CN', symbol: '¥',   fractionDigits: 2 },
    KRW: { name: 'South Korean Won', locale: 'ko-KR', symbol: '₩',   fractionDigits: 0 },
    THB: { name: 'Thai Baht', locale: 'th-TH', symbol: '฿',   fractionDigits: 2 },
    PHP: { name: 'Philippine Peso', locale: 'en-PH', symbol: '₱',   fractionDigits: 2 },
    VND: { name: 'Vietnamese Dong', locale: 'vi-VN', symbol: '₫',   fractionDigits: 0 },
    INR: { name: 'Indian Rupee', locale: 'en-IN', symbol: '₹',   fractionDigits: 2 },
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

export 
function getSupportedCurrencies() {
    return Object.keys(CURRENCY_CONFIG);
}

export function populateCurrencySelect(selectEl){
    if(!selectEl) return;
    selectEl.replaceChildren();
    for(const code of getSupportedCurrencies()){
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${code} - ${CURRENCY_CONFIG[code].name}`;
        selectEl.appendChild(option);
    }
}