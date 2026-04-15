import { describe, it, expect } from 'vitest';
import type { Expense } from '../types';
import {
  absorbSplitSumIntoPayer,
  calculateNetBalances,
  calculateSplits,
  inferSplitParticipantsFromExpense,
  simplifyDebts
} from './balance';
import { quantizeMoneyTruncate } from './format';

function sumSplits(splits: Record<string, number>): number {
  return Object.values(splits).reduce((a, b) => a + b, 0);
}

function makeExpense(
  id: string,
  cost: number,
  paidBy: string,
  members: string[],
  splitType: Expense['splitType'],
  splitValues: Record<string, number>,
  involved?: string[]
): Expense {
  return {
    id,
    date: '2024-01-01',
    description: 'test',
    category: 'General',
    cost,
    currency: 'USD',
    paidBy,
    splitType,
    splits: calculateSplits(
      cost,
      paidBy,
      members,
      splitType,
      splitValues,
      involved
    )
  };
}

describe('calculateSplits', () => {
  const members = ['A', 'B', 'C'];

  it('keeps per-member nets summing to zero (equal, awkward cents)', () => {
    const splits = calculateSplits(10, 'A', members, 'equal', {}, members);
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
  });

  it('exact split among a subset', () => {
    const splits = calculateSplits(
      100,
      'A',
      members,
      'exact',
      { B: 60, C: 40 },
      ['B', 'C']
    );
    expect(splits.A).toBe(100);
    expect(splits.B).toBe(-60);
    expect(splits.C).toBe(-40);
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
  });

  it('percentage split', () => {
    const splits = calculateSplits(
      200,
      'A',
      members,
      'percentage',
      { B: 30, C: 70 },
      ['B', 'C']
    );
    expect(splits.A).toBe(200);
    expect(splits.B).toBe(-60);
    expect(splits.C).toBe(-140);
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
  });

  it('shares split', () => {
    const splits = calculateSplits(
      100,
      'A',
      members,
      'shares',
      { B: 1, C: 3 },
      ['B', 'C']
    );
    expect(splits.B).toBe(-25);
    expect(splits.C).toBe(-75);
    expect(splits.A).toBe(100);
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
  });

  it('zero total shares: no one owes; payer adjustment keeps splits summing to zero', () => {
    const splits = calculateSplits(50, 'A', members, 'shares', { B: 0, C: 0 }, [
      'B',
      'C'
    ]);
    expect(splits.A).toBe(0);
    expect(splits.B).toBe(0);
    expect(splits.C).toBe(0);
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
  });
});

describe('absorbSplitSumIntoPayer', () => {
  it('moves quantized remainder onto payer so totals are zero', () => {
    const splits = { Alice: 11, Bob: -5, Carol: -5 };
    absorbSplitSumIntoPayer(splits, 'Alice');
    expect(sumSplits(splits)).toBeCloseTo(0, 10);
    expect(splits.Alice).toBe(10);
    expect(splits.Bob).toBe(-5);
    expect(splits.Carol).toBe(-5);
  });

  it('no-op when paidBy is empty', () => {
    const splits = { A: 0.01, B: -0.01, C: 0.01 };
    const before = { ...splits };
    absorbSplitSumIntoPayer(splits, '');
    expect(splits).toEqual(before);
  });

  it('no-op when splits already sum to zero', () => {
    const splits = { A: 10, B: -10 };
    absorbSplitSumIntoPayer(splits, 'A');
    expect(splits.A).toBe(10);
    expect(splits.B).toBe(-10);
  });
});

describe('calculateNetBalances', () => {
  it('sums split columns across expenses', () => {
    const members = ['A', 'B', 'C'];
    const expenses: Expense[] = [
      makeExpense('1', 30, 'A', members, 'equal', {}, members),
      makeExpense('2', 30, 'B', members, 'equal', {}, members)
    ];
    const nets = calculateNetBalances(expenses, members);
    expect(nets.A + nets.B + nets.C).toBeCloseTo(0, 5);
    expect(nets.A).toBeGreaterThan(0);
    expect(nets.B).toBeGreaterThan(0);
    expect(nets.C).toBeLessThan(0);
  });
});

describe('simplifyDebts', () => {
  const members = ['A', 'B', 'C'];

  it('returns no settlements when everyone is even', () => {
    expect(simplifyDebts([], members)).toEqual([]);
  });

  it('chains through intermediaries into a direct settlement', () => {
    const expenses: Expense[] = [
      makeExpense('1', 10, 'B', members, 'equal', {}, ['A']),
      makeExpense('2', 10, 'C', members, 'equal', {}, ['B'])
    ];
    const nets = calculateNetBalances(expenses, members);
    expect(nets.A).toBeCloseTo(-10, 5);
    expect(nets.B).toBeCloseTo(0, 5);
    expect(nets.C).toBeCloseTo(10, 5);

    const settlements = simplifyDebts(expenses, members);
    expect(settlements).toEqual([{ from: 'A', to: 'C', amount: 10 }]);
  });

  it('ignores tiny nets below the settlement threshold', () => {
    const expenses: Expense[] = [
      {
        id: 'tiny',
        date: '2024-01-01',
        description: 'x',
        category: 'General',
        cost: 0.02,
        currency: 'USD',
        paidBy: 'A',
        splitType: 'equal',
        splits: {
          A: quantizeMoneyTruncate(0.01),
          B: quantizeMoneyTruncate(-0.01),
          C: 0
        }
      }
    ];
    expect(simplifyDebts(expenses, members)).toEqual([]);
  });
});

describe('inferSplitParticipantsFromExpense', () => {
  const members = ['A', 'B', 'C'];

  it('excludes payer from split-among when they only fund a subset equal split', () => {
    const cost = 100;
    const paidBy = 'C';
    const involved = ['A', 'B'];
    const splits = calculateSplits(
      cost,
      paidBy,
      members,
      'equal',
      {},
      involved
    );

    const { involved: recovered, owedByMember } =
      inferSplitParticipantsFromExpense({ splits, paidBy, cost }, members);

    expect(recovered).toEqual(['A', 'B']);
    expect(owedByMember.A).toBeCloseTo(50, 5);
    expect(owedByMember.B).toBeCloseTo(50, 5);
    expect(owedByMember.C).toBeUndefined();
  });

  it('includes payer when they are part of an equal split', () => {
    const cost = 99;
    const paidBy = 'C';
    const involved = ['A', 'B', 'C'];
    const splits = calculateSplits(
      cost,
      paidBy,
      members,
      'equal',
      {},
      involved
    );

    const { involved: recovered } = inferSplitParticipantsFromExpense(
      { splits, paidBy, cost },
      members
    );

    expect(new Set(recovered)).toEqual(new Set(['A', 'B', 'C']));
  });
});
