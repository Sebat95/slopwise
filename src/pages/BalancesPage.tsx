import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import SpendingChart from '../components/SpendingChart';
import { calculateNetBalances, simplifyDebts } from '../utils/balance';
import { formatCurrency } from '../utils/format';
import {
  Scale,
  ArrowRight,
  Handshake,
  TrendingUp,
  TrendingDown,
  CalendarRange
} from 'lucide-react';

export default function BalancesPage() {
  const { members, expenses, currency, isLoading, loadData } = useApp();

  useEffect(() => {
    if (expenses.length === 0 && !isLoading) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { minDate, maxDate } = useMemo(() => {
    if (expenses.length === 0) return { minDate: '', maxDate: '' };
    const dates = expenses.map((e) => e.date).sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [expenses]);

  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const effectiveFrom = dateFrom ?? minDate;
  const effectiveTo = dateTo ?? maxDate;

  const onChartRangeChange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const resetRange = useCallback(() => {
    setDateFrom(null);
    setDateTo(null);
  }, []);

  const filteredExpenses = useMemo(() => {
    if (!effectiveFrom && !effectiveTo) return expenses;
    return expenses.filter((e) => {
      if (effectiveFrom && e.date < effectiveFrom) return false;
      if (effectiveTo && e.date > effectiveTo) return false;
      return true;
    });
  }, [expenses, effectiveFrom, effectiveTo]);

  const totalExpenses = useMemo(
    () =>
      filteredExpenses
        .filter((e) => e.category !== 'Payment')
        .reduce((sum, e) => sum + e.cost, 0),
    [filteredExpenses]
  );

  const perPersonSpending = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const m of members) totals[m] = 0;
    for (const exp of filteredExpenses) {
      if (exp.category === 'Payment') continue;
      for (const m of members) {
        const net = exp.splits[m] ?? 0;
        const paid = m === exp.paidBy ? exp.cost : 0;
        totals[m] += paid - net;
      }
    }
    return totals;
  }, [filteredExpenses, members]);

  const netBalances = useMemo(
    () => calculateNetBalances(filteredExpenses, members),
    [filteredExpenses, members]
  );
  const debts = useMemo(
    () => simplifyDebts(filteredExpenses, members),
    [filteredExpenses, members]
  );

  const sorted = useMemo(
    () =>
      [...members].sort(
        (a, b) => (netBalances[b] || 0) - (netBalances[a] || 0)
      ),
    [members, netBalances]
  );

  const isRangeModified = dateFrom !== null || dateTo !== null;

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-4">
        <div className="mb-6">
          <h1 className="text-text-primary text-xl font-bold">Stats</h1>
        </div>

        {/* Date Range + Total */}
        <div className="bg-bg-card border-border/50 mb-6 rounded-2xl border p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange size={14} className="text-text-muted" />
            <span className="text-text-muted text-xs font-semibold tracking-wide uppercase">
              Date Range
            </span>
            {isRangeModified && (
              <button
                onClick={resetRange}
                className="text-primary ml-auto text-xs hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-bg-input border-border text-text-primary focus:border-primary flex-1 rounded-lg border px-3 py-2 text-xs focus:outline-none"
            />
            <span className="text-text-muted text-xs">to</span>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-bg-input border-border text-text-primary focus:border-primary flex-1 rounded-lg border px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <div className="border-border/30 mt-4 border-t pt-3">
            <div className="text-text-muted text-[10px] tracking-wide uppercase">
              Total Expenses
            </div>
            <div className="text-text-primary text-2xl font-bold">
              {formatCurrency(totalExpenses, currency)}
            </div>
            {members.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {members.map((m) => (
                  <div key={m} className="text-text-secondary text-xs">
                    <span className="text-text-muted">{m}:</span>{' '}
                    {formatCurrency(perPersonSpending[m] || 0, currency)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {members.length === 0 ? (
          <EmptyState
            icon={<Scale size={40} />}
            title="No members yet"
            description="Add expenses to see balances"
          />
        ) : (
          <>
            {/* Spending Chart with interactive brush */}
            {expenses.length >= 2 && (
              <div className="mb-6">
                <SpendingChart
                  expenses={expenses}
                  members={members}
                  dateFrom={effectiveFrom}
                  dateTo={effectiveTo}
                  onRangeChange={onChartRangeChange}
                />
              </div>
            )}

            {/* Net Balances */}
            <div className="mb-6">
              <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
                Net Balances
              </h2>
              <div className="space-y-2">
                {sorted.map((m) => {
                  const bal = netBalances[m] || 0;
                  const maxBal = Math.max(
                    ...Object.values(netBalances).map(Math.abs),
                    1
                  );
                  const pct = (Math.abs(bal) / maxBal) * 100;
                  return (
                    <div
                      key={m}
                      className="bg-bg-card border-border/50 rounded-xl border p-3"
                    >
                      <div className="mb-2 flex items-center gap-3">
                        <Avatar name={m} size="sm" />
                        <span className="text-text-primary flex-1 text-sm font-medium">
                          {m}
                        </span>
                        <div className="flex items-center gap-1">
                          {bal > 0.01 && (
                            <TrendingUp size={14} className="text-positive" />
                          )}
                          {bal < -0.01 && (
                            <TrendingDown size={14} className="text-negative" />
                          )}
                          <span
                            className={`text-sm font-bold ${bal > 0.01 ? 'text-positive' : bal < -0.01 ? 'text-negative' : 'text-text-muted'}`}
                          >
                            {bal > 0 ? '+' : ''}
                            {formatCurrency(bal, currency)}
                          </span>
                        </div>
                      </div>
                      <div className="bg-bg-surface h-1.5 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${bal >= 0 ? 'bg-positive' : 'bg-negative'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simplified Debts */}
            {debts.length > 0 && (
              <div>
                <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
                  Simplified Debts ({debts.length} payment
                  {debts.length !== 1 ? 's' : ''})
                </h2>
                <div className="space-y-2">
                  {debts.map((d, i) => (
                    <div
                      key={i}
                      className="bg-bg-card border-border/50 flex items-center gap-3 rounded-xl border p-3.5"
                    >
                      <Avatar name={d.from} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-sm font-medium">
                            {d.from}
                          </span>
                          <ArrowRight size={14} className="text-text-muted" />
                          <span className="text-text-primary text-sm font-medium">
                            {d.to}
                          </span>
                        </div>
                      </div>
                      <span className="text-negative text-sm font-bold">
                        {formatCurrency(d.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {debts.length === 0 && expenses.length > 0 && (
              <EmptyState
                icon={<Handshake size={40} />}
                title="All settled up!"
                description="No outstanding debts between members"
              />
            )}
          </>
        )}
      </div>

      {/* Quick Stats */}
      {members.length > 0 && (
        <div className="mx-auto max-w-lg px-4 pb-4">
          <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
            Overview
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-bg-card border-border/50 rounded-xl border p-3 text-center">
              <p className="text-text-primary text-lg font-bold">
                {expenses.length}
              </p>
              <p className="text-text-muted text-[10px]">Expenses</p>
            </div>
            <div className="bg-bg-card border-border/50 rounded-xl border p-3 text-center">
              <p className="text-text-primary text-lg font-bold">
                {members.length}
              </p>
              <p className="text-text-muted text-[10px]">Members</p>
            </div>
            <div className="bg-bg-card border-border/50 rounded-xl border p-3 text-center">
              <p className="text-text-primary text-lg font-bold">{currency}</p>
              <p className="text-text-muted text-[10px]">Currency</p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
