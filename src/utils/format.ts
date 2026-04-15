import { format, parseISO, isValid } from 'date-fns';

/**
 * Normalizes numbers from third-party CSV exports (thousands separators, mixed `.` / `,`).
 * Used only by {@link parseCSVNumber}; Slopwise sheet cells use {@link parseSheetMoney} instead.
 */
function cleanLooseNumericBody(raw: string): string | null {
  const rawTrim = String(raw).trim();
  if (!rawTrim) return null;

  let cleaned = rawTrim
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.\-+]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const commaThousandsPattern = /^\d{1,3}(,\d{3})+$/;
  // Require at least two ".xxx" groups so "0.699" / "1.234" stay decimals (US-style).
  // Use "1.234.567" or "1.234,56" for European thousands + decimals.
  const dotThousandsPattern = /^\d{1,3}(\.\d{3}){2,}$/;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    cleaned = cleaned.split(thousandsSep).join('');
    if (decimalSep === ',') cleaned = cleaned.replace(',', '.');
  } else if (lastComma >= 0) {
    cleaned = commaThousandsPattern.test(cleaned)
      ? cleaned.split(',').join('')
      : cleaned.replace(',', '.');
  } else if (lastDot >= 0 && dotThousandsPattern.test(cleaned)) {
    cleaned = cleaned.split('.').join('');
  }

  return cleaned;
}

/**
 * User-input money grammar: optional leading `-`, digits, at most one `.` or `,`
 * as decimal separator (not both). No thousands: rejects `1,234` / `12,345` style.
 */
const STRICT_MONEY_BODY = /^-?(\d*)([.,]?)(\d*)$/;

function isCommaThousandsBody(unsigned: string): boolean {
  return /^\d{1,3}(,\d{3})+$/.test(unsigned);
}

/** Empty string is allowed while typing in controlled fields. */
export function isValidMoneyInputString(raw: string): boolean {
  const t = String(raw).trim();
  if (t === '') return true;
  let inner = t.replace(/\s+/g, '');
  if (inner.startsWith('(') && inner.endsWith(')')) {
    inner = inner.slice(1, -1);
  }
  inner = inner.replace(/[^0-9.,-]/g, '');
  if (inner === '') return false;
  if (!STRICT_MONEY_BODY.test(inner)) return false;
  const unsigned = inner.startsWith('-') ? inner.slice(1) : inner;
  if (isCommaThousandsBody(unsigned)) return false;
  return true;
}

/**
 * Coerce a raw field to the longest valid strict-money prefix (for controlled inputs).
 */
export function sanitizeMoneyInput(raw: string): string {
  let s = String(raw).trim().replace(/\s+/g, '');
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.,-]/g, '');
  if (s === '') return '';
  for (let n = s.length; n >= 0; n--) {
    const prefix = s.slice(0, n);
    if (isValidMoneyInputString(prefix)) return prefix;
  }
  return '';
}

/** Truncate fractional digits toward zero (no rounding up). */
function truncateDecimalFraction(body: string, maxDigits: number): string {
  const neg = body.startsWith('-');
  const u = neg ? body.slice(1) : body;
  const dot = u.indexOf('.');
  if (dot === -1) return body;
  const intPart = u.slice(0, dot) || '0';
  const frac = u
    .slice(dot + 1)
    .replace(/\D/g, '')
    .slice(0, maxDigits);
  return (neg ? '-' : '') + intPart + '.' + frac;
}

/**
 * Quantize to at most 2 decimal places by truncating toward zero (never rounds up).
 * Uses a fixed string form so float noise like 0.29 does not become 0.28.
 */
export function quantizeMoneyTruncate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const s = abs.toFixed(20);
  const dot = s.indexOf('.');
  if (dot === -1) return value;
  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1, dot + 3);
  return sign * parseFloat(intPart + '.' + frac);
}

/** Canonical text for hydrating a money input from a number (`.` decimal only). */
export function formatMoneyInputFromNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  const q = quantizeMoneyTruncate(n);
  if (q === Math.trunc(q)) return String(Math.trunc(q));
  return String(q);
}

/**
 * Parse numeric strings from competitor CSV imports (thousands, locale decimals, etc.).
 * Do not use for Google Sheet cells written by Slopwise — use {@link parseSheetMoney}.
 */
export function parseCSVNumber(
  value: string | number | null | undefined
): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const isNegativeByParens = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = cleanLooseNumericBody(raw);
  if (!cleaned) return 0;

  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return isNegativeByParens ? -parsed : parsed;
}

function cleanStrictMoneyBody(raw: string): string | null {
  const t = String(raw).trim();
  if (t === '') return null;

  const inner = t
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9.,-]/g, '');
  if (inner === '') return null;
  if (!STRICT_MONEY_BODY.test(inner)) return null;
  const unsigned = inner.startsWith('-') ? inner.slice(1) : inner;
  if (isCommaThousandsBody(unsigned)) return null;
  return inner.replace(',', '.');
}

/** Parse a money field: strict input grammar, at most 2 decimals truncated (never up). */
export function parseAmount(input: string): number {
  const raw = String(input).trim();
  if (!raw) return 0;

  const isNegativeByParens = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = cleanStrictMoneyBody(raw);
  if (!cleaned) return 0;

  const truncated = truncateDecimalFraction(cleaned, 2);
  const parsed = parseFloat(truncated);
  if (!Number.isFinite(parsed)) return 0;
  return isNegativeByParens ? -parsed : parsed;
}

/**
 * Read a money value from a Slopwise Google Sheet cell: strict grammar (one `.` or `,` as
 * decimal, no thousands). Numbers from the API are quantized to cents.
 */
export function parseSheetMoney(
  value: string | number | null | undefined
): number {
  if (typeof value === 'number')
    return Number.isFinite(value) ? quantizeMoneyTruncate(value) : 0;
  if (value == null) return 0;
  return parseAmount(String(value));
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
  INR: '₹',
  CHF: 'Fr',
  CNY: '¥',
  BRL: 'R$'
};

export function formatCurrency(
  amount: number,
  currency: string = 'USD'
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(2);
  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatDateShort(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return dateStr;
    return format(date, 'MMM d');
  } catch {
    return dateStr;
  }
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  '#5bc5a7',
  '#e74c3c',
  '#3498db',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#2ecc71',
  '#e91e63',
  '#00bcd4'
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const CATEGORY_EMOJI: Record<string, string> = {
  General: '📋',
  Groceries: '🛒',
  'Dining out': '🍕',
  Drinks: '🍷',
  Rent: '🏠',
  Utilities: '💡',
  Household: '🏡',
  Transport: '🚗',
  Travel: '✈️',
  Entertainment: '🎬',
  Shopping: '🛍️',
  Healthcare: '🏥',
  Education: '📚',
  Gifts: '🎁',
  Insurance: '🛡️',
  Taxes: '💰',
  Sports: '⚽',
  Pets: '🐾',
  Services: '🛠️',
  Payment: '💸'
};

const CATEGORY_ALIAS: Record<string, string> = {
  // Competitors Entertainment subcategories → Entertainment
  'Entertainment - Other': 'Entertainment',
  Games: 'Entertainment',
  Movies: 'Entertainment',
  Music: 'Entertainment',
  // Competitors Food subcategories
  'Food and drink - Other': 'Dining out',
  'Food & Drink': 'Dining out',
  'Food and drink': 'Dining out',
  Liquor: 'Drinks',
  // Competitors Home subcategories → Household
  'Home - Other': 'Household',
  Home: 'Household',
  Electronics: 'Shopping',
  Furniture: 'Household',
  'Household supplies': 'Household',
  Maintenance: 'Household',
  Mortgage: 'Rent',
  // Competitors Life subcategories
  'Life - Other': 'General',
  Life: 'General',
  Childcare: 'General',
  Clothing: 'Shopping',
  'Medical expenses': 'Healthcare',
  // Competitors Transportation subcategories → Transport
  'Transportation - Other': 'Transport',
  Transportation: 'Transport',
  Bicycle: 'Transport',
  'Bus/train': 'Transport',
  Car: 'Transport',
  'Gas/fuel': 'Transport',
  Hotel: 'Travel',
  Parking: 'Transport',
  Plane: 'Travel',
  Taxi: 'Transport',
  // Competitors Utilities subcategories → Utilities
  'Utilities - Other': 'Utilities',
  Cleaning: 'Household',
  Electricity: 'Utilities',
  'Heat/gas': 'Utilities',
  'TV/Phone/Internet': 'Utilities',
  Trash: 'Utilities',
  Water: 'Utilities',
  // Old app aliases
  Other: 'General'
};

export function normalizeCategory(category: string): string {
  if (CATEGORY_EMOJI[category]) return category;
  return CATEGORY_ALIAS[category] || 'General';
}

export function getCategoryEmoji(category: string): string {
  const normalized = normalizeCategory(category);
  return CATEGORY_EMOJI[normalized] || '📋';
}
