import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import ExpenseCard from '../components/ExpenseCard';
import Avatar from '../components/Avatar';
import SyncIndicator from '../components/SyncIndicator';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { calculateNetBalances } from '../utils/balance';
import { formatCurrency } from '../utils/format';
import {
  PlusCircle,
  Receipt,
  RefreshCw,
  Pencil,
  Check,
  X,
  ArrowRight
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
    renameSheet
  } = useApp();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expenses.length === 0 && !isLoading) {
      loadData();
    }
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

  const netBalances = calculateNetBalances(expenses, members);
  const recentExpenses = [...expenses].reverse().slice(0, 5);

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

        {/* Quick Add */}
        <button
          onClick={() => navigate('/add')}
          className="bg-primary hover:bg-primary-dark mb-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          <PlusCircle size={18} /> Add Expense
        </button>

        {/* Recent Activity */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-text-secondary text-sm font-semibold tracking-wide uppercase">
              Recent
            </h2>
            {expenses.length > 5 && (
              <button
                onClick={() => navigate('/expenses')}
                className="text-primary flex items-center gap-0.5 text-xs hover:underline"
              >
                View all <ArrowRight size={12} />
              </button>
            )}
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
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
