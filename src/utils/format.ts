import { format, parseISO, isValid } from 'date-fns';

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
  return name
    .split(/\s+/)
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
  // General
  'General': '📋',
  // Entertainment
  'Entertainment - Other': '🎭',
  'Games': '🎮',
  'Movies': '🎬',
  'Music': '🎵',
  'Sports': '⚽',
  // Food and drink
  'Food and drink - Other': '🍽️',
  'Dining out': '🍕',
  'Groceries': '🛒',
  'Liquor': '🍷',
  // Home
  'Home - Other': '🏡',
  'Electronics': '📱',
  'Furniture': '🪑',
  'Household supplies': '🧹',
  'Maintenance': '🔧',
  'Mortgage': '🏦',
  'Pets': '🐾',
  'Rent': '🏠',
  'Services': '🛠️',
  // Life
  'Life - Other': '🌿',
  'Childcare': '👶',
  'Clothing': '👕',
  'Education': '📚',
  'Gifts': '🎁',
  'Insurance': '🛡️',
  'Medical expenses': '🏥',
  'Taxes': '💰',
  // Transportation
  'Transportation - Other': '🚗',
  'Bicycle': '🚲',
  'Bus/train': '🚌',
  'Car': '🚙',
  'Gas/fuel': '⛽',
  'Hotel': '🏨',
  'Parking': '🅿️',
  'Plane': '✈️',
  'Taxi': '🚕',
  // Utilities
  'Utilities - Other': '💡',
  'Cleaning': '🧽',
  'Electricity': '⚡',
  'Heat/gas': '🔥',
  'TV/Phone/Internet': '📡',
  'Trash': '🗑️',
  'Water': '💧',
  // Special
  'Payment': '💸',

  // Legacy aliases (old app categories → closest match)
  'Entertainment': '🎭',
  'Food & Drink': '🍽️',
  'Food and drink': '🍽️',
  'Home': '🏡',
  'Life': '🌿',
  'Transportation': '🚗',
  'Utilities': '💡',
  'Shopping': '🛍️',
  'Healthcare': '🏥',
  'Travel': '✈️',
  'Other': '📦',
};

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] || '📋';
}
