import { format, parseISO, isValid } from 'date-fns';

export function parseAmount(input: string): number {
  const cleaned = input.replace(/,/g, '.');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
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
  // Splitwise Entertainment subcategories → Entertainment
  'Entertainment - Other': 'Entertainment',
  Games: 'Entertainment',
  Movies: 'Entertainment',
  Music: 'Entertainment',
  // Splitwise Food subcategories
  'Food and drink - Other': 'Dining out',
  'Food & Drink': 'Dining out',
  'Food and drink': 'Dining out',
  Liquor: 'Drinks',
  // Splitwise Home subcategories → Household
  'Home - Other': 'Household',
  Home: 'Household',
  Electronics: 'Shopping',
  Furniture: 'Household',
  'Household supplies': 'Household',
  Maintenance: 'Household',
  Mortgage: 'Rent',
  // Splitwise Life subcategories
  'Life - Other': 'General',
  Life: 'General',
  Childcare: 'General',
  Clothing: 'Shopping',
  'Medical expenses': 'Healthcare',
  // Splitwise Transportation subcategories → Transport
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
  // Splitwise Utilities subcategories → Utilities
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
