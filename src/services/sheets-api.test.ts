import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./google-auth', () => ({
  notifySessionExpired: vi.fn(),
  onSessionExpired: vi.fn(() => () => {})
}));
import {
  readSheetData,
  deleteExpenseFromSheet,
  updateExpenseInSheet,
  appendExpenseMetadataRow,
  invalidateExpenseMetaSheetCache,
  setApiRetryDelaysForTests,
  saveSetting
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
});

interface ProxyCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function parseProxyCalls(fetchMock: ReturnType<typeof vi.fn>): ProxyCall[] {
  return fetchMock.mock.calls.map((c) => {
    const init = c[1] as RequestInit;
    const outer = JSON.parse(init.body as string) as {
      url: string;
      method: string;
      body: string | null;
    };
    return {
      url: outer.url,
      method: outer.method,
      body: outer.body
        ? (JSON.parse(outer.body) as Record<string, unknown>)
        : null
    };
  });
}

const MEMBERS = ['A', 'B'];

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'x',
    date: '2026-06-01',
    description: 'Lunch',
    category: 'General',
    cost: 500,
    currency: 'EUR',
    paidBy: 'A',
    splitType: 'equal',
    splits: { A: 250, B: -250 },
    ...overrides
  };
}

function metaSignature(e: Expense): string {
  return JSON.stringify({
    date: e.date,
    description: e.description,
    category: normalizeCategory(e.category),
    costCents: e.cost,
    currency: e.currency,
    splitsCents: MEMBERS.map((m) => e.splits[m] ?? 0)
  });
}

function expenseRow(e: Expense): string[] {
  return [
    e.date,
    e.description,
    e.category,
    String(e.cost),
    e.currency,
    ...MEMBERS.map((m) => String(e.splits[m] ?? 0))
  ];
}

/** Routes proxied Google calls for a fake spreadsheet. */
function installSheet(opts: {
  expensesValues: string[][];
  metaValues?: string[][];
  hasMetaTab?: boolean;
  /** When set, the _expense_meta read fails with this status instead. */
  metaReadStatus?: number;
}) {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const outer = JSON.parse(init?.body as string) as { url: string };
      const target = outer.url;
      const json = (payload: unknown) => makeGoogleProxyResponse(payload);

      if (target.includes('/values/Expenses!A1:')) {
        return json({ values: opts.expensesValues });
      }
      if (target.includes('/values/_expense_meta!A1:A')) {
        if (opts.metaReadStatus) {
          return new Response(JSON.stringify({ error: { message: 'down' } }), {
            status: opts.metaReadStatus
          });
        }
        if (opts.hasMetaTab === false) {
          return new Response(JSON.stringify({ error: { message: 'x' } }), {
            status: 400
          });
        }
        return json({ values: opts.metaValues });
      }
      if (target.includes('?fields=properties.title,sheets.properties.title')) {
        return json({
          properties: { title: 'T' },
          sheets: [
            { properties: { title: 'Expenses' } },
            { properties: { title: '_expense_meta' } }
          ]
        });
      }
      if (target.includes('?fields=sheets.properties')) {
        return json({
          sheets: [
            { properties: { sheetId: 111, title: 'Expenses' } },
            ...(opts.hasMetaTab === false
              ? []
              : [{ properties: { sheetId: 222, title: '_expense_meta' } }])
          ]
        });
      }
      if (
        target.includes('values:batchUpdate') ||
        target.includes(':batchUpdate')
      ) {
        return json({});
      }
      if (target.includes('_expense_meta!A1:append')) {
        return json({});
      }
      throw new Error(`Unexpected proxy URL in test: ${target}`);
    }
  );
  return fetchMock;
}

describe('locating rows by content (not by in-memory position)', () => {
  const spreadsheetId = 'locate789';
  const header = [
    'Date',
    'Description',
    'Category',
    'Cost',
    'Currency',
    ...MEMBERS
  ];

  const first = makeExpense({ id: '1', description: 'First' });
  const second = makeExpense({
    id: '2',
    description: 'Second',
    cost: 800,
    splits: { A: 400, B: -400 }
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setApiRetryDelaysForTests([0, 0, 0]);
    invalidateExpenseMetaSheetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    invalidateExpenseMetaSheetCache();
  });

  it('deletes the right rows even when blank rows make memory indexes drift', async () => {
    // Sheet: header, blank row (skipped when reading), first, second.
    // In memory `second` is index 1, but it lives on sheet row 5.
    const fetchMock = installSheet({
      expensesValues: [header, [], expenseRow(first), expenseRow(second)],
      // Meta only has an entry for `second` (legacy `first` has none).
      metaValues: [['Signature'], [metaSignature(second)]]
    });

    await deleteExpenseFromSheet(spreadsheetId, second, 1);

    const batch = parseProxyCalls(fetchMock).find(
      (c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values:')
    );
    const requests = (
      batch!.body as {
        requests: Array<{
          deleteDimension: {
            range: { sheetId: number; startIndex: number; endIndex: number };
          };
        }>;
      }
    ).requests;
    expect(requests).toHaveLength(2);
    // Expenses sheet row 4 (0-based startIndex 3); meta sheet row 2.
    expect(requests[0].deleteDimension.range).toMatchObject({
      sheetId: 111,
      startIndex: 3,
      endIndex: 4
    });
    expect(requests[1].deleteDimension.range).toMatchObject({
      sheetId: 222,
      startIndex: 1,
      endIndex: 2
    });
  });

  it('deletes the duplicate closest to the in-memory index, not the first match', async () => {
    const copy = makeExpense({ description: 'Same' });
    const fetchMock = installSheet({
      expensesValues: [header, expenseRow(copy), expenseRow(copy)],
      metaValues: [['Signature'], [metaSignature(copy)], [metaSignature(copy)]]
    });

    // Memory index 1 is the second copy (sheet row 3, meta row 3).
    await deleteExpenseFromSheet(spreadsheetId, copy, 1);

    const batch = parseProxyCalls(fetchMock).find(
      (c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values:')
    );
    const requests = (
      batch!.body as {
        requests: Array<{
          deleteDimension: { range: { startIndex: number; endIndex: number } };
        }>;
      }
    ).requests;
    expect(requests).toHaveLength(2);
    expect(requests[0].deleteDimension.range).toMatchObject({
      startIndex: 2,
      endIndex: 3
    });
    expect(requests[1].deleteDimension.range).toMatchObject({
      startIndex: 2,
      endIndex: 3
    });
  });

  it('falls back to the hinted row when Sheets reformats the date', async () => {
    const expense = makeExpense({ description: 'Lunch' });
    const reformatted = expenseRow(expense);
    reformatted[0] = '6/1/2026';
    const fetchMock = installSheet({
      expensesValues: [header, reformatted],
      metaValues: [['Signature']]
    });

    await deleteExpenseFromSheet(spreadsheetId, expense, 0);

    const batch = parseProxyCalls(fetchMock).find(
      (c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values:')
    );
    const requests = (
      batch!.body as {
        requests: Array<{
          deleteDimension: { range: { startIndex: number } };
        }>;
      }
    ).requests;
    expect(requests).toHaveLength(1);
    expect(requests[0].deleteDimension.range.startIndex).toBe(1);
  });

  it('aborts the delete when the metadata read fails for a reason other than a missing tab', async () => {
    const fetchMock = installSheet({
      expensesValues: [header, expenseRow(first)],
      metaReadStatus: 503
    });

    await expect(
      deleteExpenseFromSheet(spreadsheetId, first, 0)
    ).rejects.toThrow();

    expect(
      parseProxyCalls(fetchMock).some(
        (c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values:')
      )
    ).toBe(false);
  });

  it('does not delete the meta tab row when the expense has no meta entry', async () => {
    const fetchMock = installSheet({
      expensesValues: [header, expenseRow(first)],
      metaValues: [['Signature']]
    });

    await deleteExpenseFromSheet(spreadsheetId, first, 0);

    const batch = parseProxyCalls(fetchMock).find(
      (c) => c.url.endsWith(':batchUpdate') && !c.url.includes('values:')
    );
    expect((batch!.body as { requests: unknown[] }).requests).toHaveLength(1);
  });

  it('refuses to touch the sheet when the expense cannot be found', async () => {
    const fetchMock = installSheet({
      expensesValues: [header, expenseRow(first)],
      metaValues: [['Signature']]
    });

    await expect(
      deleteExpenseFromSheet(spreadsheetId, second, 0)
    ).rejects.toThrow(/not found/i);

    expect(
      parseProxyCalls(fetchMock).some((c) => c.url.endsWith(':batchUpdate'))
    ).toBe(false);
  });

  it('updates the expense row and meta row atomically in one values:batchUpdate', async () => {
    const fetchMock = installSheet({
      expensesValues: [header, [], expenseRow(first), expenseRow(second)],
      metaValues: [
        ['Signature'],
        [metaSignature(first)],
        [metaSignature(second)]
      ]
    });

    const updated = makeExpense({
      id: '2',
      description: 'Second v2',
      cost: 900,
      splits: { A: 450, B: -450 }
    });
    await updateExpenseInSheet(spreadsheetId, second, updated, MEMBERS, 1);

    const writes = parseProxyCalls(fetchMock).filter((c) => c.method !== 'GET');
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toContain('values:batchUpdate');
    const data = (
      writes[0].body as {
        data: Array<{ range: string; values: string[][] }>;
      }
    ).data;
    expect(data.map((d) => d.range)).toEqual([
      'Expenses!A4:G4',
      '_expense_meta!A3:D3'
    ]);
    expect(data[0].values[0][1]).toBe('Second v2');
    expect(JSON.parse(data[1].values[0][0]).costCents).toBe(900);
  });

  it('creates a meta entry when updating a legacy row that has none', async () => {
    const fetchMock = installSheet({
      expensesValues: [header, expenseRow(first)],
      metaValues: [['Signature']]
    });

    await updateExpenseInSheet(
      spreadsheetId,
      first,
      { ...first, description: 'First v2' },
      MEMBERS,
      0
    );

    const urls = parseProxyCalls(fetchMock).map((c) => c.url);
    expect(urls.some((u) => u.includes('values:batchUpdate'))).toBe(true);
    expect(urls.some((u) => u.includes('_expense_meta!A1:append'))).toBe(true);
  });
});

describe('transient failure handling', () => {
  const spreadsheetId = 'retry000';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setApiRetryDelaysForTests([0, 0, 0]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function errorResponse(status: number, detail?: string): Response {
    return new Response(
      JSON.stringify({ error: { message: `HTTP ${status}`, detail } }),
      { status }
    );
  }

  it('retries idempotent writes after a network error and a 503', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(errorResponse(503))
      .mockImplementation(async () => makeGoogleProxyResponse({ values: [] }));

    await saveSetting(spreadsheetId, 'lastPaidBy', 'A');

    // GET _settings (network error, 503, success) + PUT _settings.
    expect(fetchMock.mock.calls).toHaveLength(4);
  });

  it('does not replay a non-idempotent append after a 502', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const target = (JSON.parse(init?.body as string) as { url: string })
          .url;
        if (
          target.includes('?fields=properties.title,sheets.properties.title')
        ) {
          return makeGoogleProxyResponse({
            properties: { title: 'T' },
            sheets: [{ properties: { title: '_expense_meta' } }]
          });
        }
        return errorResponse(502);
      }
    );
    invalidateExpenseMetaSheetCache();

    await expect(
      appendExpenseMetadataRow(spreadsheetId, makeExpense({}), MEMBERS)
    ).rejects.toThrow();

    const appends = parseProxyCalls(fetchMock).filter((c) =>
      c.url.includes(':append')
    );
    expect(appends).toHaveLength(1);
  });

  it('replays a rejected-upfront request on 429 and surfaces Google detail on failure', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(errorResponse(429))
      .mockImplementation(async () =>
        errorResponse(400, 'Range exceeds grid limits')
      );

    await expect(
      appendExpenseMetadataRow(spreadsheetId, makeExpense({}), MEMBERS)
    ).rejects.toThrow('Range exceeds grid limits');
  });
});
