import { describe, it, expect } from 'vitest';
const { hashPin } = require('./adminPinService.js');

describe('hashPin', () => {
    it('is deterministic for the same pin and salt', () => {
        expect(hashPin('1234', 'abcd')).toBe(hashPin('1234', 'abcd'));
    });

    it('produces different hashes for different salts', () => {
        expect(hashPin('1234', 'abcd')).not.toBe(hashPin('1234', 'efgh'));
    });

    it('produces different hashes for different pins', () => {
        expect(hashPin('1234', 'abcd')).not.toBe(hashPin('5678', 'abcd'));
    });

    it('returns a 128-char hex string (64-byte scrypt key)', () => {
        expect(hashPin('1234', 'abcd')).toMatch(/^[0-9a-f]{128}$/);
    });
});
