import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode
} from 'react';
import type { Expense } from '../types';
import * as sheetsApi from '../services/sheets-api';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  members: string[];
  expenses: Expense[];
  currency: string;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSync: Date | null;
}

interface AppContextValue extends AppState {
  selectSpreadsheet: (id: string, name: string) => void;
  loadData: () => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>;
  updateExpense: (
    expenseId: string,
    updated: Omit<Expense, 'id'>
  ) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  addMember: (name: string) => Promise<void>;
  settleUp: (from: string, to: string, amount: number) => Promise<void>;
  renameSheet: (newName: string) => Promise<void>;
  importExpenses: (
    newExpenses: Expense[],
    newMembers: string[]
  ) => Promise<void>;
  disconnect: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    spreadsheetId: sessionStorage.getItem('splitsheet_spreadsheet_id'),
    spreadsheetName: sessionStorage.getItem('splitsheet_spreadsheet_name'),
    members: [],
    expenses: [],
    currency: 'EUR',
    isLoading: false,
    isSyncing: false,
    error: null,
    lastSync: null
  });

  const selectSpreadsheet = useCallback((id: string, name: string) => {
    sessionStorage.setItem('splitsheet_spreadsheet_id', id);
    sessionStorage.setItem('splitsheet_spreadsheet_name', name);
    setState((s) => ({
      ...s,
      spreadsheetId: id,
      spreadsheetName: name,
      members: [],
      expenses: []
    }));
  }, []);

  const loadData = useCallback(async () => {
    const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
    if (!ssId) return;

    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await sheetsApi.readSheetData(ssId);
      setState((s) => ({
        ...s,
        members: data.members,
        expenses: data.expenses,
        currency: data.currency,
        isLoading: false,
        lastSync: new Date()
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load data'
      }));
    }
  }, []);

  const addExpense = useCallback(
    async (expense: Omit<Expense, 'id'>) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;

      const newExpense: Expense = { ...expense, id: uuidv4() };
      setState((s) => ({
        ...s,
        expenses: [...s.expenses, newExpense],
        isSyncing: true
      }));

      try {
        await sheetsApi.appendExpense(ssId, newExpense, state.members);
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to save expense',
          expenses: s.expenses.filter((e) => e.id !== newExpense.id)
        }));
      }
    },
    [state.members]
  );

  const updateExpense = useCallback(
    async (expenseId: string, updated: Omit<Expense, 'id'>) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;

      const idx = state.expenses.findIndex((e) => e.id === expenseId);
      if (idx < 0) return;

      const updatedExpense: Expense = { ...updated, id: expenseId };
      const backup = [...state.expenses];

      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) =>
          e.id === expenseId ? updatedExpense : e
        ),
        isSyncing: true
      }));

      try {
        await sheetsApi.updateExpenseRow(
          ssId,
          idx,
          updatedExpense,
          state.members
        );
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        setState((s) => ({
          ...s,
          expenses: backup,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to update expense'
        }));
      }
    },
    [state.expenses, state.members]
  );

  const deleteExpense = useCallback(
    async (expenseId: string) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;

      const idx = state.expenses.findIndex((e) => e.id === expenseId);
      if (idx < 0) return;

      const backup = [...state.expenses];
      setState((s) => ({
        ...s,
        expenses: s.expenses.filter((e) => e.id !== expenseId),
        isSyncing: true
      }));

      try {
        await sheetsApi.deleteExpenseRow(ssId, idx);
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        setState((s) => ({
          ...s,
          expenses: backup,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to delete expense'
        }));
      }
    },
    [state.expenses]
  );

  const addMember = useCallback(
    async (name: string) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;
      if (state.members.includes(name)) return;

      setState((s) => ({ ...s, isSyncing: true }));
      try {
        await sheetsApi.addMemberColumn(ssId, state.members, name);
        setState((s) => ({
          ...s,
          members: [...s.members, name],
          isSyncing: false
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to add member'
        }));
      }
    },
    [state.members]
  );

  const settleUp = useCallback(
    async (from: string, to: string, amount: number) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;

      const splits: Record<string, number> = {};
      for (const m of state.members) splits[m] = 0;
      splits[from] = amount;
      splits[to] = -amount;

      const settlement: Expense = {
        id: uuidv4(),
        date: new Date().toISOString().split('T')[0],
        description: `${from} paid ${to}`,
        category: 'Payment',
        cost: amount,
        currency: state.currency,
        paidBy: from,
        splitType: 'exact',
        splits
      };

      setState((s) => ({
        ...s,
        expenses: [...s.expenses, settlement],
        isSyncing: true
      }));

      try {
        await sheetsApi.appendExpense(ssId, settlement, state.members);
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          error:
            err instanceof Error ? err.message : 'Failed to save settlement',
          expenses: s.expenses.filter((e) => e.id !== settlement.id)
        }));
      }
    },
    [state.members, state.currency]
  );

  const renameSheet = useCallback(
    async (newName: string) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId || !newName.trim()) return;

      const trimmed = newName.trim();
      const oldName = state.spreadsheetName;

      sessionStorage.setItem('splitsheet_spreadsheet_name', trimmed);
      setState((s) => ({ ...s, spreadsheetName: trimmed, isSyncing: true }));

      try {
        await sheetsApi.renameSpreadsheet(ssId, trimmed);
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        sessionStorage.setItem('splitsheet_spreadsheet_name', oldName || '');
        setState((s) => ({
          ...s,
          spreadsheetName: oldName,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to rename sheet'
        }));
      }
    },
    [state.spreadsheetName]
  );

  const importExpenses = useCallback(
    async (newExpenses: Expense[], newMembers: string[]) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;

      setState((s) => ({ ...s, isSyncing: true }));
      try {
        const allMembers = [...new Set([...state.members, ...newMembers])];
        const allExpenses = [...state.expenses, ...newExpenses];

        await sheetsApi.writeAllExpenses(
          ssId,
          allExpenses,
          allMembers,
          state.currency
        );
        setState((s) => ({
          ...s,
          members: allMembers,
          expenses: allExpenses,
          isSyncing: false,
          lastSync: new Date()
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to import'
        }));
      }
    },
    [state.members, state.expenses, state.currency]
  );

  const disconnect = useCallback(() => {
    sessionStorage.removeItem('splitsheet_spreadsheet_id');
    sessionStorage.removeItem('splitsheet_spreadsheet_name');
    setState((s) => ({
      ...s,
      spreadsheetId: null,
      spreadsheetName: null,
      members: [],
      expenses: []
    }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
        selectSpreadsheet,
        loadData,
        addExpense,
        updateExpense,
        deleteExpense,
        addMember,
        settleUp,
        renameSheet,
        importExpenses,
        disconnect
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
