import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { calculateNetBalances, simplifyDebts } from '../utils/balance';
import { formatCurrency } from '../utils/format';
import { Scale, ArrowRight, Handshake, TrendingUp, TrendingDown } from 'lucide-react';

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
    if (!settleFrom || !settleTo || settleFrom === settleTo || !amt || amt <= 0) return;

    setSettling(true);
    try {
      await settleUp(settleFrom, settleTo, amt);
      setShowSettle(false);
    } catch {
    } finally {
      setSettling(false);
    }
  };

  const sorted = [...members].sort((a, b) => (netBalances[b] || 0) - (netBalances[a] || 0));

  return (
    <Layout>
      <div className="px-4 py-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-text-primary">Balances</h1>
          <button
            onClick={() => openSettle()}
            className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
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
            {/* Net Balances */}
            <div className="mb-6">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Net Balances</h2>
              <div className="space-y-2">
                {sorted.map((m) => {
                  const bal = netBalances[m] || 0;
                  const maxBal = Math.max(...Object.values(netBalances).map(Math.abs), 1);
                  const pct = Math.abs(bal) / maxBal * 100;
                  return (
                    <div key={m} className="p-3 bg-bg-card border border-border/50 rounded-xl">
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar name={m} size="sm" />
                        <span className="text-sm font-medium text-text-primary flex-1">{m}</span>
                        <div className="flex items-center gap-1">
                          {bal > 0.01 && <TrendingUp size={14} className="text-positive" />}
                          {bal < -0.01 && <TrendingDown size={14} className="text-negative" />}
                          <span className={`text-sm font-bold ${bal > 0.01 ? 'text-positive' : bal < -0.01 ? 'text-negative' : 'text-text-muted'}`}>
                            {bal > 0 ? '+' : ''}{formatCurrency(bal, currency)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-bg-surface rounded-full overflow-hidden">
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
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                  Simplified Debts ({debts.length} payment{debts.length !== 1 ? 's' : ''})
                </h2>
                <div className="space-y-2">
                  {debts.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => openSettle(d.from, d.to, d.amount)}
                      className="w-full flex items-center gap-3 p-3.5 bg-bg-card border border-border/50 rounded-xl hover:border-primary/30 transition-colors text-left"
                    >
                      <Avatar name={d.from} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{d.from}</span>
                          <ArrowRight size={14} className="text-text-muted" />
                          <span className="text-sm font-medium text-text-primary">{d.to}</span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">Tap to settle</p>
                      </div>
                      <span className="text-sm font-bold text-negative">{formatCurrency(d.amount, currency)}</span>
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
      <Modal open={showSettle} onClose={() => setShowSettle(false)} title="Settle Up">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Who is paying?</label>
            <select
              value={settleFrom}
              onChange={(e) => setSettleFrom(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none"
            >
              {members.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-center">
            <ArrowRight size={20} className="text-text-muted" />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Who is receiving?</label>
            <select
              value={settleTo}
              onChange={(e) => setSettleTo(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none"
            >
              {members.filter((m) => m !== settleFrom).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Amount</label>
            <input
              type="number"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={handleSettle}
            disabled={settling || !settleFrom || !settleTo || settleFrom === settleTo || !parseFloat(settleAmount)}
            className="w-full bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {settling ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}
