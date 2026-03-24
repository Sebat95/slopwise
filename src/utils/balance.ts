import type { Expense, Balance } from '../types';

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
    balances[m] = Math.round(balances[m] * 100) / 100;
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
    const rounded = Math.round(net * 100) / 100;
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
        amount: Math.round(amount * 100) / 100
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
    splits[m] = Math.round((paid - owes) * 100) / 100;
  }

  // Force splits to sum to exactly zero — absorb any rounding into payer
  const sum =
    Math.round(Object.values(splits).reduce((a, b) => a + b, 0) * 100) / 100;
  if (sum !== 0) {
    splits[paidBy] = Math.round((splits[paidBy] - sum) * 100) / 100;
  }

  return splits;
}
