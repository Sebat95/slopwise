import { describe, it, expect } from 'vitest';
import {
  parseCSVNumber,
  parseAmount,
  parseSheetMoney,
  quantizeMoneyTruncate,
  isValidMoneyInputString,
  sanitizeMoneyInput
} from './format';

describe('format utils', () => {
  describe('parseCSVNumber (competitor CSV import only)', () => {
    it('handles regular numbers', () => {
      expect(parseCSVNumber(123)).toBe(123);
      expect(parseCSVNumber(0)).toBe(0);
      expect(parseCSVNumber(-45.6)).toBe(-45.6);
    });

    it('handles strings', () => {
      expect(parseCSVNumber('123')).toBe(123);
      expect(parseCSVNumber('123.45')).toBe(123.45);
      expect(parseCSVNumber('-123.45')).toBe(-123.45);
    });

    it('handles commas as decimals', () => {
      expect(parseCSVNumber('123,45')).toBe(123.45);
    });

    it('handles thousands separators', () => {
      expect(parseCSVNumber('1,234.56')).toBe(1234.56);
      expect(parseCSVNumber('1.234,56')).toBe(1234.56);
      expect(parseCSVNumber('1.234.567')).toBe(1234567);
    });

    it('does not treat a single .xxx group as thousands (decimals like 0.699)', () => {
      expect(parseCSVNumber('0.699')).toBe(0.699);
      expect(parseCSVNumber('1.234')).toBe(1.234);
    });

    it('handles parentheses for negative numbers', () => {
      expect(parseCSVNumber('(123.45)')).toBe(-123.45);
    });

    it('handles invalid input gracefully', () => {
      expect(parseCSVNumber(null)).toBe(0);
      expect(parseCSVNumber(undefined)).toBe(0);
      expect(parseCSVNumber('abc')).toBe(0);
      expect(parseCSVNumber('')).toBe(0);
    });
  });

  describe('parseSheetMoney (Slopwise sheet cells)', () => {
    it('accepts strict one-separator forms', () => {
      expect(parseSheetMoney('12.34')).toBe(12.34);
      expect(parseSheetMoney('12,34')).toBe(12.34);
    });

    it('rejects thousands-style strings that CSV import would accept', () => {
      expect(parseSheetMoney('1,234.56')).toBe(0);
      expect(parseSheetMoney('1.234,56')).toBe(0);
    });

    it('quantizes numeric API values to cents', () => {
      expect(parseSheetMoney(12.345)).toBe(12.34);
    });
  });

  describe('parseAmount', () => {
    it('truncates to at most 2 decimal places (never rounds up)', () => {
      expect(parseAmount('123.4567')).toBe(123.45);
      expect(parseAmount('123.4541')).toBe(123.45);
      expect(parseAmount('0.699')).toBe(0.69);
      expect(parseAmount('0.6')).toBe(0.6);
    });

    it('rejects thousands-style input (use 1234.67 or 1234,67 only)', () => {
      expect(parseAmount('1.234,56')).toBe(0);
      expect(parseAmount('1,234.56')).toBe(0);
      expect(parseAmount('1,234')).toBe(0);
      expect(parseAmount('12,345')).toBe(0);
    });

    it('accepts a single decimal separator', () => {
      expect(parseAmount('1234,67')).toBe(1234.67);
      expect(parseAmount('1234.67')).toBe(1234.67);
      expect(parseAmount('12,34')).toBe(12.34);
    });
  });

  describe('strict money input helpers', () => {
    it('isValidMoneyInputString', () => {
      expect(isValidMoneyInputString('')).toBe(true);
      expect(isValidMoneyInputString('1234.56')).toBe(true);
      expect(isValidMoneyInputString('1234,56')).toBe(true);
      expect(isValidMoneyInputString('1.234,56')).toBe(false);
      expect(isValidMoneyInputString('1,234.56')).toBe(false);
      expect(isValidMoneyInputString('1,234')).toBe(false);
      expect(isValidMoneyInputString('12.34.56')).toBe(false);
    });

    it('sanitizeMoneyInput trims invalid suffixes', () => {
      expect(sanitizeMoneyInput('1.234,56')).toBe('1.234');
      expect(sanitizeMoneyInput('12.3abc')).toBe('12.3');
    });
  });

  describe('quantizeMoneyTruncate', () => {
    it('truncates computed floats to 2 decimals, never rounds up', () => {
      expect(quantizeMoneyTruncate(0.699)).toBe(0.69);
      expect(quantizeMoneyTruncate(123.456)).toBe(123.45);
    });
  });
});
