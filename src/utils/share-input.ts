import {
  formatMoneyInputFromCents,
  parseMoneyCents,
  sanitizeMoneyInput
} from './format';

/** Share amounts use 2 decimal places (same scale as money cents). */
export function shareAmountToHundredths(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.trunc(Math.round(amount * 100));
}

export function shareHundredthsToAmount(hundredths: number): number {
  return Math.trunc(hundredths) / 100;
}

export function parseShareInputToHundredths(input: string): number {
  return parseMoneyCents(input);
}

export function formatShareInputFromHundredths(hundredths: number): string {
  return formatMoneyInputFromCents(hundredths);
}

export function formatShareInputFromAmount(amount: number): string {
  return formatShareInputFromHundredths(shareAmountToHundredths(amount));
}

export function sanitizeShareInput(raw: string): string {
  return sanitizeMoneyInput(raw);
}

export function serializeShareInputs(
  inputs: Record<string, number> | undefined
): string {
  if (!inputs || Object.keys(inputs).length === 0) return '';
  return JSON.stringify(inputs);
}

export function parseShareInputs(
  raw: string | undefined
): Record<string, number> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        out[key] = value;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Build hundredths map for calculateSplits from display share amounts. */
export function shareInputsToHundredths(
  inputs: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [member, amount] of Object.entries(inputs)) {
    out[member] = shareAmountToHundredths(amount);
  }
  return out;
}
