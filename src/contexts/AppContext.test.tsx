import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import type { GoogleUserProfile, SheetData } from '../types';
import { saveSheetMetadataCache } from '../utils/sheet-metadata-cache';
import { emptySplitValuePresets } from '../utils/split-presets';

const mockUseAuth = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

vi.mock('../services/google-auth', () => ({
  fetchUserProfile: vi.fn()
}));

function authValue(overrides?: { isAuthenticated?: boolean }) {
  return {
    isAuthenticated: true,
    isLoading: false,
    error: null,
    user: null as GoogleUserProfile | null,
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides
  };
}

vi.mock('../services/sheets-api', () => {
  return {
    readSheetData: vi.fn(),
    readMemberProfiles: vi.fn(),
    appendExpense: vi.fn(),
    appendExpenseMetadataRow: vi.fn(),
    invalidateExpenseMetaSheetCache: vi.fn()
  };
});

// Import after mocking so AppContext binds to mocked module.
import * as sheetsApi from '../services/sheets-api';

function TestConsumer() {
  const { expenses, error, isLoading, members } = useApp();
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="expenses-count">{String(expenses.length)}</div>
      <div data-testid="members-count">{String(members.length)}</div>
    </div>
  );
}

function makeSheetData(overrides?: Partial<SheetData>): SheetData {
  return {
    members: ['A', 'B'],
    expenses: [
      {
        id: 'e1',
        date: '2026-05-05',
        description: 'Lunch',
        category: 'Food',
        cost: 1200,
        currency: 'EUR',
        paidBy: 'A',
        splitType: 'equal',
        splits: { A: 600, B: 600 }
      }
    ],
    currency: 'EUR',
    lastSplitType: 'equal',
    lastPaidBy: 'A',
    lastSplitValuePresets: {
      equal: {},
      exact: {},
      percentage: {},
      shares: {}
    },
    ...overrides
  };
}

async function flushAll(): Promise<void> {
  // Let pending promises settle (fetch mocks, state updates).
  await act(async () => {});
}

describe('AppProvider metadata cache', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(authValue());
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    localStorage.setItem('slopwise_spreadsheet_name', 'Test Sheet');
    saveSheetMetadataCache('sheet123', {
      members: ['A', 'B'],
      memberProfiles: {},
      currency: 'EUR',
      lastSplitType: 'shares',
      lastPaidBy: 'A',
      lastSplitValuePresets: {
        ...emptySplitValuePresets(),
        shares: { A: 1, B: 2 }
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
  });

  it('hydrates members from local metadata cache before loadData completes', () => {
    mockUseAuth.mockReturnValue(authValue({ isAuthenticated: false }));

    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    expect(screen.getByTestId('members-count')).toHaveTextContent('2');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(vi.mocked(sheetsApi.readSheetData)).not.toHaveBeenCalled();
  });
});

describe('AppProvider initial load retries', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(authValue());
    vi.useFakeTimers();
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    localStorage.setItem('slopwise_spreadsheet_name', 'Test Sheet');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
  });

  afterEach(() => {
    cleanup();
    mockUseAuth.mockReturnValue(authValue());
    vi.useRealTimers();
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
    vi.restoreAllMocks();
  });

  it('recovers from transient first-load failure without manual refresh', async () => {
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);

    readMemberProfilesMock.mockResolvedValue([]);
    readSheetDataMock
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(makeSheetData());

    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    // Run the retry backoff timers (250ms etc.) and flush.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(readSheetDataMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');
  });

  it('does not retry on non-transient errors', async () => {
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);

    readMemberProfilesMock.mockResolvedValue([]);
    readSheetDataMock.mockRejectedValue(new Error('API error: 400'));

    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    const callsAfterInitial = readSheetDataMock.mock.calls.length;

    // If we were scheduling backoff retries, advancing time would increase calls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await flushAll();

    expect(readSheetDataMock.mock.calls.length).toBe(callsAfterInitial);
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('0');
    expect(screen.getByTestId('error').textContent || '').not.toBe('');
  });

  it('does not fetch sheet data until the user is authenticated', async () => {
    mockUseAuth.mockReturnValue(authValue({ isAuthenticated: false }));
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);
    readMemberProfilesMock.mockResolvedValue([]);
    readSheetDataMock.mockResolvedValue(makeSheetData());
    readSheetDataMock.mockClear();

    const { rerender } = render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );
    await flushAll();
    expect(readSheetDataMock).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue(authValue({ isAuthenticated: true }));
    rerender(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(readSheetDataMock).toHaveBeenCalled();
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');
  });

  it('clears spreadsheet selection when auth becomes false (logout / session end)', async () => {
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);
    readMemberProfilesMock.mockResolvedValue([]);
    readSheetDataMock.mockResolvedValue(makeSheetData());
    readSheetDataMock.mockClear();

    const { rerender } = render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');
    expect(localStorage.getItem('slopwise_spreadsheet_id')).toBe('sheet123');

    mockUseAuth.mockReturnValue(authValue({ isAuthenticated: false }));
    rerender(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );
    await flushAll();

    expect(localStorage.getItem('slopwise_spreadsheet_id')).toBeNull();
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('0');
    expect(readSheetDataMock.mock.calls.length).toBe(1);
  });
});

function BootstrapConsumer() {
  const {
    expenses,
    members,
    isBootstrapSettled,
    hasBootstrapWrite,
    addExpense,
    waitForBootstrapSettled
  } = useApp();
  return (
    <div>
      <div data-testid="settled">{String(isBootstrapSettled)}</div>
      <div data-testid="bootstrap-write">{String(hasBootstrapWrite)}</div>
      <div data-testid="members-count">{String(members.length)}</div>
      <div data-testid="expenses-count">{String(expenses.length)}</div>
      <button
        type="button"
        data-testid="add-expense"
        onClick={() =>
          void addExpense({
            date: '2026-06-08',
            description: 'Coffee',
            category: 'Drinks',
            cost: 500,
            currency: 'EUR',
            paidBy: 'A',
            splitType: 'equal',
            splits: { A: 250, B: 250 }
          })
        }
      >
        Add
      </button>
      <button
        type="button"
        data-testid="wait-settled"
        onClick={() => void waitForBootstrapSettled()}
      >
        Wait
      </button>
    </div>
  );
}

describe('AppProvider bootstrap write gate', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(authValue());
    vi.useFakeTimers();
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    localStorage.setItem('slopwise_spreadsheet_name', 'Test Sheet');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
  });

  afterEach(() => {
    cleanup();
    mockUseAuth.mockReturnValue(authValue());
    vi.useRealTimers();
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
    vi.restoreAllMocks();
  });

  it('defers expense replace during bootstrap write then re-fetches', async () => {
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);
    const appendExpenseMock = vi.mocked(sheetsApi.appendExpense);
    const appendMetaMock = vi.mocked(sheetsApi.appendExpenseMetadataRow);

    readMemberProfilesMock.mockResolvedValue([]);

    let resolveInitialRead: ((value: SheetData) => void) | undefined;
    readSheetDataMock.mockImplementationOnce(
      () =>
        new Promise<SheetData>((resolve) => {
          resolveInitialRead = resolve;
        })
    );
    readSheetDataMock.mockResolvedValue(makeSheetData({ expenses: [] }));

    let resolveAppend: (() => void) | undefined;
    appendExpenseMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAppend = resolve;
        })
    );
    appendMetaMock.mockResolvedValue(undefined);

    render(
      <AppProvider>
        <BootstrapConsumer />
      </AppProvider>
    );
    await flushAll();

    await act(async () => {
      screen.getByTestId('add-expense').click();
    });
    await flushAll();

    expect(screen.getByTestId('bootstrap-write')).toHaveTextContent('true');
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');
    expect(screen.getByTestId('settled')).toHaveTextContent('false');

    await act(async () => {
      resolveInitialRead?.(makeSheetData({ expenses: [] }));
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');

    await act(async () => {
      resolveAppend?.();
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(readSheetDataMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('settled')).toHaveTextContent('true');
  });

  it('marks bootstrap settled after initial load when no early write', async () => {
    const readSheetDataMock = vi.mocked(sheetsApi.readSheetData);
    const readMemberProfilesMock = vi.mocked(sheetsApi.readMemberProfiles);

    readMemberProfilesMock.mockResolvedValue([]);
    readSheetDataMock.mockResolvedValue(makeSheetData());

    render(
      <AppProvider>
        <BootstrapConsumer />
      </AppProvider>
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(screen.getByTestId('settled')).toHaveTextContent('true');
    expect(screen.getByTestId('expenses-count')).toHaveTextContent('1');
  });
});
