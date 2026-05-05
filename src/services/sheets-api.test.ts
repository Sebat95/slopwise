import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readSheetData } from './sheets-api';
import { normalizeCategory } from '../utils/format';

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
});
