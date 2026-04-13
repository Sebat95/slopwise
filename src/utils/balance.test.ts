import { describe, it, expect } from 'vitest';
import { calculateSplits, inferSplitParticipantsFromExpense } from './balance';

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
