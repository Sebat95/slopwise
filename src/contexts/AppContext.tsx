import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
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

interface AppActions {
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

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

function getSsId(): string | null {
  return sessionStorage.getItem('splitsheet_spreadsheet_id');
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    spreadsheetId: getSsId(),
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

  const stateRef = useRef(state);
  stateRef.current = state;

  const selectSpreadsheet = useCallback((id: string, name: string) => {
    sessionStorage.setItem('splitsheet_spreadsheet_id', id);
    sessionStorage.setItem('splitsheet_spreadsheet_name', name);
    setState((s) => ({
      ...s,
      spreadsheetId: id,
      spreadsheetName: name,
      members: [],
      memberProfiles: {},
      expenses: []
    }));
  }, []);

  const loadData = useCallback(async () => {
    const ssId = getSsId();
    if (!ssId) return;

    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const [data, profiles] = await Promise.all([
        sheetsApi.readSheetData(ssId),
        sheetsApi.readMemberProfiles(ssId).catch((): MemberInfo[] => [])
      ]);

      const profileMap: Record<string, MemberInfo> = {};
      for (const p of profiles) {
        if (p.name && data.members.includes(p.name)) {
          profileMap[p.name] = p;
        }
      }

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

  const addExpense = useCallback(async (expense: Omit<Expense, 'id'>) => {
    const ssId = getSsId();
    if (!ssId) return;

    const newExpense: Expense = { ...expense, id: uuidv4() };
    setState((s) => ({
      ...s,
      expenses: [...s.expenses, newExpense],
      isSyncing: true
    }));

    try {
      await sheetsApi.appendExpense(ssId, newExpense, stateRef.current.members);
      setState((s) => ({ ...s, isSyncing: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isSyncing: false,
        error: err instanceof Error ? err.message : 'Failed to save expense',
        expenses: s.expenses.filter((e) => e.id !== newExpense.id)
      }));
    }
  }, []);

  const updateExpense = useCallback(
    async (expenseId: string, updated: Omit<Expense, 'id'>) => {
      const ssId = getSsId();
      if (!ssId) return;

      const current = stateRef.current;
      const idx = current.expenses.findIndex((e) => e.id === expenseId);
      if (idx < 0) return;

      const updatedExpense: Expense = { ...updated, id: expenseId };
      const backup = [...current.expenses];

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
          current.members
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
    []
  );

  const deleteExpense = useCallback(async (expenseId: string) => {
    const ssId = getSsId();
    if (!ssId) return;

    const current = stateRef.current;
    const idx = current.expenses.findIndex((e) => e.id === expenseId);
    if (idx < 0) return;

    const backup = [...current.expenses];
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
  }, []);

  const addMember = useCallback(async (name: string) => {
    const ssId = getSsId();
    if (!ssId) return;
    const current = stateRef.current;
    if (current.members.includes(name)) return;

    setState((s) => ({ ...s, isSyncing: true }));
    try {
      await sheetsApi.addMemberColumn(ssId, current.members, name);
      const newProfiles = [
        ...current.members.map(
          (m) =>
            current.memberProfiles[m] || { name: m, email: '', photoUrl: '' }
        ),
        { name, email: '', photoUrl: '' }
      ];
      await sheetsApi.writeAllMemberProfiles(ssId, newProfiles).catch(() => {});
      setState((s) => ({
        ...s,
        members: [...s.members, name],
        memberProfiles: {
          ...s.memberProfiles,
          [name]: { name, email: '', photoUrl: '' }
        },
        isSyncing: false
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isSyncing: false,
        error: err instanceof Error ? err.message : 'Failed to add member'
      }));
    }
  }, []);

  const renameMember = useCallback(
    async (oldName: string, newName: string) => {
      const ssId = getSsId();
      if (!ssId || !newName.trim() || oldName === newName.trim()) return;
      const trimmed = newName.trim();
      const current = stateRef.current;
      if (current.members.includes(trimmed)) return;

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
        await sheetsApi.renameMemberColumn(
          ssId,
          current.members,
          oldName,
          trimmed
        );
        const updatedProfiles: MemberInfo[] = current.members.map((m) => {
          if (m === oldName) {
            const p = current.memberProfiles[oldName];
            return {
              name: trimmed,
              email: p?.email || '',
              photoUrl: p?.photoUrl || ''
            };
          }
          return (
            current.memberProfiles[m] || { name: m, email: '', photoUrl: '' }
          );
        });
        await sheetsApi
          .writeAllMemberProfiles(ssId, updatedProfiles)
          .catch(() => {});
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
    [loadData]
  );

  const linkMemberToGoogle = useCallback(async (memberName: string) => {
    const ssId = getSsId();
    if (!ssId) return;

    setState((s) => ({ ...s, isSyncing: true }));

    try {
      const user = await fetchUserProfile();
      if (!user) {
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: 'Could not fetch Google profile. Try signing out and back in.'
        }));
        return;
      }

      const newInfo: MemberInfo = {
        name: memberName,
        email: user.email,
        photoUrl: user.picture
      };

      // Build updated profiles: unlink any other member with this email
      const current = stateRef.current;
      const updatedProfiles: Record<string, MemberInfo> = {
        ...current.memberProfiles
      };
      for (const key of Object.keys(updatedProfiles)) {
        if (updatedProfiles[key].email === user.email && key !== memberName) {
          updatedProfiles[key] = {
            ...updatedProfiles[key],
            email: '',
            photoUrl: ''
          };
        }
      }
      updatedProfiles[memberName] = newInfo;

      setState((s) => ({ ...s, memberProfiles: updatedProfiles }));

      // Write all profiles to sheet
      const allProfiles: MemberInfo[] = current.members.map(
        (m) => updatedProfiles[m] || { name: m, email: '', photoUrl: '' }
      );
      await sheetsApi.writeAllMemberProfiles(ssId, allProfiles);
      setState((s) => ({ ...s, isSyncing: false }));
    } catch {
      setState((s) => ({
        ...s,
        isSyncing: false,
        error: 'Failed to link profile'
      }));
    }
  }, []);

  const settleUp = useCallback(
    async (from: string, to: string, amount: number) => {
      const ssId = getSsId();
      if (!ssId) return;

      const current = stateRef.current;
      const splits: Record<string, number> = {};
      for (const m of current.members) splits[m] = 0;
      splits[from] = amount;
      splits[to] = -amount;

      const settlement: Expense = {
        id: uuidv4(),
        date: new Date().toISOString().split('T')[0],
        description: `${from} paid ${to}`,
        category: 'Payment',
        cost: amount,
        currency: current.currency,
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
        await sheetsApi.appendExpense(ssId, settlement, current.members);
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
    []
  );

  const renameSheet = useCallback(async (newName: string) => {
    const ssId = getSsId();
    if (!ssId || !newName.trim()) return;

    const trimmed = newName.trim();
    const oldName = stateRef.current.spreadsheetName;

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
  }, []);

  const importExpenses = useCallback(
    async (newExpenses: Expense[], newMembers: string[]) => {
      const ssId = getSsId();
      if (!ssId) return;

      const current = stateRef.current;
      setState((s) => ({ ...s, isSyncing: true }));
      try {
        const allMembers = [...new Set([...current.members, ...newMembers])];
        const allExpenses = [...current.expenses, ...newExpenses];

        await sheetsApi.writeAllExpenses(
          ssId,
          allExpenses,
          allMembers,
          current.currency
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
    []
  );

  const disconnect = useCallback(() => {
    sessionStorage.removeItem('splitsheet_spreadsheet_id');
    sessionStorage.removeItem('splitsheet_spreadsheet_name');
    setState((s) => ({
      ...s,
      spreadsheetId: null,
      spreadsheetName: null,
      members: [],
      memberProfiles: {},
      expenses: []
    }));
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
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
    }),
    [
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
    ]
  );

  const value = useMemo<AppContextValue>(
    () => ({ ...state, ...actions }),
    [state, actions]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
