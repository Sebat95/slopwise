import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode
} from 'react';
import type { Expense, MemberInfo } from '../types';
import * as sheetsApi from '../services/sheets-api';
import { fetchUserProfile } from '../services/google-auth';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  members: string[];
  memberProfiles: Record<string, MemberInfo>;
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
  renameMember: (oldName: string, newName: string) => Promise<void>;
  linkMemberToGoogle: (memberName: string) => Promise<void>;
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
    memberProfiles: {},
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
      const [data, profiles] = await Promise.all([
        sheetsApi.readSheetData(ssId),
        sheetsApi.readMemberProfiles(ssId).catch(() => [] as MemberInfo[]),
      ]);

      const profileMap: Record<string, MemberInfo> = {};
      for (const p of profiles) profileMap[p.name] = p;

      // Save current Google user into _members
      fetchUserProfile().then(async (user) => {
        if (!user) return;
        const matchingMember = data.members.find(
          (m) => m === user.name || m.toLowerCase() === user.name.toLowerCase() ||
                 m === user.email.split('@')[0]
        );
        if (matchingMember) {
          const info: MemberInfo = { name: matchingMember, email: user.email, photoUrl: user.picture };
          profileMap[matchingMember] = info;
          setState((s) => ({ ...s, memberProfiles: { ...s.memberProfiles, [matchingMember]: info } }));
          sheetsApi.saveMemberProfile(ssId, info).catch(() => {});
        }
      });

      setState((s) => ({
        ...s,
        members: data.members,
        memberProfiles: profileMap,
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

  const renameMember = useCallback(
    async (oldName: string, newName: string) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId || !newName.trim() || oldName === newName.trim()) return;
      const trimmed = newName.trim();
      if (state.members.includes(trimmed)) return;

      setState((s) => ({
        ...s,
        members: s.members.map((m) => (m === oldName ? trimmed : m)),
        expenses: s.expenses.map((e) => {
          const newSplits = { ...e.splits };
          if (oldName in newSplits) {
            newSplits[trimmed] = newSplits[oldName];
            delete newSplits[oldName];
          }
          return {
            ...e,
            paidBy: e.paidBy === oldName ? trimmed : e.paidBy,
            splits: newSplits
          };
        }),
        memberProfiles: (() => {
          const p = { ...s.memberProfiles };
          if (p[oldName]) {
            p[trimmed] = { ...p[oldName], name: trimmed };
            delete p[oldName];
          }
          return p;
        })(),
        isSyncing: true
      }));

      try {
        await sheetsApi.renameMemberColumn(ssId, state.members, oldName, trimmed);
        const profile = state.memberProfiles[oldName];
        if (profile) {
          await sheetsApi.saveMemberProfile(ssId, { ...profile, name: trimmed }).catch(() => {});
        }
        setState((s) => ({ ...s, isSyncing: false }));
      } catch (err) {
        await loadData();
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: err instanceof Error ? err.message : 'Failed to rename member'
        }));
      }
    },
    [state.members, state.memberProfiles, loadData]
  );

  const linkMemberToGoogle = useCallback(
    async (memberName: string) => {
      const ssId = sessionStorage.getItem('splitsheet_spreadsheet_id');
      if (!ssId) return;
      const user = await fetchUserProfile();
      if (!user) return;
      const info: MemberInfo = { name: memberName, email: user.email, photoUrl: user.picture };
      setState((s) => ({
        ...s,
        memberProfiles: { ...s.memberProfiles, [memberName]: info }
      }));
      sheetsApi.saveMemberProfile(ssId, info).catch(() => {});
    },
    []
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
        renameMember,
        linkMemberToGoogle,
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
