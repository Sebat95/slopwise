import { describe, it, expect, vi } from 'vitest';
import { exportToCSV, parseCompetitorCSV } from './csv';
import type { Expense } from '../types';
import { calculateSplits } from './balance';

vi.mock('uuid', () => ({
  v4: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
}));

function stripIds(expenses: Expense[]): Omit<Expense, 'id'>[] {
  return expenses.map(({ id, ...rest }) => {
    void id;
    return rest;
  });
}

describe('parseCompetitorCSV', () => {
  it('parses a minimal Splitwise-style row and member columns', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '2024-01-15,Lunch,Dining out,24.50,USD,-12.25,12.25'
    ].join('\n');

    const { members, expenses } = parseCompetitorCSV(csv);
    expect(members).toEqual(['Alice', 'Bob']);
    expect(expenses).toHaveLength(1);
    const e = expenses[0]!;
    expect(e.date).toBe('2024-01-15');
    expect(e.description).toBe('Lunch');
    expect(e.category).toBe('Dining out');
    expect(e.cost).toBe(2450);
    expect(e.currency).toBe('USD');
    expect(e.paidBy).toBe('Bob');
    expect(e.splitType).toBe('equal');
    expect(e.splits.Alice).toBe(-1225);
    expect(e.splits.Bob).toBe(1225);
  });

  it('normalizes slash dates to ISO', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,X,Y',
      '2024/2/5,Item,General,10,USD,-5,5'
    ].join('\n');
    const { expenses } = parseCompetitorCSV(csv);
    expect(expenses[0]!.date).toBe('2024-02-05');
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,Alice,Bob',
      '"2024-01-01","Hello, team",General,10,USD,-5,5'
    ].join('\n');
    const { expenses } = parseCompetitorCSV(csv);
    expect(expenses[0]!.description).toBe('Hello, team');
  });

  it('reads Slopwise metadata columns for payer and split type', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,Alice,Bob,_slopwise_paid_by,_slopwise_split_type',
      '2024-01-01,Dinner,General,40,USD,-20,20,Alice,exact'
    ].join('\n');
    const { expenses } = parseCompetitorCSV(csv);
    const e = expenses[0]!;
    expect(e.paidBy).toBe('Alice');
    expect(e.splitType).toBe('exact');
  });

  it('returns empty result for header-only or missing member columns', () => {
    expect(
      parseCompetitorCSV('Date,Description,Category,Cost,Currency')
    ).toEqual({ members: [], expenses: [] });
    expect(parseCompetitorCSV('')).toEqual({ members: [], expenses: [] });
  });

  it('skips rows with zero cost', () => {
    const csv = [
      'Date,Description,Category,Cost,Currency,A,B',
      '2024-01-01,Free,General,0,USD,0,0',
      '2024-01-02,Paid,General,5,USD,-2.5,2.5'
    ].join('\n');
    const { expenses } = parseCompetitorCSV(csv);
    expect(expenses).toHaveLength(1);
    expect(expenses[0]!.description).toBe('Paid');
  });
});

describe('exportToCSV + parseCompetitorCSV', () => {
  it('round-trips expenses and members (stable ids via mocked uuid)', () => {
    const members = ['Alice', 'Bob'];
    const splits = calculateSplits(
      9999,
      'Alice',
      members,
      'equal',
      {},
      members
    );
    const expenses: Expense[] = [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        date: '2024-03-10',
        description: 'Groceries',
        category: 'Groceries',
        cost: 9999,
        currency: 'EUR',
        paidBy: 'Alice',
        splitType: 'equal',
        splits
      }
    ];

    const csvText = exportToCSV(expenses, members);
    const parsed = parseCompetitorCSV(csvText);

    expect(parsed.members).toEqual(members);
    expect(stripIds(parsed.expenses)).toEqual(stripIds(expenses));
  });
});
