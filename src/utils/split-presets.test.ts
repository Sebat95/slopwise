import { describe, it, expect } from 'vitest';
import {
  equalSplitRememberPreset,
  getPresetInvolvedMembers,
  getPresetValuesFromStorage
} from './split-presets';

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
