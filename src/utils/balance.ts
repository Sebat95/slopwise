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
    const cents = Math.trunc(net);
    if (cents > 0) creditors.push({ name, amount: cents });
    else if (cents < 0) debtors.push({ name, amount: -cents });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements: Balance[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].amount, debtors[di].amount);
    if (amount > 0) {
      settlements.push({
        from: debtors[di].name,
        to: creditors[ci].name,
        amount
      });
    }
    creditors[ci].amount -= amount;
    debtors[di].amount -= amount;
    if (creditors[ci].amount <= 0) ci++;
    if (debtors[di].amount <= 0) di++;
  }

  return settlements;
}

/**
 * Mutates `splits` (integer cents) so values sum to zero by moving any residual onto `paidBy`.
 */
export function absorbSplitSumIntoPayer(
  splits: Record<string, number>,
  paidBy: string
): void {
  if (!paidBy) return;
  const sum = Object.values(splits).reduce((a, b) => a + b, 0);
  if (sum !== 0) {
    splits[paidBy] = (splits[paidBy] ?? 0) - sum;
  }
}

export function calculateSplits(
  cost: number, // cents
  paidBy: string,
  members: string[],
  splitType: 'equal' | 'exact' | 'percentage' | 'shares',
  splitValues: Record<string, number>, // cents for exact; basis-points for %; hundredths-of-share for shares
  involvedMembers?: string[]
): Record<string, number> {
  const involved = involvedMembers ?? members;
  const splits: Record<string, number> = {};

  for (const m of members) splits[m] = 0;

  const owedCents: Record<string, number> = {};

  switch (splitType) {
    case 'equal': {
      const n = Math.max(1, involved.length);
      const base = Math.trunc(cost / n);
      let rem = cost - base * n;
      for (const m of involved) {
        const add = rem > 0 ? 1 : 0;
        owedCents[m] = base + add;
        if (rem > 0) rem--;
      }
      break;
    }
    case 'exact': {
      for (const m of involved) owedCents[m] = Math.trunc(splitValues[m] ?? 0);
      break;
    }
    case 'percentage': {
      // splitValues are basis points (percent * 100). e.g. 12.34% => 1234.
      let sum = 0;
      const order = [...involved];
      for (const m of order) {
        const bps = Math.trunc(splitValues[m] ?? 0);
        const share = Math.trunc((cost * bps) / 10000);
        owedCents[m] = share;
        sum += share;
      }
      let rem = cost - sum;
      for (const m of order) {
        if (rem <= 0) break;
        owedCents[m] = (owedCents[m] ?? 0) + 1;
        rem--;
      }
      break;
    }
    case 'shares': {
      const order = [...involved];
      const totalShares = order.reduce(
        (sum, m) => sum + (splitValues[m] ?? 0),
        0
      );
      if (totalShares <= 0) break;
      let sum = 0;
      for (const m of order) {
        const sh = Math.trunc(splitValues[m] ?? 0);
        const share = Math.trunc((cost * sh) / totalShares);
        owedCents[m] = share;
        sum += share;
      }
      let rem = cost - sum;
      for (const m of order) {
        if (rem <= 0) break;
        owedCents[m] = (owedCents[m] ?? 0) + 1;
        rem--;
      }
      break;
    }
  }

  for (const m of members) {
    const paid = m === paidBy ? cost : 0;
    const owes = owedCents[m] ?? 0;
    splits[m] = paid - owes;
  }

  absorbSplitSumIntoPayer(splits, paidBy);

  return splits;
}

const SPLIT_SHARE_THRESHOLD_CENTS = 1;

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Recover integer share counts from persisted net splits (owed cents are proportional
 * to shares). Reduces by GCD so 25¢ : 75¢ becomes 1 : 3, not 25 : 75.
 */
export function inferShareValuesFromExpense(
  expense: Pick<Expense, 'splits' | 'paidBy' | 'cost'>,
  memberOrder: string[]
): Record<string, number> {
  const { involved, owedByMember } = inferSplitParticipantsFromExpense(
    expense,
    memberOrder
  );
  const owedAmounts = involved
    .map((m) => owedByMember[m] ?? 0)
    .filter((v) => v > 0);
  if (owedAmounts.length === 0) {
    return Object.fromEntries(involved.map((m) => [m, 1]));
  }
  const divisor = owedAmounts.reduce((acc, v) => gcd(acc, v));
  const shares: Record<string, number> = {};
  for (const m of involved) {
    const owed = owedByMember[m] ?? 0;
    shares[m] = owed > 0 ? Math.max(1, Math.trunc(owed / divisor)) : 1;
  }
  return shares;
}

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
    if (owed >= SPLIT_SHARE_THRESHOLD_CENTS) {
      involved.push(m);
      owedByMember[m] = Math.trunc(owed);
    }
  }

  if (involved.length === 0 && paidBy) {
    involved.push(paidBy);
  }

  return { involved, owedByMember };
}
