import { format, parseISO, isValid } from 'date-fns';

export function parseLooseNumber(
  value: string | number | null | undefined
): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const isNegativeByParens = raw.startsWith('(') && raw.endsWith(')');
  let cleaned = raw
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.\-+]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const commaThousandsPattern = /^\d{1,3}(,\d{3})+$/;
  const dotThousandsPattern = /^\d{1,3}(\.\d{3})+$/;

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

  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return isNegativeByParens ? -parsed : parsed;
}

export function parseAmount(input: string): number {
  const val = parseLooseNumber(input);
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 100) / 100;
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

export function formatDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return dateStr;
    return format(date, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
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
  // Competitor Entertainment subcategories → Entertainment
  'Entertainment - Other': 'Entertainment',
  Games: 'Entertainment',
  Movies: 'Entertainment',
  Music: 'Entertainment',
  // Competitor Food subcategories
  'Food and drink - Other': 'Dining out',
  'Food & Drink': 'Dining out',
  'Food and drink': 'Dining out',
  Liquor: 'Drinks',
  // Competitor Home subcategories → Household
  'Home - Other': 'Household',
  Home: 'Household',
  Electronics: 'Shopping',
  Furniture: 'Household',
  'Household supplies': 'Household',
  Maintenance: 'Household',
  Mortgage: 'Rent',
  // Competitor Life subcategories
  'Life - Other': 'General',
  Life: 'General',
  Childcare: 'General',
  Clothing: 'Shopping',
  'Medical expenses': 'Healthcare',
  // Competitor Transportation subcategories → Transport
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
  // Competitor Utilities subcategories → Utilities
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
