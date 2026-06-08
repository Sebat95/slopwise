import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode
} from 'react';
import type {
  Expense,
  MemberInfo,
  SheetData,
  SplitType,
  SplitValuePresets
} from '../types';
import * as sheetsApi from '../services/sheets-api';
import { fetchUserProfile } from '../services/google-auth';
import { useAuth } from './AuthContext';
import { emptySplitValuePresets } from '../utils/split-presets';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  members: string[];
  memberProfiles: Record<string, MemberInfo>;
  expenses: Expense[];
  currency: string;
  lastSplitType: SplitType;
  lastPaidBy: string;
  lastSplitValuePresets: SplitValuePresets;
  isLoading: boolean;
  isSyncing: boolean;
  isBootstrapSettled: boolean;
  hasBootstrapWrite: boolean;
  error: string | null;
  lastSync: Date | null;
}

interface AppActions {
  connectSpreadsheet: (id: string, name: string) => Promise<void>;
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
    newMembers: string[],
    spreadsheetId?: string
  ) => Promise<void>;
  setLastSplitType: (type: SplitType) => void;
  setLastPaidBy: (name: string) => void;
  setLastSplitValuesForType: (
    type: SplitType,
    values: Record<string, number>
  ) => void;
  disconnect: () => void;
  waitForBootstrapSettled: () => Promise<void>;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

function getSsId(): string | null {
  return localStorage.getItem('slopwise_spreadsheet_id');
}

function renameSplitPresetMember(
  presets: SplitValuePresets,
  oldName: string,
  newName: string
): SplitValuePresets {
  const next = emptySplitValuePresets();

  for (const type of Object.keys(next) as SplitType[]) {
    for (const [member, value] of Object.entries(presets[type])) {
      next[type][member === oldName ? newName : member] = value;
    }
  }

  return next;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryReadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    // common proxy/cold-start transient failures
    m.includes('api error: 502') ||
    m.includes('api error: 503') ||
    m.includes('api error: 504')
  );
}

function buildProfileMap(
  members: string[],
  profiles: MemberInfo[]
): Record<string, MemberInfo> {
  const profileMap: Record<string, MemberInfo> = {};
  for (const profile of profiles) {
    if (profile.name && members.includes(profile.name)) {
      profileMap[profile.name] = profile;
    }
  }
  return profileMap;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const prevAuthenticatedRef = useRef<boolean | null>(null);
  const prevSpreadsheetIdRef = useRef<string | null>(null);

  const [state, setState] = useState<AppState>({
    spreadsheetId: getSsId(),
    spreadsheetName: localStorage.getItem('slopwise_spreadsheet_name'),
    members: [],
    memberProfiles: {},
    expenses: [],
    currency: 'EUR',
    lastSplitType: 'equal',
    lastPaidBy: '',
    lastSplitValuePresets: emptySplitValuePresets(),
    isLoading: Boolean(getSsId()),
    isSyncing: false,
    isBootstrapSettled: !getSsId(),
    hasBootstrapWrite: false,
    error: null,
    lastSync: null
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  const latestReadRequestIdRef = useRef(0);
  const hydratedSpreadsheetIdRef = useRef<string | null>(null);
  const loadDataRef = useRef<() => Promise<void>>(async () => {});

  const bootstrapWriteStartedRef = useRef(false);
  const bootstrapWriteInFlightRef = useRef(false);
  const expensesApplyDeferredRef = useRef(false);
  const initialLoadAppliedRef = useRef(false);
  const isBootstrapSettledRef = useRef(!getSsId());
  const bootstrapSettledWaitersRef = useRef<Array<() => void>>([]);

  const markBootstrapSettled = useCallback(() => {
    if (isBootstrapSettledRef.current) return;
    isBootstrapSettledRef.current = true;
    setState((s) => ({ ...s, isBootstrapSettled: true }));
    for (const resolve of bootstrapSettledWaitersRef.current) resolve();
    bootstrapSettledWaitersRef.current = [];
  }, []);

  const resetBootstrapState = useCallback(() => {
    bootstrapWriteStartedRef.current = false;
    bootstrapWriteInFlightRef.current = false;
    expensesApplyDeferredRef.current = false;
    initialLoadAppliedRef.current = false;
    isBootstrapSettledRef.current = true;
    bootstrapSettledWaitersRef.current = [];
    setState((s) => ({
      ...s,
      isBootstrapSettled: true,
      hasBootstrapWrite: false
    }));
  }, []);

  const resetBootstrapForSpreadsheet = useCallback(() => {
    bootstrapWriteStartedRef.current = false;
    bootstrapWriteInFlightRef.current = false;
    expensesApplyDeferredRef.current = false;
    initialLoadAppliedRef.current = false;
    isBootstrapSettledRef.current = false;
    bootstrapSettledWaitersRef.current = [];
    setState((s) => ({
      ...s,
      isBootstrapSettled: false,
      hasBootstrapWrite: false
    }));
  }, []);

  const waitForBootstrapSettled = useCallback((): Promise<void> => {
    if (isBootstrapSettledRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      bootstrapSettledWaitersRef.current.push(resolve);
    });
  }, []);

  const applyLoadSnapshot = useCallback(
    (ssId: string, data: SheetData, profileMap: Record<string, MemberInfo>) => {
      const deferExpenses = bootstrapWriteInFlightRef.current;
      initialLoadAppliedRef.current = true;
      hydratedSpreadsheetIdRef.current = ssId;

      if (deferExpenses) {
        expensesApplyDeferredRef.current = true;
        setState((s) => ({
          ...s,
          spreadsheetId: ssId,
          members: data.members,
          memberProfiles: profileMap,
          currency: data.currency,
          lastSplitType: data.lastSplitType,
          lastPaidBy: data.lastPaidBy,
          lastSplitValuePresets: data.lastSplitValuePresets,
          isLoading: false,
          error: null,
          lastSync: new Date()
        }));
        return;
      }

      expensesApplyDeferredRef.current = false;
      setState((s) => ({
        ...s,
        spreadsheetId: ssId,
        members: data.members,
        memberProfiles: profileMap,
        expenses: data.expenses,
        currency: data.currency,
        lastSplitType: data.lastSplitType,
        lastPaidBy: data.lastPaidBy,
        lastSplitValuePresets: data.lastSplitValuePresets,
        isLoading: false,
        error: null,
        lastSync: new Date()
      }));

      if (!bootstrapWriteInFlightRef.current) {
        markBootstrapSettled();
      }
    },
    [markBootstrapSettled]
  );

  const readSpreadsheetSnapshot = useCallback(async (spreadsheetId: string) => {
    const [data, profiles] = await Promise.all([
      sheetsApi.readSheetData(spreadsheetId),
      sheetsApi.readMemberProfiles(spreadsheetId).catch((): MemberInfo[] => [])
    ]);

    return {
      data,
      profileMap: buildProfileMap(data.members, profiles)
    };
  }, []);

  const beginReadRequest = useCallback(() => {
    latestReadRequestIdRef.current += 1;
    return latestReadRequestIdRef.current;
  }, []);

  const isActiveReadRequest = useCallback((requestId: number) => {
    return latestReadRequestIdRef.current === requestId;
  }, []);

  const connectSpreadsheet = useCallback(
    async (id: string, name: string) => {
      beginReadRequest();
      resetBootstrapForSpreadsheet();
      sheetsApi.invalidateExpenseMetaSheetCache(id);
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const { data, profileMap } = await readSpreadsheetSnapshot(id);
        localStorage.setItem('slopwise_spreadsheet_id', id);
        localStorage.setItem('slopwise_spreadsheet_name', name);

        const nextState: AppState = {
          ...stateRef.current,
          spreadsheetId: id,
          spreadsheetName: name,
          members: data.members,
          memberProfiles: profileMap,
          expenses: data.expenses,
          currency: data.currency,
          lastSplitType: data.lastSplitType,
          lastPaidBy: data.lastPaidBy,
          lastSplitValuePresets: data.lastSplitValuePresets,
          isLoading: false,
          isSyncing: false,
          isBootstrapSettled: true,
          hasBootstrapWrite: false,
          error: null,
          lastSync: new Date()
        };

        bootstrapWriteStartedRef.current = false;
        bootstrapWriteInFlightRef.current = false;
        expensesApplyDeferredRef.current = false;
        initialLoadAppliedRef.current = true;
        isBootstrapSettledRef.current = true;
        hydratedSpreadsheetIdRef.current = id;
        stateRef.current = nextState;
        setState(nextState);
      } catch (err) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: getErrorMessage(err, 'Failed to open spreadsheet')
        }));
        throw err instanceof Error
          ? err
          : new Error('Failed to open spreadsheet');
      }
    },
    [beginReadRequest, readSpreadsheetSnapshot, resetBootstrapForSpreadsheet]
  );

  const loadData = useCallback(async () => {
    const ssId = stateRef.current.spreadsheetId || getSsId();
    if (!ssId) return;
    sheetsApi.invalidateExpenseMetaSheetCache(ssId);
    const requestId = beginReadRequest();
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const retryDelaysMs = [250, 750, 1500];
      let lastErr: unknown = null;

      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
        try {
          const { data, profileMap } = await readSpreadsheetSnapshot(ssId);
          if (!isActiveReadRequest(requestId)) return;
          applyLoadSnapshot(ssId, data, profileMap);
          return;
        } catch (err) {
          lastErr = err;
          const message = getErrorMessage(err, 'Failed to load data');
          const canRetry =
            attempt < retryDelaysMs.length && shouldRetryReadError(message);
          if (!canRetry) break;
          await sleep(retryDelaysMs[attempt]);
        }
      }

      throw lastErr instanceof Error
        ? lastErr
        : new Error(getErrorMessage(lastErr, 'Failed to load data'));
    } catch (err) {
      if (!isActiveReadRequest(requestId)) return;
      setState((s) => ({
        ...s,
        isLoading: false,
        error: getErrorMessage(err, 'Failed to load data')
      }));
    }
  }, [
    beginReadRequest,
    isActiveReadRequest,
    readSpreadsheetSnapshot,
    applyLoadSnapshot
  ]);

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  const disconnect = useCallback(() => {
    beginReadRequest();
    sheetsApi.invalidateExpenseMetaSheetCache();
    hydratedSpreadsheetIdRef.current = null;
    prevSpreadsheetIdRef.current = null;
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
    resetBootstrapState();
    setState((s) => ({
      ...s,
      spreadsheetId: null,
      spreadsheetName: null,
      members: [],
      memberProfiles: {},
      expenses: [],
      lastSplitType: 'equal',
      lastPaidBy: '',
      lastSplitValuePresets: emptySplitValuePresets(),
      isLoading: false,
      error: null
    }));
  }, [beginReadRequest, resetBootstrapState]);

  useEffect(() => {
    const prev = prevAuthenticatedRef.current;
    prevAuthenticatedRef.current = isAuthenticated;
    if (prev === true && !isAuthenticated) {
      disconnect();
    }
  }, [isAuthenticated, disconnect]);

  useEffect(() => {
    if (!isAuthenticated) {
      hydratedSpreadsheetIdRef.current = null;
      return;
    }
    const ssId = state.spreadsheetId;
    if (!ssId) {
      hydratedSpreadsheetIdRef.current = null;
      return;
    }
    if (
      hydratedSpreadsheetIdRef.current === ssId &&
      initialLoadAppliedRef.current
    ) {
      return;
    }
    if (prevSpreadsheetIdRef.current !== ssId) {
      resetBootstrapForSpreadsheet();
      prevSpreadsheetIdRef.current = ssId;
    }
    void loadData();
  }, [
    loadData,
    resetBootstrapForSpreadsheet,
    state.spreadsheetId,
    isAuthenticated
  ]);

  const finishBootstrapWrite = useCallback(() => {
    bootstrapWriteInFlightRef.current = false;
    if (expensesApplyDeferredRef.current || !initialLoadAppliedRef.current) {
      void loadDataRef.current();
      return;
    }
    markBootstrapSettled();
  }, [markBootstrapSettled]);

  const addExpense = useCallback(
    async (expense: Omit<Expense, 'id'>) => {
      const ssId = getSsId();
      if (!ssId) throw new Error('No spreadsheet selected');

      if (bootstrapWriteStartedRef.current && !isBootstrapSettledRef.current) {
        await waitForBootstrapSettled();
      }

      const isBootstrapWrite = !bootstrapWriteStartedRef.current;
      if (isBootstrapWrite) {
        bootstrapWriteStartedRef.current = true;
        bootstrapWriteInFlightRef.current = true;
        setState((s) => ({ ...s, hasBootstrapWrite: true }));
      }

      const current = stateRef.current;
      const newExpense: Expense = { ...expense, id: uuidv4() };
      setState((s) => ({
        ...s,
        expenses: [...s.expenses, newExpense],
        isSyncing: true,
        error: null
      }));

      try {
        await sheetsApi.appendExpense(ssId, newExpense, current.members);
        await sheetsApi.appendExpenseMetadataRow(
          ssId,
          newExpense,
          current.members
        );
        setState((s) => ({ ...s, isSyncing: false, error: null }));
        if (isBootstrapWrite) {
          finishBootstrapWrite();
        }
      } catch (err) {
        if (isBootstrapWrite) {
          bootstrapWriteInFlightRef.current = false;
        }
        const message = getErrorMessage(err, 'Failed to save expense');
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: message,
          expenses: s.expenses.filter((e) => e.id !== newExpense.id)
        }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [finishBootstrapWrite, waitForBootstrapSettled]
  );

  const updateExpense = useCallback(
    async (expenseId: string, updated: Omit<Expense, 'id'>) => {
      const ssId = getSsId();
      if (!ssId) throw new Error('No spreadsheet selected');

      await waitForBootstrapSettled();

      const current = stateRef.current;
      const idx = current.expenses.findIndex((e) => e.id === expenseId);
      if (idx < 0) throw new Error('Expense not found');

      const updatedExpense: Expense = { ...updated, id: expenseId };
      const backup = [...current.expenses];

      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) =>
          e.id === expenseId ? updatedExpense : e
        ),
        isSyncing: true,
        error: null
      }));

      try {
        await sheetsApi.updateExpenseRow(
          ssId,
          idx,
          updatedExpense,
          current.members
        );
        await sheetsApi.updateExpenseMetadataRow(
          ssId,
          idx,
          updatedExpense,
          current.members
        );
        setState((s) => ({ ...s, isSyncing: false, error: null }));
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to update expense');
        setState((s) => ({
          ...s,
          expenses: backup,
          isSyncing: false,
          error: message
        }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [waitForBootstrapSettled]
  );

  const deleteExpense = useCallback(async (expenseId: string) => {
    const ssId = getSsId();
    if (!ssId) throw new Error('No spreadsheet selected');

    const current = stateRef.current;
    const idx = current.expenses.findIndex((e) => e.id === expenseId);
    if (idx < 0) throw new Error('Expense not found');

    const backup = [...current.expenses];
    setState((s) => ({
      ...s,
      expenses: s.expenses.filter((e) => e.id !== expenseId),
      isSyncing: true,
      error: null
    }));

    try {
      await sheetsApi.deleteExpenseRow(ssId, idx);
      setState((s) => ({ ...s, isSyncing: false, error: null }));
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to delete expense');
      setState((s) => ({
        ...s,
        expenses: backup,
        isSyncing: false,
        error: message
      }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const addMember = useCallback(async (name: string) => {
    const ssId = getSsId();
    if (!ssId) throw new Error('No spreadsheet selected');
    const current = stateRef.current;
    if (current.members.includes(name))
      throw new Error('Member already exists');

    setState((s) => ({ ...s, isSyncing: true, error: null }));
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
        isSyncing: false,
        error: null
      }));
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to add member');
      setState((s) => ({
        ...s,
        isSyncing: false,
        error: message
      }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const renameMember = useCallback(
    async (oldName: string, newName: string) => {
      const ssId = getSsId();
      if (!ssId) throw new Error('No spreadsheet selected');
      if (!newName.trim() || oldName === newName.trim()) return;
      const trimmed = newName.trim();
      const current = stateRef.current;
      if (current.members.includes(trimmed)) {
        throw new Error('Member already exists');
      }
      const renamedMembers = current.members.map((member) =>
        member === oldName ? trimmed : member
      );
      const renamedPresets = renameSplitPresetMember(
        current.lastSplitValuePresets,
        oldName,
        trimmed
      );
      const nextLastPaidBy =
        current.lastPaidBy === oldName ? trimmed : current.lastPaidBy;
      const renamedExpenses = current.expenses.map((expense) => {
        const nextSplits = { ...expense.splits };
        if (oldName in nextSplits) {
          nextSplits[trimmed] = nextSplits[oldName];
          delete nextSplits[oldName];
        }
        return {
          ...expense,
          paidBy: expense.paidBy === oldName ? trimmed : expense.paidBy,
          splits: nextSplits
        };
      });
      const renamedProfileMap = (() => {
        const nextProfiles = { ...current.memberProfiles };
        if (nextProfiles[oldName]) {
          nextProfiles[trimmed] = { ...nextProfiles[oldName], name: trimmed };
          delete nextProfiles[oldName];
        }
        return nextProfiles;
      })();

      setState((s) => ({
        ...s,
        members: renamedMembers,
        expenses: renamedExpenses,
        memberProfiles: renamedProfileMap,
        lastPaidBy: nextLastPaidBy,
        lastSplitValuePresets: renamedPresets,
        isSyncing: true,
        error: null
      }));

      try {
        await sheetsApi.renameMemberColumn(
          ssId,
          current.members,
          oldName,
          trimmed
        );
        await sheetsApi.writeAllExpenseMetadata(
          ssId,
          renamedExpenses,
          renamedMembers
        );
        const updatedProfiles: MemberInfo[] = renamedMembers.map(
          (member) =>
            renamedProfileMap[member] || {
              name: member,
              email: '',
              photoUrl: ''
            }
        );
        await sheetsApi.writeAllMemberProfiles(ssId, updatedProfiles);
        if (nextLastPaidBy) {
          await sheetsApi.saveSetting(ssId, 'lastPaidBy', nextLastPaidBy);
        }
        await sheetsApi.saveSetting(
          ssId,
          'lastSplitValuePresets',
          JSON.stringify(renamedPresets)
        );
        setState((s) => ({ ...s, isSyncing: false, error: null }));
      } catch (err) {
        await loadData();
        const message = getErrorMessage(err, 'Failed to rename member');
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: message
        }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [loadData]
  );

  const linkMemberToGoogle = useCallback(async (memberName: string) => {
    const ssId = getSsId();
    if (!ssId) throw new Error('No spreadsheet selected');

    setState((s) => ({ ...s, isSyncing: true, error: null }));

    try {
      const user = await fetchUserProfile();
      if (!user) {
        throw new Error(
          'Could not fetch Google profile. Try signing out and back in.'
        );
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

      // Write all profiles to sheet
      const allProfiles: MemberInfo[] = current.members.map(
        (m) => updatedProfiles[m] || { name: m, email: '', photoUrl: '' }
      );
      await sheetsApi.writeAllMemberProfiles(ssId, allProfiles);
      setState((s) => ({
        ...s,
        memberProfiles: updatedProfiles,
        isSyncing: false,
        error: null
      }));
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to link profile');
      setState((s) => ({
        ...s,
        isSyncing: false,
        error: message
      }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const settleUp = useCallback(
    async (from: string, to: string, amount: number) => {
      const ssId = getSsId();
      if (!ssId) throw new Error('No spreadsheet selected');

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
        isSyncing: true,
        error: null
      }));

      try {
        await sheetsApi.appendExpense(ssId, settlement, current.members);
        await sheetsApi.appendExpenseMetadataRow(
          ssId,
          settlement,
          current.members
        );
        setState((s) => ({ ...s, isSyncing: false, error: null }));
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to save settlement');
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: message,
          expenses: s.expenses.filter((e) => e.id !== settlement.id)
        }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    []
  );

  const renameSheet = useCallback(async (newName: string) => {
    const ssId = getSsId();
    if (!ssId) throw new Error('No spreadsheet selected');
    if (!newName.trim()) throw new Error('Sheet name cannot be empty');

    const trimmed = newName.trim();
    const oldName = stateRef.current.spreadsheetName;

    localStorage.setItem('slopwise_spreadsheet_name', trimmed);
    setState((s) => ({
      ...s,
      spreadsheetName: trimmed,
      isSyncing: true,
      error: null
    }));

    try {
      await sheetsApi.renameSpreadsheet(ssId, trimmed);
      setState((s) => ({ ...s, isSyncing: false, error: null }));
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to rename sheet');
      localStorage.setItem('slopwise_spreadsheet_name', oldName || '');
      setState((s) => ({
        ...s,
        spreadsheetName: oldName,
        isSyncing: false,
        error: message
      }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const importExpenses = useCallback(
    async (
      newExpenses: Expense[],
      newMembers: string[],
      spreadsheetId?: string
    ) => {
      const ssId = spreadsheetId || getSsId();
      if (!ssId) throw new Error('No spreadsheet selected');

      const current = stateRef.current;
      const updateCurrentSheet = ssId === current.spreadsheetId;
      const allMembers = updateCurrentSheet
        ? [...new Set([...current.members, ...newMembers])]
        : [...new Set(newMembers)];
      const allExpenses = updateCurrentSheet
        ? [...current.expenses, ...newExpenses]
        : [...newExpenses];

      setState((s) => ({ ...s, isSyncing: true, error: null }));
      try {
        await sheetsApi.writeAllExpenses(ssId, allExpenses, allMembers);
        if (updateCurrentSheet) {
          setState((s) => ({
            ...s,
            members: allMembers,
            expenses: allExpenses,
            isSyncing: false,
            error: null,
            lastSync: new Date()
          }));
        } else {
          setState((s) => ({ ...s, isSyncing: false, error: null }));
        }
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to import');
        setState((s) => ({
          ...s,
          isSyncing: false,
          error: message
        }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    []
  );

  const setLastSplitType = useCallback((type: SplitType) => {
    setState((s) => ({ ...s, lastSplitType: type }));
    const ssId = getSsId();
    if (ssId) {
      sheetsApi.saveSetting(ssId, 'lastSplitType', type).catch(() => {});
    }
  }, []);

  const setLastPaidBy = useCallback((name: string) => {
    setState((s) => ({ ...s, lastPaidBy: name }));
    const ssId = getSsId();
    if (ssId) {
      sheetsApi.saveSetting(ssId, 'lastPaidBy', name).catch(() => {});
    }
  }, []);

  const setLastSplitValuesForType = useCallback(
    (type: SplitType, values: Record<string, number>) => {
      const sanitized: Record<string, number> = {};
      for (const [member, value] of Object.entries(values)) {
        const trimmed = member.trim();
        if (!trimmed || !Number.isFinite(value)) continue;
        sanitized[trimmed] = value;
      }

      const next = {
        ...stateRef.current.lastSplitValuePresets,
        [type]: sanitized
      };
      setState((s) => ({ ...s, lastSplitValuePresets: next }));

      const ssId = getSsId();
      if (ssId) {
        sheetsApi
          .saveSetting(ssId, 'lastSplitValuePresets', JSON.stringify(next))
          .catch(() => {});
      }
    },
    []
  );

  const actions = useMemo<AppActions>(
    () => ({
      connectSpreadsheet,
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
      setLastSplitType,
      setLastPaidBy,
      setLastSplitValuesForType,
      disconnect,
      waitForBootstrapSettled
    }),
    [
      connectSpreadsheet,
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
      setLastSplitType,
      setLastPaidBy,
      setLastSplitValuesForType,
      disconnect,
      waitForBootstrapSettled
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
