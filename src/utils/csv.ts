import type { Expense } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { parseLooseNumber } from './format';

const PAID_BY_COLUMN = '_slopwise_paid_by';
const SPLIT_TYPE_COLUMN = '_slopwise_split_type';
const RESERVED_COLUMNS = new Set([
  'date',
  'description',
  'category',
  'cost',
  'currency',
  PAID_BY_COLUMN,
  SPLIT_TYPE_COLUMN
]);

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function parseSplitType(
  value: string | undefined
): Expense['splitType'] | null {
  if (
    value === 'equal' ||
    value === 'exact' ||
    value === 'percentage' ||
    value === 'shares'
  ) {
    return value;
  }
  return null;
}

function inferPaidByFromSplits(
  splits: Record<string, number>,
  members: string[]
): string {
  let paidBy = '';
  let maxPositive = -Infinity;

  for (const member of members) {
    const value = splits[member] ?? 0;
    if (value > maxPositive) {
      maxPositive = value;
      paidBy = member;
    }
  }

  return paidBy;
}

function resolvePaidBy(
  persistedPaidBy: string,
  splits: Record<string, number>,
  members: string[]
): string {
  if (persistedPaidBy && members.includes(persistedPaidBy)) {
    return persistedPaidBy;
  }
  return inferPaidByFromSplits(splits, members);
}

function resolveSplitType(
  persistedSplitType: string | undefined
): Expense['splitType'] {
  return parseSplitType(persistedSplitType) || 'equal';
}

export function parseCompetitorCSV(csvText: string): {
  members: string[];
  expenses: Expense[];
} {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { members: [], expenses: [] };

  const headers = parseCSVLine(lines[0]);
  const headerIndex = new Map(
    headers.map((header, index) => [normalizeHeader(header), index])
  );
  const paidByIndex = headerIndex.get(PAID_BY_COLUMN) ?? -1;
  const splitTypeIndex = headerIndex.get(SPLIT_TYPE_COLUMN) ?? -1;
  const hasPaidByMetadata = paidByIndex >= 0;
  const hasSplitTypeMetadata = splitTypeIndex >= 0;
  const memberColumns = headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(
      ({ header }) =>
        header.length > 0 && !RESERVED_COLUMNS.has(normalizeHeader(header))
    );

  if (memberColumns.length === 0) return { members: [], expenses: [] };

  const members = memberColumns.map(({ header }) => header);
  const expenses: Expense[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;

    const date = cols[0]?.trim() || '';
    const description = cols[1]?.trim() || '';
    const category = cols[2]?.trim() || 'General';
    const cost = parseLooseNumber(cols[3]?.trim() || '0');
    const currency = cols[4]?.trim() || 'USD';

    if (!date || cost === 0) continue;

    const splits: Record<string, number> = {};

    for (const { header, index } of memberColumns) {
      splits[header] = parseLooseNumber(cols[index]?.trim() || '0');
    }

    // Third-party exports do not include Slopwise metadata, so keep a
    // deterministic fallback for payer and split type when those columns
    // are absent.
    const persistedPaidBy = hasPaidByMetadata
      ? cols[paidByIndex]?.trim() || ''
      : '';
    const paidBy = resolvePaidBy(persistedPaidBy, splits, members);
    const splitType = resolveSplitType(
      hasSplitTypeMetadata ? cols[splitTypeIndex]?.trim() : undefined
    );

    expenses.push({
      id: uuidv4(),
      date: normalizeDate(date),
      description,
      category,
      cost,
      currency,
      paidBy,
      splitType,
      splits
    });
  }

  return { members, expenses };
}

export function exportToCSV(expenses: Expense[], members: string[]): string {
  const headers = [
    'Date',
    'Description',
    'Category',
    'Cost',
    'Currency',
    ...members,
    PAID_BY_COLUMN,
    SPLIT_TYPE_COLUMN
  ];
  const lines = [headers.map(escapeCSV).join(',')];

  for (const expense of expenses) {
    const row = [
      expense.date,
      expense.description,
      expense.category,
      expense.cost.toFixed(2),
      expense.currency,
      ...members.map((m) => (expense.splits[m] ?? 0).toFixed(2)),
      expense.paidBy,
      expense.splitType
    ];
    lines.push(row.map(escapeCSV).join(','));
  }

  return lines.join('\n');
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeDate(dateStr: string): string {
  const cleaned = dateStr.replace(/\//g, '-');
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4)
      return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    if (c.length === 4)
      return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  return cleaned;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
