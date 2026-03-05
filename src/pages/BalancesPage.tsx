import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import SpendingChart from '../components/SpendingChart';
import { calculateNetBalances, simplifyDebts } from '../utils/balance';
import { formatCurrency } from '../utils/format';
import {
  Scale,
  ArrowRight,
  Handshake,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

export default function BalancesPage() {
  const { members, expenses, currency, settleUp } = useApp();
  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settling, setSettling] = useState(false);

  const netBalances = calculateNetBalances(expenses, members);
  const debts = simplifyDebts(expenses, members);

  const openSettle = (from?: string, to?: string, amount?: number) => {
    setSettleFrom(from || members[0] || '');
    setSettleTo(to || members[1] || '');
    setSettleAmount(amount ? amount.toFixed(2) : '');
    setShowSettle(true);
  };

  const handleSettle = async () => {
    const amt = parseFloat(settleAmount);
    if (!settleFrom || !settleTo || settleFrom === settleTo || !amt || amt <= 0)
      return;

    setSettling(true);
    try {
      await settleUp(settleFrom, settleTo, amt);
      setShowSettle(false);
    } catch {
    } finally {
      setSettling(false);
    }
  };

  const sorted = [...members].sort(
    (a, b) => (netBalances[b] || 0) - (netBalances[a] || 0)
  );

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-text-primary text-xl font-bold">Balances</h1>
          <button
            onClick={() => openSettle()}
            className="bg-primary hover:bg-primary-dark flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            <Handshake size={16} /> Settle Up
          </button>
        </div>

        {members.length === 0 ? (
          <EmptyState
            icon={<Scale size={40} />}
            title="No members yet"
            description="Add expenses to see balances"
          />
        ) : (
          <>
            {/* Spending Over Time Chart */}
            {expenses.length >= 2 && (
              <div className="mb-6">
                <SpendingChart
                  expenses={expenses}
                  members={members}
                  currency={currency}
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
                    <button
                      key={i}
                      onClick={() => openSettle(d.from, d.to, d.amount)}
                      className="bg-bg-card border-border/50 hover:border-primary/30 flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
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
                        <p className="text-text-muted mt-0.5 text-xs">
                          Tap to settle
                        </p>
                      </div>
                      <span className="text-negative text-sm font-bold">
                        {formatCurrency(d.amount, currency)}
                      </span>
                    </button>
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

      {/* Settle Up Modal */}
      <Modal
        open={showSettle}
        onClose={() => setShowSettle(false)}
        title="Settle Up"
      >
        <div className="space-y-4">
          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Who is paying?
            </label>
            <select
              value={settleFrom}
              onChange={(e) => setSettleFrom(e.target.value)}
              className="bg-bg-input border-border text-text-primary focus:border-primary w-full appearance-none rounded-xl border px-4 py-3 text-sm focus:outline-none"
            >
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center">
            <ArrowRight size={20} className="text-text-muted" />
          </div>

          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Who is receiving?
            </label>
            <select
              value={settleTo}
              onChange={(e) => setSettleTo(e.target.value)}
              className="bg-bg-input border-border text-text-primary focus:border-primary w-full appearance-none rounded-xl border px-4 py-3 text-sm focus:outline-none"
            >
              {members
                .filter((m) => m !== settleFrom)
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Amount
            </label>
            <input
              type="number"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          <button
            onClick={handleSettle}
            disabled={
              settling ||
              !settleFrom ||
              !settleTo ||
              settleFrom === settleTo ||
              !parseFloat(settleAmount)
            }
            className="bg-primary hover:bg-primary-dark w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {settling ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}
