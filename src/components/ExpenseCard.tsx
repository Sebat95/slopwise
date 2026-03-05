import type { Expense } from '../types';
import {
  formatCurrency,
  formatDateShort,
  getCategoryEmoji
} from '../utils/format';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  expense: Expense;
  currentUser?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function ExpenseCard({
  expense,
  currentUser,
  onEdit,
  onDelete
}: Props) {
  const isSettlement = expense.category === 'Payment';

  return (
    <div
      className="bg-bg-card border-border/50 hover:border-border group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
      onClick={() => onEdit?.(expense.id)}
    >
      <div className="bg-bg-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg">
        {getCategoryEmoji(expense.category)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-text-primary truncate font-medium">
            {expense.description}
          </span>
          {isSettlement && (
            <span className="bg-primary/20 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              settle
            </span>
          )}
        </div>
        <div className="text-text-muted mt-0.5 text-xs">
          {formatDateShort(expense.date)} · {expense.paidBy} paid
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-text-primary font-semibold">
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
      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(expense.id);
            }}
            className="text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg p-1.5 transition-colors"
          >
            <Pencil size={14} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(expense.id);
            }}
            className="text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg p-1.5 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
