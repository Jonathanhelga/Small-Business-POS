import { getCurrencySeparators } from './formatCurrency';

// Money fields are type="text" so they can show thousands separators while the user
// types (a type="number" input rejects them). That means the browser guards nothing,
// so this module does the guarding: it keeps the field to digits only, and refuses to
// hand back a number it could not actually read.
//
// The zero-decimal currencies (IDR, JPY, KRW, VND) get a useful property for free:
// a separator is never a legal character, so "50.000" reduces to 50000, which is what
// an Indonesian shopkeeper typing fifty thousand meant in the first place.

// Reduce whatever is in the field to its digits, plus a fraction part when the currency
// has one. Letters, currency symbols, and stray separators are dropped, so "Rp 50.000"
// and "50000" both come out as 50000 for IDR.
function extractParts(raw, seps) {
    let digits = '';
    let fraction = null;

    for (const ch of String(raw)) {
        if (ch >= '0' && ch <= '9') {
            if (fraction === null) digits += ch;
            else if (fraction.length < seps.fractionDigits) fraction += ch;
            continue;
        }
        // Only the locale's own decimal character opens a fraction. For IDR that is
        // never, since fractionDigits is 0, so "." stays a discardable group separator.
        if (seps.fractionDigits > 0 && fraction === null && ch === seps.decimal) {
            fraction = '';
        }
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
// cost is not harmless: profit is computed as subtotal - cost * quantity, so a 0 cost
// reports the full sale as profit and inflates the margin in the Excel export.
// An explicitly typed 0 is still allowed (a giveaway item can genuinely cost nothing);
// only a field with no digits in it at all is invalid.
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
