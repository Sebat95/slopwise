import { describe, it, expect } from 'vitest';
import {
  formatShareInputFromAmount,
  parseShareInputToHundredths,
  parseShareInputs,
  sanitizeShareInput,
  serializeShareInputs,
  shareAmountToHundredths,
  shareHundredthsToAmount,
  shareInputsToHundredths
} from './share-input';

describe('share-input', () => {
  it('parses decimal shares up to 2 fractional digits', () => {
    expect(parseShareInputToHundredths('12.22')).toBe(1222);
    expect(parseShareInputToHundredths('17')).toBe(1700);
    expect(parseShareInputToHundredths('1')).toBe(100);
    expect(parseShareInputToHundredths('')).toBe(0);
  });

  it('formats share amounts for display', () => {
    expect(formatShareInputFromAmount(12.22)).toBe('12.22');
    expect(formatShareInputFromAmount(17)).toBe('17');
    expect(formatShareInputFromAmount(1)).toBe('1');
  });

  it('sanitizeShareInput allows decimals like money input', () => {
    expect(sanitizeShareInput('12.22')).toBe('12.22');
    expect(sanitizeShareInput('1.')).toBe('1.');
  });

  it('serializes and parses shareInputs JSON', () => {
    const json = serializeShareInputs({ Alice: 1, Bob: 17.5 });
    expect(parseShareInputs(json)).toEqual({ Alice: 1, Bob: 17.5 });
  });

  it('converts display amounts to hundredths for calculateSplits', () => {
    expect(shareInputsToHundredths({ A: 1, B: 17 })).toEqual({
      A: 100,
      B: 1700
    });
    expect(shareHundredthsToAmount(shareAmountToHundredths(12.22))).toBe(12.22);
  });
});
