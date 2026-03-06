import type { Expense } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function parseSplitwiseCSV(csvText: string): {
  members: string[];
  expenses: Expense[];
} {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { members: [], expenses: [] };

  const headers = parseCSVLine(lines[0]);

  const memberStartIdx = headers.findIndex((h) => {
    const lower = h.toLowerCase().trim();
    return (
      lower !== 'date' &&
      lower !== 'description' &&
      lower !== 'category' &&
      lower !== 'cost' &&
      lower !== 'currency'
    );
  });

  if (memberStartIdx < 0) return { members: [], expenses: [] };

  const members = headers
    .slice(memberStartIdx)
    .map((h) => h.trim())
    .filter(Boolean);
  const expenses: Expense[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < memberStartIdx + 1) continue;

    const date = cols[0]?.trim() || '';
    const description = cols[1]?.trim() || '';
    const category = cols[2]?.trim() || 'General';
    const cost = parseFloat(cols[3]?.trim() || '0') || 0;
    const currency = cols[4]?.trim() || 'USD';

    if (!date || cost === 0) continue;

    const splits: Record<string, number> = {};
    let paidBy = '';
    let maxPositive = -Infinity;

    for (let j = 0; j < members.length; j++) {
      const val = parseFloat(cols[memberStartIdx + j]?.trim() || '0') || 0;
      splits[members[j]] = val;
      if (val > maxPositive) {
        maxPositive = val;
        paidBy = members[j];
      }
    }

    expenses.push({
      id: uuidv4(),
      date: normalizeDate(date),
      description,
      category,
      cost,
      currency,
      paidBy,
      splitType: 'equal',
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
    ...members
  ];
  const lines = [headers.map(escapeCSV).join(',')];

  for (const expense of expenses) {
    const row = [
      expense.date,
      expense.description,
      expense.category,
      expense.cost.toFixed(2),
      expense.currency,
      ...members.map((m) => (expense.splits[m] ?? 0).toFixed(2))
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
