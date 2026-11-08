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
    updateExpenseInSheet: vi.fn(),
    deleteExpenseFromSheet: vi.fn(),
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

function MutationConsumer() {
  const {
    expenses,
    error,
    isSyncing,
    updateExpense,
    deleteExpense,
    addExpense
  } = useApp();
  return (
    <div>
      <div data-testid="count">{String(expenses.length)}</div>
      <div data-testid="desc">
        {expenses.map((e) => e.description).join('|')}
      </div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="syncing">{String(isSyncing)}</div>
      <button
        type="button"
        data-testid="update"
        onClick={() =>
          void updateExpense(expenses[0].id, {
            ...expenses[0],
            description: 'Changed'
          }).catch(() => {})
        }
      >
        Update
      </button>
      <button
        type="button"
        data-testid="delete"
        onClick={() => void deleteExpense(expenses[0].id).catch(() => {})}
      >
        Delete
      </button>
      <button
        type="button"
        data-testid="update-and-delete"
        onClick={() => {
          void updateExpense(expenses[0].id, {
            ...expenses[0],
            description: 'Changed'
          }).catch(() => {});
          void deleteExpense(expenses[0].id).catch(() => {});
        }}
      >
        Both
      </button>
      <button
        type="button"
        data-testid="add"
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
          }).catch(() => {})
        }
      >
        Add
      </button>
      <button
        type="button"
        data-testid="fail-lunch"
        onClick={() => {
          const lunch = expenses.find((e) => e.id === 'e1');
          if (!lunch) return;
          void updateExpense('e1', { ...lunch, description: 'Changed' }).catch(
            () => {}
          );
        }}
      >
        Fail lunch
      </button>
      <button
        type="button"
        data-testid="delete-dinner"
        onClick={() => void deleteExpense('e2').catch(() => {})}
      >
        Delete dinner
      </button>
    </div>
  );
}

describe('AppProvider expense mutations', () => {
  async function renderLoaded() {
    vi.mocked(sheetsApi.readMemberProfiles).mockResolvedValue([]);
    vi.mocked(sheetsApi.readSheetData).mockResolvedValue(makeSheetData());
    render(
      <AppProvider>
        <MutationConsumer />
      </AppProvider>
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  }

  beforeEach(() => {
    mockUseAuth.mockReturnValue(authValue());
    vi.useFakeTimers();
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    localStorage.setItem('slopwise_spreadsheet_name', 'Test Sheet');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
    vi.mocked(sheetsApi.updateExpenseInSheet).mockReset();
    vi.mocked(sheetsApi.deleteExpenseFromSheet).mockReset();
    vi.mocked(sheetsApi.appendExpense).mockReset();
    vi.mocked(sheetsApi.appendExpenseMetadataRow).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
    localStorage.removeItem('slopwise_sheet_metadata_cache');
    vi.restoreAllMocks();
  });

  it('updates optimistically, then reports synced with no error', async () => {
    vi.mocked(sheetsApi.updateExpenseInSheet).mockResolvedValue(undefined);
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('update').click();
    });
    await flushAll();

    expect(screen.getByTestId('desc')).toHaveTextContent('Changed');
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('syncing')).toHaveTextContent('false');
    expect(vi.mocked(sheetsApi.updateExpenseInSheet)).toHaveBeenCalledTimes(1);
    // Previous version is passed so the sheet row can be located by content.
    expect(
      vi.mocked(sheetsApi.updateExpenseInSheet).mock.calls[0][1].description
    ).toBe('Lunch');
  });

  it('rolls an update back and reports the error when the write fails', async () => {
    vi.mocked(sheetsApi.updateExpenseInSheet).mockRejectedValue(
      new Error('boom')
    );
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('update').click();
    });
    await flushAll();

    expect(screen.getByTestId('desc')).toHaveTextContent('Lunch');
    expect(screen.getByTestId('error')).toHaveTextContent('boom');
    expect(screen.getByTestId('syncing')).toHaveTextContent('false');
  });

  it('restores a deleted expense when the delete fails', async () => {
    vi.mocked(sheetsApi.deleteExpenseFromSheet).mockRejectedValue(
      new Error('nope')
    );
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('delete').click();
    });
    await flushAll();

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('error')).toHaveTextContent('nope');
  });

  it('runs sheet writes one at a time, in call order', async () => {
    const order: string[] = [];
    let releaseUpdate: (() => void) | undefined;
    vi.mocked(sheetsApi.updateExpenseInSheet).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          order.push('update:start');
          releaseUpdate = () => {
            order.push('update:end');
            resolve();
          };
        })
    );
    vi.mocked(sheetsApi.deleteExpenseFromSheet).mockImplementation(async () => {
      order.push('delete:start');
    });
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('update-and-delete').click();
    });
    await flushAll();

    // The delete must wait for the in-flight update.
    expect(order).toEqual(['update:start']);
    expect(screen.getByTestId('syncing')).toHaveTextContent('true');

    await act(async () => {
      releaseUpdate?.();
    });
    await flushAll();

    expect(order).toEqual(['update:start', 'update:end', 'delete:start']);
    expect(screen.getByTestId('syncing')).toHaveTextContent('false');
  });

  it('keeps the expense when the row is saved but the metadata write fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(sheetsApi.appendExpense).mockResolvedValue(undefined);
    vi.mocked(sheetsApi.appendExpenseMetadataRow).mockRejectedValue(
      new Error('meta down')
    );
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('add').click();
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('desc')).toHaveTextContent('Coffee');
    expect(screen.getByTestId('error')).toHaveTextContent(
      'split details could not be stored'
    );
    expect(screen.getByTestId('syncing')).toHaveTextContent('false');
    expect(vi.mocked(sheetsApi.appendExpense)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sheetsApi.appendExpenseMetadataRow)).toHaveBeenCalledTimes(
      2
    );
  });

  it('drops the optimistic expense when the sheet append itself fails', async () => {
    vi.mocked(sheetsApi.appendExpense).mockRejectedValue(
      new Error('sheet down')
    );
    await renderLoaded();

    await act(async () => {
      screen.getByTestId('add').click();
      await vi.runAllTimersAsync();
    });
    await flushAll();

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('desc')).not.toHaveTextContent('Coffee');
    expect(screen.getByTestId('error')).toHaveTextContent('sheet down');
    expect(
      vi.mocked(sheetsApi.appendExpenseMetadataRow)
    ).not.toHaveBeenCalled();
  });

  it('rolls back only the expense whose write failed', async () => {
    vi.mocked(sheetsApi.readSheetData).mockResolvedValue(
      makeSheetData({
        expenses: [
          makeSheetData().expenses[0],
          {
            ...makeSheetData().expenses[0],
            id: 'e2',
            description: 'Dinner'
          }
        ]
      })
    );
    let rejectUpdate: ((err: Error) => void) | undefined;
    vi.mocked(sheetsApi.updateExpenseInSheet).mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectUpdate = reject;
        })
    );
    vi.mocked(sheetsApi.deleteExpenseFromSheet).mockResolvedValue(undefined);

    render(
      <AppProvider>
        <MutationConsumer />
      </AppProvider>
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushAll();

    await act(async () => {
      screen.getByTestId('fail-lunch').click();
      screen.getByTestId('delete-dinner').click();
    });
    await flushAll();

    await act(async () => {
      rejectUpdate?.(new Error('update failed'));
    });
    await flushAll();

    // Dinner stays deleted. Lunch returns to its previous description.
    expect(screen.getByTestId('desc')).toHaveTextContent('Lunch');
    expect(screen.getByTestId('desc')).not.toHaveTextContent('Dinner');
    expect(screen.getByTestId('desc')).not.toHaveTextContent('Changed');
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
