import type { Expense, Balance } from '../types';
import { quantizeMoneyTruncate } from './format';

export function calculateNetBalances(
  expenses: Expense[],
  members: string[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of members) balances[m] = 0;

  for (const expense of expenses) {
    for (const member of members) {
      balances[member] += expense.splits[member] ?? 0;
    }
  }

  for (const m of members) {
    balances[m] = quantizeMoneyTruncate(balances[m]);
  }

  return balances;
}

export function simplifyDebts(
  expenses: Expense[],
  members: string[]
): Balance[] {
  const nets = calculateNetBalances(expenses, members);

  const creditors: { name: string; amount: number }[] = [];
  const debtors: { name: string; amount: number }[] = [];

  for (const [name, net] of Object.entries(nets)) {
    const rounded = quantizeMoneyTruncate(net);
    if (rounded > 0.01) creditors.push({ name, amount: rounded });
    else if (rounded < -0.01) debtors.push({ name, amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements: Balance[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0.01) {
      settlements.push({
        from: debtors[di].name,
        to: creditors[ci].name,
        amount: quantizeMoneyTruncate(amount)
      });
    }
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount < 0.01) ci++;
    if (debtors[di].amount < 0.01) di++;
  }

  return settlements;
}

export function calculateSplits(
  cost: number,
  paidBy: string,
  members: string[],
  splitType: 'equal' | 'exact' | 'percentage' | 'shares',
  splitValues: Record<string, number>,
  involvedMembers?: string[]
): Record<string, number> {
  const involved = involvedMembers ?? members;
  const splits: Record<string, number> = {};

  for (const m of members) splits[m] = 0;

  const shares: Record<string, number> = {};

  switch (splitType) {
    case 'equal': {
      const perPerson = cost / involved.length;
      for (const m of involved) shares[m] = perPerson;
      break;
    }
    case 'exact': {
      for (const m of involved) shares[m] = splitValues[m] ?? 0;
      break;
    }
    case 'percentage': {
      for (const m of involved)
        shares[m] = (cost * (splitValues[m] ?? 0)) / 100;
      break;
    }
    case 'shares': {
      const totalShares = involved.reduce(
        (sum, m) => sum + (splitValues[m] ?? 0),
        0
      );
      if (totalShares > 0) {
        for (const m of involved)
          shares[m] = (cost * (splitValues[m] ?? 0)) / totalShares;
      }
      break;
    }
  }

  for (const m of members) {
    const paid = m === paidBy ? cost : 0;
    const owes = shares[m] ?? 0;
    splits[m] = quantizeMoneyTruncate(paid - owes);
  }

  // Force splits to sum to exactly zero — absorb any rounding into payer
  const sum = quantizeMoneyTruncate(
    Object.values(splits).reduce((a, b) => a + b, 0)
  );
  if (sum !== 0) {
    splits[paidBy] = quantizeMoneyTruncate(splits[paidBy] - sum);
  }

  return splits;
}

const SPLIT_SHARE_THRESHOLD = 0.001;

/**
 * From persisted per-member net splits, recover who had a positive share of the bill
 * (the "split among" set). Uses: owed = paidBy ? cost - net : -net.
 *
 * A payer who is not in the split subset only advances money (net = +cost) has owed 0
 * and is excluded — fixing equal/exact UI when splitting among a subset.
 */
export function inferSplitParticipantsFromExpense(
  expense: Pick<Expense, 'splits' | 'paidBy' | 'cost'>,
  memberOrder: string[]
): { involved: string[]; owedByMember: Record<string, number> } {
  const owedByMember: Record<string, number> = {};
  const involved: string[] = [];
  const cost = expense.cost;
  const paidBy = expense.paidBy;

  for (const m of memberOrder) {
    const net = expense.splits[m] ?? 0;
    const owed = m === paidBy ? cost - net : -net;
    if (owed > SPLIT_SHARE_THRESHOLD) {
      involved.push(m);
      owedByMember[m] = quantizeMoneyTruncate(owed);
    }
  }

  if (involved.length === 0 && paidBy) {
    involved.push(paidBy);
  }

  return { involved, owedByMember };
}
