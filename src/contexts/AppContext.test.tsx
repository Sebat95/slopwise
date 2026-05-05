import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import type { SheetData } from '../types';

vi.mock('../services/sheets-api', () => {
  return {
    readSheetData: vi.fn(),
    readMemberProfiles: vi.fn()
  };
});

// Import after mocking so AppContext binds to mocked module.
import * as sheetsApi from '../services/sheets-api';

function TestConsumer() {
  const { expenses, error, isLoading } = useApp();
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="expenses-count">{String(expenses.length)}</div>
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

describe('AppProvider initial load retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    localStorage.setItem('slopwise_spreadsheet_name', 'Test Sheet');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
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
});

