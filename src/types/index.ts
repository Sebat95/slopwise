export interface Member {
  name: string;
  email?: string;
}

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface ExpenseSplit {
  memberName: string;
  amount: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  cost: number;
  currency: string;
  paidBy: string;
  splitType: SplitType;
  splits: Record<string, number>; // memberName -> net amount (+ owed to them, - they owe)
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
  'Payment'
] as const;

export interface MemberInfo {
  name: string;
  email: string;
  photoUrl: string;
}

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
