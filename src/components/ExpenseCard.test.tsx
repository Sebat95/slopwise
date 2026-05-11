import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExpenseCard from './ExpenseCard';
import type { Expense } from '../types';

function baseExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    date: '2026-05-01',
    description: 'Team lunch',
    category: 'Dining out',
    cost: 10_000,
    currency: 'USD',
    paidBy: 'Bob',
    splitType: 'equal',
    splits: { Alice: -5000, Bob: 5000 },
    ...overrides
  };
}

describe('ExpenseCard', () => {
  it('with currentUser (dashboard): shows you owe with text-negative when split is negative', () => {
    render(
      <ExpenseCard
        expense={baseExpense()}
        currentUser="Alice"
        onEdit={vi.fn()}
      />
    );

    const sub = screen.getByText(/you owe/i);
    expect(sub).toHaveClass('text-negative');
    expect(sub).not.toHaveClass('text-positive');

    const total = screen.getByText('$100.00');
    expect(total).toHaveClass('text-text-primary');
    expect(total).not.toHaveClass('text-negative');
    expect(total).not.toHaveClass('text-positive');
  });

  it('with currentUser (dashboard): shows you get with text-positive when split is positive', () => {
    render(
      <ExpenseCard expense={baseExpense()} currentUser="Bob" onEdit={vi.fn()} />
    );

    const sub = screen.getByText(/you get/i);
    expect(sub).toHaveClass('text-positive');
    expect(sub).not.toHaveClass('text-negative');

    const total = screen.getByText('$100.00');
    expect(total).toHaveClass('text-text-primary');
    expect(total).not.toHaveClass('text-positive');
  });

  it('with currentUser (dashboard): shows settled with muted class when split is zero', () => {
    render(
      <ExpenseCard
        expense={baseExpense({ splits: { Alice: 0, Bob: 0 } })}
        currentUser="Alice"
        onEdit={vi.fn()}
      />
    );

    const sub = screen.getByText(/settled/i);
    expect(sub).toHaveClass('text-text-muted');
  });

  it('without currentUser (expenses tab): no you owe / you get / settled line; total stays primary only', () => {
    render(<ExpenseCard expense={baseExpense()} onEdit={vi.fn()} />);

    expect(screen.queryByText(/you owe/i)).toBeNull();
    expect(screen.queryByText(/you get/i)).toBeNull();
    expect(screen.queryByText(/settled/i)).toBeNull();

    const total = screen.getByText('$100.00');
    expect(total).toHaveClass('text-text-primary');
    expect(total).not.toHaveClass('text-negative');
    expect(total).not.toHaveClass('text-positive');
    expect(total).not.toHaveClass('text-text-muted');
  });
});
