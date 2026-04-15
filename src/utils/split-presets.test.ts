import { describe, it, expect } from 'vitest';
import {
  emptySplitValuePresets,
  equalSplitRememberPreset,
  getPresetInvolvedMembers,
  getPresetValuesFromStorage
} from './split-presets';

describe('emptySplitValuePresets', () => {
  it('returns empty maps for every split type', () => {
    const p = emptySplitValuePresets();
    expect(p.equal).toEqual({});
    expect(p.exact).toEqual({});
    expect(p.percentage).toEqual({});
    expect(p.shares).toEqual({});
  });

  it('returns a fresh object each call', () => {
    const a = emptySplitValuePresets();
    const b = emptySplitValuePresets();
    expect(a).not.toBe(b);
    expect(a.equal).not.toBe(b.equal);
  });
});

describe('equalSplitRememberPreset + getPresetInvolvedMembers', () => {
  const allMembers = ['Alice', 'Bob', 'Carol', 'Dave'];

  it('restores only the members who shared an equal split (not the whole group)', () => {
    const savedPreset = equalSplitRememberPreset(new Set(['Alice', 'Bob']));
    expect(getPresetInvolvedMembers(savedPreset, allMembers).sort()).toEqual([
      'Alice',
      'Bob'
    ]);
  });

  it('supports a single participant', () => {
    const savedPreset = equalSplitRememberPreset(['Carol']);
    expect(getPresetInvolvedMembers(savedPreset, allMembers)).toEqual([
      'Carol'
    ]);
  });

  it('markers round-trip through getPresetValuesFromStorage', () => {
    const saved = equalSplitRememberPreset(['Bob', 'Dave']);
    expect(getPresetValuesFromStorage(saved, allMembers)).toEqual({
      Bob: 1,
      Dave: 1
    });
  });

  it('documents legacy all-zero equal preset: cannot infer subset, falls back to everyone', () => {
    const legacyZeros = { Alice: 0, Bob: 0 };
    expect(getPresetInvolvedMembers(legacyZeros, allMembers)).toEqual(
      allMembers
    );
  });
});
