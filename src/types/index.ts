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
  // Uncategorized / General
  'General',
  // Entertainment
  'Entertainment - Other',
  'Games',
  'Movies',
  'Music',
  'Sports',
  // Food and drink
  'Food and drink - Other',
  'Dining out',
  'Groceries',
  'Liquor',
  // Home
  'Home - Other',
  'Electronics',
  'Furniture',
  'Household supplies',
  'Maintenance',
  'Mortgage',
  'Pets',
  'Rent',
  'Services',
  // Life
  'Life - Other',
  'Childcare',
  'Clothing',
  'Education',
  'Gifts',
  'Insurance',
  'Medical expenses',
  'Taxes',
  // Transportation
  'Transportation - Other',
  'Bicycle',
  'Bus/train',
  'Car',
  'Gas/fuel',
  'Hotel',
  'Parking',
  'Plane',
  'Taxi',
  // Utilities
  'Utilities - Other',
  'Cleaning',
  'Electricity',
  'Heat/gas',
  'TV/Phone/Internet',
  'Trash',
  'Water',
  // Special
  'Payment',
] as const;

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
