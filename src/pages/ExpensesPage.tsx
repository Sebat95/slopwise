import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import Layout from '../components/Layout';
import ExpenseCard from '../components/ExpenseCard';
import EmptyState from '../components/EmptyState';
import { Search, Receipt, PlusCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { expenses, deleteExpense } = useApp();
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
        const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
        const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;
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

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this expense?')) deleteExpense(id);
  };

  return (
    <Layout>
      <div className="px-4 py-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-text-primary">Expenses</h1>
          <button
            onClick={() => navigate('/add')}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <PlusCircle size={22} />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses..."
              className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-input border border-border rounded-xl px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none min-w-[100px]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All' : c}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} />}
            title={search ? 'No matches' : 'No expenses yet'}
            description={search ? 'Try a different search term' : 'Add your first expense'}
            action={
              !search ? (
                <button
                  onClick={() => navigate('/add')}
                  className="bg-primary text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
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
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
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
                    <ExpenseCard key={e.id} expense={e} onDelete={handleDelete} />
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
