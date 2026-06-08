import type { MemberInfo, SplitType, SplitValuePresets } from '../types';
import { emptySplitValuePresets } from './split-presets';

const CACHE_KEY = 'slopwise_sheet_metadata_cache';
const CACHE_VERSION = 1 as const;

export interface SheetMetadataCache {
  version: typeof CACHE_VERSION;
  members: string[];
  memberProfiles: Record<string, MemberInfo>;
  currency: string;
  lastSplitType: SplitType;
  lastPaidBy: string;
  lastSplitValuePresets: SplitValuePresets;
}

type CacheStore = Record<string, SheetMetadataCache>;

function parseStore(raw: string | null): CacheStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CacheStore;
  } catch {
    return {};
  }
}

function isValidEntry(
  entry: SheetMetadataCache | undefined
): entry is SheetMetadataCache {
  return (
    !!entry &&
    entry.version === CACHE_VERSION &&
    Array.isArray(entry.members) &&
    entry.members.length > 0 &&
    typeof entry.currency === 'string'
  );
}

export function loadSheetMetadataCache(
  spreadsheetId: string
): SheetMetadataCache | null {
  const store = parseStore(localStorage.getItem(CACHE_KEY));
  const entry = store[spreadsheetId];
  if (!isValidEntry(entry)) return null;
  return {
    ...entry,
    memberProfiles: entry.memberProfiles ?? {},
    lastSplitValuePresets:
      entry.lastSplitValuePresets ?? emptySplitValuePresets()
  };
}

export function saveSheetMetadataCache(
  spreadsheetId: string,
  snapshot: Omit<SheetMetadataCache, 'version'>
): void {
  if (snapshot.members.length === 0) return;
  const store = parseStore(localStorage.getItem(CACHE_KEY));
  store[spreadsheetId] = {
    version: CACHE_VERSION,
    members: snapshot.members,
    memberProfiles: snapshot.memberProfiles,
    currency: snapshot.currency,
    lastSplitType: snapshot.lastSplitType,
    lastPaidBy: snapshot.lastPaidBy,
    lastSplitValuePresets: snapshot.lastSplitValuePresets
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(store));
}

export function clearSheetMetadataCache(spreadsheetId?: string): void {
  if (spreadsheetId === undefined) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  const store = parseStore(localStorage.getItem(CACHE_KEY));
  delete store[spreadsheetId];
  if (Object.keys(store).length === 0) {
    localStorage.removeItem(CACHE_KEY);
  } else {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  }
}
