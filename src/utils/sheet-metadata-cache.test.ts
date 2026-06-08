import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadSheetMetadataCache,
  saveSheetMetadataCache,
  clearSheetMetadataCache
} from './sheet-metadata-cache';
import { emptySplitValuePresets } from './split-presets';

describe('sheet-metadata-cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips members and split presets for a spreadsheet', () => {
    saveSheetMetadataCache('sheet123', {
      members: ['A', 'B'],
      memberProfiles: {
        A: { name: 'A', email: 'a@test.com', photoUrl: '' }
      },
      currency: 'EUR',
      lastSplitType: 'shares',
      lastPaidBy: 'A',
      lastSplitValuePresets: {
        ...emptySplitValuePresets(),
        shares: { A: 1, B: 2 }
      }
    });

    const loaded = loadSheetMetadataCache('sheet123');
    expect(loaded?.members).toEqual(['A', 'B']);
    expect(loaded?.lastSplitType).toBe('shares');
    expect(loaded?.lastSplitValuePresets.shares).toEqual({ A: 1, B: 2 });
    expect(loaded?.memberProfiles.A?.email).toBe('a@test.com');
  });

  it('returns null when no cache exists', () => {
    expect(loadSheetMetadataCache('missing')).toBeNull();
  });

  it('does not save empty member lists', () => {
    saveSheetMetadataCache('sheet123', {
      members: [],
      memberProfiles: {},
      currency: 'EUR',
      lastSplitType: 'equal',
      lastPaidBy: '',
      lastSplitValuePresets: emptySplitValuePresets()
    });
    expect(loadSheetMetadataCache('sheet123')).toBeNull();
  });

  it('clears one spreadsheet or the whole cache', () => {
    saveSheetMetadataCache('sheet123', {
      members: ['A'],
      memberProfiles: {},
      currency: 'EUR',
      lastSplitType: 'equal',
      lastPaidBy: 'A',
      lastSplitValuePresets: emptySplitValuePresets()
    });
    saveSheetMetadataCache('sheet456', {
      members: ['B'],
      memberProfiles: {},
      currency: 'USD',
      lastSplitType: 'equal',
      lastPaidBy: 'B',
      lastSplitValuePresets: emptySplitValuePresets()
    });

    clearSheetMetadataCache('sheet123');
    expect(loadSheetMetadataCache('sheet123')).toBeNull();
    expect(loadSheetMetadataCache('sheet456')?.members).toEqual(['B']);

    clearSheetMetadataCache();
    expect(loadSheetMetadataCache('sheet456')).toBeNull();
  });
});
