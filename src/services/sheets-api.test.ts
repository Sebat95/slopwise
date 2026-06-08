import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./google-auth', () => ({
  notifySessionExpired: vi.fn(),
  onSessionExpired: vi.fn(() => () => {})
}));
import {
  readSheetData,
  deleteExpenseRow,
  appendExpenseMetadataRow,
  updateExpenseMetadataRow,
  invalidateExpenseMetaSheetCache
} from './sheets-api';
import { normalizeCategory } from '../utils/format';
import type { Expense } from '../types';

function makeGoogleProxyResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('readSheetData payer metadata matching', () => {
  const spreadsheetId = 'sheet123';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses _expense_meta paidBy even when sheet category is an alias', async () => {
    // This is the regression: signature mismatch caused meta lookup to fail when
    // row category was an alias (e.g. "Car") but persisted expense category was normalized.
    const members = ['A', 'B'];
    const rowDate = '2026-05-05';
    const rowDescription = 'Trip';
    const rowCategoryAlias = 'Car'; // normalizeCategory("Car") => "Transport"
    const rowCategoryNormalized = normalizeCategory(rowCategoryAlias);
    const rowCostCents = 100;
    const rowCurrency = 'EUR';

    // Make inferredPaidBy become "B" (largest positive split), but metadata says payer is "A".
    const rowSplits = { A: 0, B: 100 };

    const signature = JSON.stringify({
      date: rowDate,
      description: rowDescription,
      category: rowCategoryNormalized,
      costCents: rowCostCents,
      currency: rowCurrency,
      splitsCents: [rowSplits.A, rowSplits.B]
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (
          target.includes(`/spreadsheets/${spreadsheetId}/values/Expenses!`)
        ) {
          return makeGoogleProxyResponse({
            values: [
              [
                'Date',
                'Description',
                'Category',
                'Cost',
                'Currency',
                ...members
              ],
              [
                rowDate,
                rowDescription,
                rowCategoryAlias,
                String(rowCostCents),
                rowCurrency,
                String(rowSplits.A),
                String(rowSplits.B)
              ]
            ]
          });
        }

        if (
          target.includes(`/spreadsheets/${spreadsheetId}/values/_settings!`)
        ) {
          return makeGoogleProxyResponse({
            values: [['Currency', rowCurrency]]
          });
        }

        if (
          target.includes(
            `/spreadsheets/${spreadsheetId}/values/_expense_meta!`
          )
        ) {
          return makeGoogleProxyResponse({
            values: [
              // A2:C...
              [signature, 'A', 'equal']
            ]
          });
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    const data = await readSheetData(spreadsheetId);
    expect(data.members).toEqual(members);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].paidBy).toBe('A');
  });

  it('loads shareInputs from _expense_meta column D for shares expenses', async () => {
    const members = ['A', 'B', 'C'];
    const rowDate = '2026-05-10';
    const rowDescription = 'Pizza';
    const rowCategory = 'General';
    const rowCostCents = 30000;
    const rowCurrency = 'USD';
    const rowSplits = { A: 30000, B: -1667, C: -28333 };
    const shareInputsJson = JSON.stringify({ B: 1, C: 17 });

    const signature = JSON.stringify({
      date: rowDate,
      description: rowDescription,
      category: rowCategory,
      costCents: rowCostCents,
      currency: rowCurrency,
      splitsCents: members.map((m) => rowSplits[m as keyof typeof rowSplits])
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (
          target.includes(`/spreadsheets/${spreadsheetId}/values/Expenses!`)
        ) {
          return makeGoogleProxyResponse({
            values: [
              [
                'Date',
                'Description',
                'Category',
                'Cost',
                'Currency',
                ...members
              ],
              [
                rowDate,
                rowDescription,
                rowCategory,
                String(rowCostCents),
                rowCurrency,
                String(rowSplits.A),
                String(rowSplits.B),
                String(rowSplits.C)
              ]
            ]
          });
        }

        if (
          target.includes(`/spreadsheets/${spreadsheetId}/values/_settings!`)
        ) {
          return makeGoogleProxyResponse({
            values: [['Currency', rowCurrency]]
          });
        }

        if (
          target.includes(
            `/spreadsheets/${spreadsheetId}/values/_expense_meta!`
          )
        ) {
          return makeGoogleProxyResponse({
            values: [[signature, 'A', 'shares', shareInputsJson]]
          });
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    const data = await readSheetData(spreadsheetId);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].splitType).toBe('shares');
    expect(data.expenses[0].shareInputs).toEqual({ B: 1, C: 17 });
  });
});

describe('incremental _expense_meta writes', () => {
  const spreadsheetId = 'metaSheet456';

  const sampleExpense: Expense = {
    id: 'e1',
    date: '2026-06-01',
    description: 'Lunch',
    category: 'General',
    cost: 500,
    currency: 'EUR',
    paidBy: 'A',
    splitType: 'equal',
    splits: { A: 250, B: 250 }
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    invalidateExpenseMetaSheetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    invalidateExpenseMetaSheetCache();
  });

  it('deleteExpenseRow batchUpdate deletes Expenses and _expense_meta rows together', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (target.includes(`:batchUpdate`)) {
          return makeGoogleProxyResponse({});
        }

        if (target.includes('?fields=sheets.properties')) {
          return makeGoogleProxyResponse({
            sheets: [
              { properties: { sheetId: 111, title: 'Expenses' } },
              { properties: { sheetId: 222, title: '_expense_meta' } }
            ]
          });
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    await deleteExpenseRow(spreadsheetId, 2);

    const batchCall = fetchMock.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      const raw = typeof init?.body === 'string' ? init.body : '';
      const b = raw ? (JSON.parse(raw) as { url?: string }) : {};
      return Boolean(b.url?.includes(':batchUpdate'));
    });
    expect(batchCall).toBeDefined();

    const parsed = JSON.parse(
      (batchCall![1] as RequestInit).body as string
    ) as {
      url: string;
      body: string | null;
    };
    const batchBody = JSON.parse(parsed.body || '{}') as {
      requests: Array<{ deleteDimension: { range: { sheetId: number } } }>;
    };
    expect(batchBody.requests).toHaveLength(2);
    expect(batchBody.requests[0].deleteDimension.range.sheetId).toBe(111);
    expect(batchBody.requests[1].deleteDimension.range.sheetId).toBe(222);
  });

  it('deleteExpenseRow only deletes Expenses when _expense_meta tab is missing', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (target.includes(`:batchUpdate`)) {
          return makeGoogleProxyResponse({});
        }

        if (target.includes('?fields=sheets.properties')) {
          return makeGoogleProxyResponse({
            sheets: [{ properties: { sheetId: 111, title: 'Expenses' } }]
          });
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    await deleteExpenseRow(spreadsheetId, 0);

    const batchCall = fetchMock.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      const raw = typeof init?.body === 'string' ? init.body : '';
      const b = raw ? (JSON.parse(raw) as { url?: string }) : {};
      return Boolean(b.url?.includes(':batchUpdate'));
    });
    expect(batchCall).toBeDefined();
    const outer = JSON.parse((batchCall![1] as RequestInit).body as string) as {
      url: string;
      body: string | null;
    };
    const batchBody = JSON.parse(outer.body || '{}') as {
      requests: unknown[];
    };
    expect(batchBody.requests).toHaveLength(1);
  });

  it('appendExpenseMetadataRow ensures sheet then appends one meta row', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (
          target.includes('?fields=properties.title,sheets.properties.title')
        ) {
          return makeGoogleProxyResponse({
            properties: { title: 'T' },
            sheets: [
              { properties: { title: 'Expenses' } },
              { properties: { title: '_expense_meta' } }
            ]
          });
        }

        if (target.includes('_expense_meta!A1:append')) {
          return makeGoogleProxyResponse({});
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    await appendExpenseMetadataRow(spreadsheetId, sampleExpense, ['A', 'B']);

    const targets = fetchMock.mock.calls
      .map((c) => {
        const init = c[1] as RequestInit | undefined;
        const raw = typeof init?.body === 'string' ? init.body : '';
        return raw ? (JSON.parse(raw) as { url?: string }).url || '' : '';
      })
      .filter(Boolean);

    expect(
      targets.some((u) =>
        u.includes('?fields=properties.title,sheets.properties.title')
      )
    ).toBe(true);
    expect(targets.some((u) => u.includes('_expense_meta!A1:append'))).toBe(
      true
    );
  });

  it('updateExpenseMetadataRow writes a single _expense_meta row range', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyRaw = typeof init?.body === 'string' ? init.body : '';
        const body = bodyRaw ? (JSON.parse(bodyRaw) as { url?: string }) : {};
        const target = body.url || '';

        if (
          target.includes('?fields=properties.title,sheets.properties.title')
        ) {
          return makeGoogleProxyResponse({
            properties: { title: 'T' },
            sheets: [
              { properties: { title: 'Expenses' } },
              { properties: { title: '_expense_meta' } }
            ]
          });
        }

        if (target.includes('_expense_meta!A5:D5')) {
          return makeGoogleProxyResponse({});
        }

        throw new Error(`Unexpected proxy URL in test: ${target}`);
      }
    );

    await updateExpenseMetadataRow(spreadsheetId, 3, sampleExpense, ['A', 'B']);

    const targets = fetchMock.mock.calls
      .map((c) => {
        const init = c[1] as RequestInit | undefined;
        const raw = typeof init?.body === 'string' ? init.body : '';
        return raw ? (JSON.parse(raw) as { url?: string }).url || '' : '';
      })
      .filter(Boolean);

    expect(targets.some((u) => u.includes('_expense_meta!A5:D5'))).toBe(true);
  });
});
