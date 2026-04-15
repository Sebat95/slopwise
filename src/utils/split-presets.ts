import type { SplitValuePresets } from '../types';

/** Fresh preset map for all split types (used for defaults and renames). */
export function emptySplitValuePresets(): SplitValuePresets {
  return { equal: {}, exact: {}, percentage: {}, shares: {} };
}

/** Values from sheet/settings for one split type, keyed by member name. */
export function getPresetValuesFromStorage(
  presetForType: Record<string, number> | undefined,
  members: string[]
): Record<string, number> {
  const preset = presetForType || {};
  return members.reduce<Record<string, number>>((acc, member) => {
    const value = preset[member];
    if (Number.isFinite(value)) acc[member] = value;
    return acc;
  }, {});
}

/**
 * Members to pre-select for a new expense from stored presets.
 * Only members with a preset value greater than 0 count; otherwise the whole group is used.
 *
 * Equal splits have no dollar amounts — persist {@link equalSplitRememberPreset}
 * so a subset is not lost (all zeros match nobody and wrongly select everyone).
 */
export function getPresetInvolvedMembers(
  presetForType: Record<string, number> | undefined,
  members: string[]
): string[] {
  const presetValues = getPresetValuesFromStorage(presetForType, members);
  const presetMembers = members.filter(
    (member) => (presetValues[member] ?? 0) > 0
  );
  return presetMembers.length > 0 ? presetMembers : [...members];
}

/** Stored under lastSplitValuePresets.equal so involved detection uses value > 0. */
export function equalSplitRememberPreset(
  involved: Iterable<string>
): Record<string, number> {
  return Object.fromEntries([...involved].map((m) => [m, 1]));
}
