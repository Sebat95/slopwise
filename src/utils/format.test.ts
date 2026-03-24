import { describe, it, expect } from 'vitest';
import { parseLooseNumber, parseAmount } from './format';

describe('format utils', () => {
  describe('parseLooseNumber', () => {
    it('handles regular numbers', () => {
      expect(parseLooseNumber(123)).toBe(123);
      expect(parseLooseNumber(0)).toBe(0);
      expect(parseLooseNumber(-45.6)).toBe(-45.6);
    });

    it('handles strings', () => {
      expect(parseLooseNumber('123')).toBe(123);
      expect(parseLooseNumber('123.45')).toBe(123.45);
      expect(parseLooseNumber('-123.45')).toBe(-123.45);
    });

    it('handles commas as decimals', () => {
      expect(parseLooseNumber('123,45')).toBe(123.45);
    });

    it('handles thousands separators', () => {
      expect(parseLooseNumber('1,234.56')).toBe(1234.56);
      expect(parseLooseNumber('1.234,56')).toBe(1234.56);
    });

    it('handles parentheses for negative numbers', () => {
      expect(parseLooseNumber('(123.45)')).toBe(-123.45);
    });

    it('handles invalid input gracefully', () => {
      expect(parseLooseNumber(null)).toBe(0);
      expect(parseLooseNumber(undefined)).toBe(0);
      expect(parseLooseNumber('abc')).toBe(0);
      expect(parseLooseNumber('')).toBe(0);
    });
  });

  describe('parseAmount', () => {
    it('rounds to 2 decimal places', () => {
      expect(parseAmount('123.4567')).toBe(123.46);
      expect(parseAmount('123.4541')).toBe(123.45);
    });
  });
});
