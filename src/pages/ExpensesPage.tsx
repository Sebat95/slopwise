import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useConfirm } from '../contexts/ConfirmContext';
import Layout from '../components/Layout';
import ExpenseCard from '../components/ExpenseCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { Search, Receipt, PlusCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getCategoryEmoji, formatCurrency } from '../utils/format';

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { expenses, currency, isLoading, deleteExpense } = useApp();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(
    () => ['all', ...new Set(expenses.map((e) => e.category))],
    [expenses]
  );

  const sorted = useMemo(() => [...expenses].reverse(), [expenses]);

  const filtered = useMemo(
    () =>
      sorted.filter((e) => {
        const matchSearch =
          !search || e.description.toLowerCase().includes(search.toLowerCase());
        const matchCategory =
          categoryFilter === 'all' || e.category === categoryFilter;
        return matchSearch && matchCategory;
      }),
    [sorted, search, categoryFilter]
  );

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const e of filtered) {
      const key = e.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const filteredTotal = useMemo(
    () =>
      filtered
        .filter((e) => e.category !== 'Payment')
        .reduce((sum, e) => sum + e.cost, 0),
    [filtered]
  );

  const handleEdit = (id: string) => navigate(`/edit/${id}`);
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete expense?',
      message:
        'This will remove the expense from the sheet. You cannot undo this.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (ok) void deleteExpense(id).catch(() => {});
  };

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-text-primary text-xl font-bold">Expenses</h1>
          <button
            onClick={() => navigate('/add')}
            className="text-primary hover:bg-primary/10 rounded-lg p-2 transition-colors"
          >
            <PlusCircle size={22} />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="text-text-muted absolute top-1/2 left-3 -translate-y-1/2"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses..."
              className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm focus:outline-none"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-input border-border text-text-primary focus:border-primary min-w-[100px] appearance-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All' : `${getCategoryEmoji(c)} ${c}`}
              </option>
            ))}
          </select>
        </div>

        {/* Running total */}
        {filtered.length > 0 && (
          <div className="bg-bg-card border-border/50 mb-4 flex items-center justify-between rounded-xl border px-4 py-2.5">
            <span className="text-text-muted text-xs">
              {filtered.length} expense{filtered.length !== 1 ? 's' : ''}
              {search || categoryFilter !== 'all' ? ' (filtered)' : ''}
            </span>
            <span className="text-text-primary text-sm font-bold">
              {formatCurrency(filteredTotal, currency)}
            </span>
          </div>
        )}

        {isLoading && expenses.length === 0 ? (
          <LoadingSpinner text="Loading expenses..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} />}
            title={search ? 'No matches' : 'No expenses yet'}
            description={
              search ? 'Try a different search term' : 'Add your first expense'
            }
            action={
              !search ? (
                <button
                  onClick={() => navigate('/add')}
                  className="bg-primary hover:bg-primary-dark rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-colors"
                >
                  Add Expense
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
                  {(() => {
                    try {
                      return format(parseISO(date), 'EEEE, MMMM d, yyyy');
                    } catch {
                      return date;
                    }
                  })()}
                </h3>
                <div className="space-y-2">
                  {items.map((e) => (
                    <ExpenseCard
                      key={e.id}
                      expense={e}
                      showDate={false}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
