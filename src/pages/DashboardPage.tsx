import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import ExpenseCard from '../components/ExpenseCard';
import Avatar from '../components/Avatar';
import SyncIndicator from '../components/SyncIndicator';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { calculateNetBalances, simplifyDebts } from '../utils/balance';
import { formatCurrency } from '../utils/format';
import { PlusCircle, ArrowRight, Receipt, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { spreadsheetName, members, expenses, currency, isLoading, loadData } =
    useApp();

  useEffect(() => {
    if (expenses.length === 0 && !isLoading) {
      loadData();
    }
  }, []);

  const netBalances = calculateNetBalances(expenses, members);
  const debts = simplifyDebts(expenses, members);
  const recentExpenses = [...expenses].reverse().slice(0, 5);

  const totalExpenses = expenses
    .filter((e) => e.category !== 'Payment')
    .reduce((sum, e) => sum + e.cost, 0);

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
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-text-primary text-xl font-bold">
              {spreadsheetName || 'SplitSheet'}
            </h1>
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
            className="text-text-muted hover:text-primary hover:bg-bg-surface rounded-lg p-2 transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Summary Card */}
        <div className="bg-bg-card border-border/50 mb-6 rounded-2xl border p-4">
          <div className="text-text-muted mb-1 text-xs tracking-wide uppercase">
            Total expenses
          </div>
          <div className="text-text-primary mb-3 text-2xl font-bold">
            {formatCurrency(totalExpenses, currency)}
          </div>

          {/* Member Balances Row */}
          {members.length > 0 && (
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
          )}
        </div>

        {/* Outstanding Debts */}
        {debts.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-text-secondary text-sm font-semibold tracking-wide uppercase">
                Outstanding
              </h2>
              <button
                onClick={() => navigate('/balances')}
                className="text-primary flex items-center gap-0.5 text-xs hover:underline"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {debts.slice(0, 3).map((d, i) => (
                <div
                  key={i}
                  className="bg-bg-card border-border/50 flex items-center gap-3 rounded-xl border p-3"
                >
                  <Avatar name={d.from} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="text-text-primary text-sm font-medium">
                      {d.from}
                    </span>
                    <span className="text-text-muted mx-1.5 text-xs">owes</span>
                    <span className="text-text-primary text-sm font-medium">
                      {d.to}
                    </span>
                  </div>
                  <span className="text-negative text-sm font-semibold">
                    {formatCurrency(d.amount, currency)}
                  </span>
                </div>
              ))}
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
                <ExpenseCard key={e.id} expense={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
