import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import ExpenseCard from '../components/ExpenseCard';
import Avatar from '../components/Avatar';
import SyncIndicator from '../components/SyncIndicator';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { calculateNetBalances, simplifyDebts } from '../utils/balance';
import { formatCurrency, parseAmount } from '../utils/format';
import {
  PlusCircle,
  Receipt,
  RefreshCw,
  Pencil,
  Check,
  X,
  Handshake,
  ArrowLeftRight
} from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    spreadsheetName,
    members,
    expenses,
    currency,
    isLoading,
    loadData,
    deleteExpense,
    renameSheet,
    settleUp
  } = useApp();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (expenses.length === 0 && !isLoading) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditing = () => {
    setDraft(spreadsheetName || '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirmRename = async () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== spreadsheetName) {
      await renameSheet(trimmed);
    }
    setEditing(false);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const [visibleCount, setVisibleCount] = useState(10);

  const netBalances = useMemo(() => calculateNetBalances(expenses, members), [expenses, members]);
  const debts = useMemo(() => simplifyDebts(expenses, members), [expenses, members]);
  const allRecent = useMemo(() => [...expenses].reverse(), [expenses]);
  const recentExpenses = allRecent.slice(0, visibleCount);
  const hasMore = visibleCount < allRecent.length;

  const getOwedAmount = (from: string, to: string): number => {
    const debt = debts.find((d) => d.from === from && d.to === to);
    return debt?.amount ?? 0;
  };

  const openSettle = (from?: string, to?: string) => {
    const f = from || (debts.length > 0 ? debts[0].from : members[0] || '');
    const t = to || (debts.length > 0 ? debts[0].to : members[1] || '');
    const amt = getOwedAmount(f, t);
    setSettleFrom(f);
    setSettleTo(t);
    setSettleAmount(amt > 0 ? amt.toFixed(2) : '');
    setShowSettle(true);
  };

  const swapSettleDirection = () => {
    const newFrom = settleTo;
    const newTo = settleFrom;
    setSettleFrom(newFrom);
    setSettleTo(newTo);
    const amt = getOwedAmount(newFrom, newTo);
    setSettleAmount(amt > 0 ? amt.toFixed(2) : '0.00');
  };

  const handleSettleFromChange = (val: string) => {
    setSettleFrom(val);
    const to =
      val === settleTo ? members.find((m) => m !== val) || '' : settleTo;
    setSettleTo(to);
    const amt = getOwedAmount(val, to);
    setSettleAmount(amt > 0 ? amt.toFixed(2) : '');
  };

  const handleSettleToChange = (val: string) => {
    setSettleTo(val);
    const amt = getOwedAmount(settleFrom, val);
    setSettleAmount(amt > 0 ? amt.toFixed(2) : '');
  };

  const handleSettle = async () => {
    const amt = parseAmount(settleAmount);
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

  const handleEdit = (id: string) => navigate(`/edit/${id}`);
  const handleDelete = (id: string) => {
    if (window.confirm('Delete this expense?')) deleteExpense(id);
  };

  if (isLoading && expenses.length === 0) {
    return (
      <Layout>
        <LoadingSpinner text="Loading expenses..." />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-4">
        {/* Header with editable name */}
        <div className="mb-6 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') cancelEditing();
                  }}
                  className="bg-bg-input border-border text-text-primary focus:border-primary min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-xl font-bold focus:outline-none"
                />
                <button
                  onClick={confirmRename}
                  className="text-positive hover:bg-positive/10 rounded-lg p-1.5 transition-colors"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={cancelEditing}
                  className="text-text-muted hover:bg-bg-surface rounded-lg p-1.5 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditing}
                className="group flex items-center gap-2 text-left"
              >
                <h1 className="text-text-primary truncate text-xl font-bold">
                  {spreadsheetName || 'SplitSheet'}
                </h1>
                <Pencil
                  size={14}
                  className="text-text-muted shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            )}
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-text-muted text-xs">
                {members.length} members
              </span>
              <SyncIndicator />
            </div>
          </div>
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="text-text-muted hover:text-primary hover:bg-bg-surface shrink-0 rounded-lg p-2 transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Member Balances */}
        {members.length > 0 && (
          <div className="bg-bg-card border-border/50 mb-6 rounded-2xl border p-4">
            <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {members.map((m) => {
                const bal = netBalances[m] || 0;
                return (
                  <div
                    key={m}
                    className="flex min-w-[64px] shrink-0 flex-col items-center"
                  >
                    <Avatar name={m} size="sm" />
                    <span className="text-text-secondary mt-1 max-w-[64px] truncate text-[11px]">
                      {m}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        bal > 0.01
                          ? 'text-positive'
                          : bal < -0.01
                            ? 'text-negative'
                            : 'text-text-muted'
                      }`}
                    >
                      {bal > 0.01 ? '+' : ''}
                      {formatCurrency(bal, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => navigate('/add')}
            className="bg-primary hover:bg-primary-dark flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-colors"
          >
            <PlusCircle size={18} /> Add Expense
          </button>
          {members.length >= 2 && (
            <button
              onClick={() => openSettle()}
              className="bg-bg-card border-border hover:border-primary/50 text-text-primary flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors"
            >
              <Handshake size={18} className="text-primary" /> Settle
            </button>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <div className="mb-3">
            <h2 className="text-text-secondary text-sm font-semibold tracking-wide uppercase">
              Recent
            </h2>
          </div>

          {recentExpenses.length === 0 ? (
            <EmptyState
              icon={<Receipt size={40} />}
              title="No expenses yet"
              description="Add your first expense to get started"
              action={
                <button
                  onClick={() => navigate('/add')}
                  className="bg-primary hover:bg-primary-dark rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-colors"
                >
                  Add Expense
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {recentExpenses.map((e) => (
                <ExpenseCard
                  key={e.id}
                  expense={e}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
              {hasMore && (
                <button
                  onClick={() => setVisibleCount((c) => c + 10)}
                  className="text-primary hover:bg-primary/10 w-full rounded-xl py-2.5 text-center text-sm font-medium transition-colors"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
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
              onChange={(e) => handleSettleFromChange(e.target.value)}
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
            <button
              onClick={swapSettleDirection}
              className="text-text-muted hover:text-primary hover:bg-bg-surface rounded-full p-2 transition-colors"
              title="Swap direction"
            >
              <ArrowLeftRight size={20} />
            </button>
          </div>

          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Who is receiving?
            </label>
            <select
              value={settleTo}
              onChange={(e) => handleSettleToChange(e.target.value)}
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
              type="text"
              inputMode="decimal"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              placeholder="0.00"
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
              !parseAmount(settleAmount)
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
