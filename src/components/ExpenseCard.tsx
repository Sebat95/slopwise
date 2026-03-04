import type { Expense } from '../types';
import { formatCurrency, formatDateShort, getCategoryEmoji } from '../utils/format';
import { Trash2 } from 'lucide-react';

interface Props {
  expense: Expense;
  currentUser?: string;
  onDelete?: (id: string) => void;
}

export default function ExpenseCard({ expense, currentUser, onDelete }: Props) {
  const isSettlement = expense.category === 'Payment';

  return (
    <div className="flex items-center gap-3 p-3 bg-bg-card rounded-xl border border-border/50 hover:border-border transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-bg-surface flex items-center justify-center text-lg shrink-0">
        {getCategoryEmoji(expense.category)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">
            {expense.description}
          </span>
          {isSettlement && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
              settle
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted mt-0.5">
          {formatDateShort(expense.date)} · {expense.paidBy} paid
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-semibold text-text-primary">
          {formatCurrency(expense.cost, expense.currency)}
        </div>
        {currentUser && expense.splits[currentUser] !== undefined && (
          <div
            className={`text-xs font-medium ${
              expense.splits[currentUser] > 0
                ? 'text-positive'
                : expense.splits[currentUser] < 0
                  ? 'text-negative'
                  : 'text-text-muted'
            }`}
          >
            {expense.splits[currentUser] > 0
              ? `you get ${formatCurrency(expense.splits[currentUser], expense.currency)}`
              : expense.splits[currentUser] < 0
                ? `you owe ${formatCurrency(-expense.splits[currentUser], expense.currency)}`
                : 'settled'}
          </div>
        )}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(expense.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-danger transition-all rounded-lg hover:bg-danger/10"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
