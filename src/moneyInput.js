import { getCurrencySeparators } from './formatCurrency';

function extractParts(raw, seps) {
    let digits = '';
    let fraction = null;

    for (const ch of String(raw)) {
        if (ch >= '0' && ch <= '9') {
            if (fraction === null) digits += ch;
            else if (fraction.length < seps.fractionDigits) fraction += ch;
            continue;
        }
        if (seps.fractionDigits > 0 && fraction === null && ch === seps.decimal) { fraction = ''; }
    }

    return { digits: digits.replace(/^0+(?=\d)/, ''), fraction };
}

function groupDigits(digits, groupSep) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
}

export function formatMoneyInput(raw, currencyCode) {
    const seps = getCurrencySeparators(currencyCode);
    const { digits, fraction } = extractParts(raw, seps);
    if (!digits && fraction === null) return '';

    const whole = groupDigits(digits || '0', seps.group);
    return fraction === null ? whole : `${whole}${seps.decimal}${fraction}`;
}

// Returns an explicit validity flag rather than falling back to 0. A silently-zeroed
// cost is not harmless: profit is computed as subtotal - cost * quantity, so a 0 cost eports the full sale as profit and inflates the margin in the Excel export.
// An explicitly typed 0 is still allowed (a giveaway item can genuinely cost nothing)
export function parseMoneyInput(raw, currencyCode) {
    const seps = getCurrencySeparators(currencyCode);
    const { digits, fraction } = extractParts(raw, seps);
    if (!digits) return { value: 0, valid: false };

    const value = Number(fraction ? `${digits}.${fraction}` : digits);
    return Number.isFinite(value) ? { value, valid: true } : { value: 0, valid: false };
}

// Rewriting input.value drops the caret to the end, which makes editing the middle of a
// number miserable. Track the caret by how many DIGITS precede it rather than by string
// offset, since the separators shift around as the number regroups.
function countDigitsBefore(text, offset) {
    let count = 0;
    for (let i = 0; i < offset; i++) {
        if (text[i] >= '0' && text[i] <= '9') count++;
    }
    return count;
}

function offsetAfterDigits(text, digitCount) {
    if (digitCount === 0) return 0;
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] >= '0' && text[i] <= '9') {
            seen++;
            if (seen === digitCount) return i + 1;
        }
    }
    return text.length;
}

function reformatMoneyField(input, getCurrency) {
    const before = input.value;
    const caret = input.selectionStart ?? before.length;
    const digitsBeforeCaret = countDigitsBefore(before, caret);

    const formatted = formatMoneyInput(before, getCurrency());
    if (formatted === before) return;

    input.value = formatted;
    const restored = offsetAfterDigits(formatted, digitsBeforeCaret);
    input.setSelectionRange(restored, restored);
}

export function attachMoneyInput(input, getCurrency) {
    if (!input) return;
    input.addEventListener('input', () => reformatMoneyField(input, getCurrency));
}
