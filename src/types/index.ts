export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  cost: number;
  currency: string;
  paidBy: string;
  splitType: SplitType;
  splits: Record<string, number>;
  notes?: string;
}

export interface Balance {
  from: string;
  to: string;
  amount: number;
}

export interface SpreadsheetInfo {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface SheetData {
  members: string[];
  expenses: Expense[];
  currency: string;
}

export interface GoogleTokenInfo {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  expiry_time: number;
}

export interface MemberInfo {
  name: string;
  email: string;
  photoUrl: string;
}

export interface GoogleUserProfile {
  name: string;
  email: string;
  picture: string;
}

export const FIXED_COLUMNS = 5;

export const CATEGORIES = [
  'General',
  'Groceries',
  'Dining out',
  'Drinks',
  'Rent',
  'Utilities',
  'Household',
  'Transport',
  'Travel',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Education',
  'Gifts',
  'Insurance',
  'Taxes',
  'Sports',
  'Pets',
  'Services',
  'Payment',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'INR',
  'CHF',
  'CNY',
  'BRL'
] as const;

export type Currency = (typeof CURRENCIES)[number];
