import { describe, it, expect } from 'vitest';
import { evaluateFormula, formatToHex } from '../formula';

describe('evaluateFormula', () => {
    it('should calculate simple math', () => {
        expect(evaluateFormula('1 + 1', {})).toBe(2);
        expect(evaluateFormula('10 / 2', {})).toBe(5);
        expect(evaluateFormula('(3 + 5) * 2', {})).toBe(16);
    });

    it('should substitute variables', () => {
        const map = { 'LenA': 10, 'LenB': 20 };
        expect(evaluateFormula('[LenA] + [LenB]', map)).toBe(30);
        expect(evaluateFormula('[LenA] * 2', map)).toBe(20);
    });

    it('should handle undefined variables as 0', () => {
        expect(evaluateFormula('[Unknown] + 5', {})).toBe(5);
    });

    it('should return 0 for invalid formulas or characters', () => {
        expect(evaluateFormula('alert("hi")', {})).toBe(0); // Security check
        expect(evaluateFormula('1 + a', {})).toBe(0); // Invalid syntax
    });

    it('should floor decimal results', () => {
        expect(evaluateFormula('5 / 2', {})).toBe(2); // 2.5 -> 2
    });
});

describe('formatToHex', () => {
    it('should format numbers to hex strings', () => {
        expect(formatToHex(10, 1)).toBe('0A');
        expect(formatToHex(255, 1)).toBe('FF');
    });

    it('should pad with zeros', () => {
        expect(formatToHex(10, 2)).toBe('00 0A');
    });

    it('should handle large numbers and clip to byte_len', () => {
        // 257 is 0x101. If byteLen is 1, it generally should maybe show overflow or clip. 
        // Current implementation slices from end: .slice(-targetLen)
        expect(formatToHex(257, 1)).toBe('01');
    });

    it('should handle zero', () => {
        expect(formatToHex(0, 1)).toBe('00');
    });
});
