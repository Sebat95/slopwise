import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import ExpensesPage from './ExpensesPage';
import type { Expense } from '../types';

const mockUseApp = vi.fn();

vi.mock('../contexts/AppContext', () => ({
  useApp: () => mockUseApp()
}));

const sampleExpense: Expense = {
  id: 'e1',
  date: '2026-05-01',
  description: 'Team lunch',
  category: 'Dining out',
  cost: 10_000,
  currency: 'USD',
  paidBy: 'Bob',
  splitType: 'equal',
  splits: { Alice: -5000, Bob: 5000 }
};

function renderExpensesPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <ExpensesPage />
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      expenses: [sampleExpense],
      currency: 'USD',
      isLoading: false,
      deleteExpense: vi.fn()
    });
  });

  it('renders layout with inline loading instead of blocking the whole page', () => {
    mockUseApp.mockReturnValue({
      expenses: [],
      currency: 'USD',
      isLoading: true,
      deleteExpense: vi.fn()
    });

    renderExpensesPage();

    expect(
      screen.getByRole('heading', { name: 'Expenses' })
    ).toBeInTheDocument();
    expect(screen.getByText('Loading expenses...')).toBeInTheDocument();
  });

  it('does not pass per-user split line: no you owe / you get / settled', () => {
    renderExpensesPage();

    expect(screen.getByText('Team lunch')).toBeInTheDocument();
    expect(screen.queryByText(/you owe/i)).toBeNull();
    expect(screen.queryByText(/you get/i)).toBeNull();
    expect(screen.queryByText(/settled/i)).toBeNull();

    const amountNodes = screen.getAllByText('$100.00');
    expect(amountNodes.length).toBeGreaterThanOrEqual(1);
    for (const el of amountNodes) {
      expect(el).toHaveClass('text-text-primary');
      expect(el).not.toHaveClass('text-negative');
      expect(el).not.toHaveClass('text-positive');
    }
  });
});
