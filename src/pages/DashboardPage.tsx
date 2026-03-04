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
  const { spreadsheetName, members, expenses, currency, isLoading, loadData } = useApp();

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
      <div className="px-4 py-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{spreadsheetName || 'SplitSheet'}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-muted">{members.length} members</span>
              <SyncIndicator />
            </div>
          </div>
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-bg-surface transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Summary Card */}
        <div className="bg-bg-card border border-border/50 rounded-2xl p-4 mb-6">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Total expenses</div>
          <div className="text-2xl font-bold text-text-primary mb-3">
            {formatCurrency(totalExpenses, currency)}
          </div>

          {/* Member Balances Row */}
          {members.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {members.map((m) => {
                const bal = netBalances[m] || 0;
                return (
                  <div key={m} className="flex flex-col items-center min-w-[64px] shrink-0">
                    <Avatar name={m} size="sm" />
                    <span className="text-[11px] text-text-secondary mt-1 truncate max-w-[64px]">{m}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        bal > 0.01 ? 'text-positive' : bal < -0.01 ? 'text-negative' : 'text-text-muted'
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Outstanding</h2>
              <button
                onClick={() => navigate('/balances')}
                className="text-xs text-primary flex items-center gap-0.5 hover:underline"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {debts.slice(0, 3).map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-bg-card border border-border/50 rounded-xl">
                  <Avatar name={d.from} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-primary font-medium">{d.from}</span>
                    <span className="text-xs text-text-muted mx-1.5">owes</span>
                    <span className="text-sm text-text-primary font-medium">{d.to}</span>
                  </div>
                  <span className="text-sm font-semibold text-negative">
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
          className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark transition-colors mb-6"
        >
          <PlusCircle size={18} /> Add Expense
        </button>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Recent</h2>
            {expenses.length > 5 && (
              <button
                onClick={() => navigate('/expenses')}
                className="text-xs text-primary flex items-center gap-0.5 hover:underline"
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
                  className="bg-primary text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
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
