import type {
  SpreadsheetInfo,
  Expense,
  SheetData,
  MemberInfo,
  SplitType,
  SplitValuePresets
} from '../types';
import { FIXED_COLUMNS } from '../types';
import { notifySessionExpired } from './google-auth';
import { normalizeCategory, parseSheetMoneyCents } from '../utils/format';
import { v4 as uuidv4 } from 'uuid';
import { absorbSplitSumIntoPayer } from '../utils/balance';
import { emptySplitValuePresets } from '../utils/split-presets';

const API_BASE = '/api';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const MAX_ROWS = 10000;
const SPLIT_TYPES: SplitType[] = ['equal', 'exact', 'percentage', 'shares'];
const EXPENSE_META_SHEET = '_expense_meta';

interface ExpenseMetaRow {
  signature: string;
  paidBy: string;
  splitType: SplitType;
}

function isSplitType(value: string | undefined): value is SplitType {
  return value !== undefined && SPLIT_TYPES.includes(value as SplitType);
}

/** Sheet storage: always integer cents (no decimals, no thousands). */
function formatMoney(value: number): string {
  return String(Math.trunc(value));
}

function trimTrailingZeroSplits(values: number[]): number[] {
  const next = values.map((v) => Math.trunc(v));
  while (next.length > 0 && Math.abs(next[next.length - 1]) < 1) {
    next.pop();
  }
  return next;
}

function buildExpenseSignature(
  date: string,
  description: string,
  category: string,
  cost: number,
  currency: string,
  splitValues: number[]
): string {
  return JSON.stringify({
    date,
    description,
    category,
    costCents: Math.trunc(cost),
    currency,
    splitsCents: trimTrailingZeroSplits(splitValues).map((v) => Math.trunc(v))
  });
}

function buildExpenseSignatureFromExpense(
  expense: Expense,
  members: string[]
): string {
  return buildExpenseSignature(
    expense.date,
    (expense.description || '').trim(),
    normalizeCategory(expense.category || 'General'),
    expense.cost,
    expense.currency,
    members.map((member) => expense.splits[member] ?? 0)
  );
}

function buildExpenseSignatureFromRow(
  row: string[],
  memberColumns: Array<{ colIndex: number }>,
  fallbackCurrency: string
): string {
  return buildExpenseSignature(
    row[0] || '',
    (row[1] || '').trim(),
    normalizeCategory(row[2] || 'General'),
    parseSheetMoneyCents(row[3] || '0'),
    row[4] || fallbackCurrency,
    memberColumns.map((memberColumn) =>
      parseSheetMoneyCents(row[memberColumn.colIndex] || '0')
    )
  );
}

function buildExpenseMetaQueues(
  metaRows: ExpenseMetaRow[]
): Map<string, ExpenseMetaRow[]> {
  const queues = new Map<string, ExpenseMetaRow[]>();
  for (const metaRow of metaRows) {
    const queue = queues.get(metaRow.signature);
    if (queue) {
      queue.push(metaRow);
    } else {
      queues.set(metaRow.signature, [metaRow]);
    }
  }
  return queues;
}

function parseSplitValuePresets(raw: string | undefined): SplitValuePresets {
  const defaults = emptySplitValuePresets();
  if (!raw) return defaults;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;

    const result = emptySplitValuePresets();
    for (const type of SPLIT_TYPES) {
      const typeValues = (parsed as Record<string, unknown>)[type];
      if (!typeValues || typeof typeValues !== 'object') continue;

      for (const [member, value] of Object.entries(
        typeValues as Record<string, unknown>
      )) {
        if (
          !member.trim() ||
          typeof value !== 'number' ||
          !Number.isFinite(value)
        )
          continue;
        result[type][member.trim()] = value;
      }
    }
    return result;
  } catch {
    return defaults;
  }
}

function columnLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

interface ApiErrorResponse {
  error?: { message?: string } | string;
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/googleProxy`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: options?.method || 'GET',
      body: typeof options?.body === 'string' ? options.body : null
    })
  });
  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
    }
    const body: ApiErrorResponse = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    const message =
      typeof body.error === 'string'
        ? body.error
        : body.error?.message || `API error: ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function listSpreadsheets(): Promise<SpreadsheetInfo[]> {
  const data = await apiRequest<{
    files: Array<{ id: string; name: string; modifiedTime: string }>;
  }>(
    `${DRIVE_API}?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime)`
  );

  return data.files.map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime
  }));
}

export async function createSpreadsheet(
  name: string,
  members: string[],
  currency: string
): Promise<string> {
  const headers = [
    'Date',
    'Description',
    'Category',
    'Cost',
    'Currency',
    ...members
  ];
  const data = await apiRequest<{ spreadsheetId: string }>(`${SHEETS_API}`, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: name },
      sheets: [
        {
          properties: { title: 'Expenses', index: 0 },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: headers.map((h) => ({
                    userEnteredValue: { stringValue: h }
                  }))
                }
              ]
            }
          ]
        },
        {
          properties: { title: '_settings', index: 1 },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'currency' } },
                    { userEnteredValue: { stringValue: currency } }
                  ]
                }
              ]
            }
          ]
        },
        {
          properties: { title: '_members', index: 2 },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Name' } },
                    { userEnteredValue: { stringValue: 'Email' } },
                    { userEnteredValue: { stringValue: 'PhotoURL' } }
                  ]
                }
              ]
            }
          ]
        },
        {
          properties: { title: EXPENSE_META_SHEET, index: 3 },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Signature' } },
                    { userEnteredValue: { stringValue: 'PaidBy' } },
                    { userEnteredValue: { stringValue: 'SplitType' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
  });
  return data.spreadsheetId;
}

export async function renameSpreadsheet(
  spreadsheetId: string,
  newName: string
): Promise<void> {
  await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          updateSpreadsheetProperties: {
            properties: { title: newName },
            fields: 'title'
          }
        }
      ]
    })
  });
}

export async function getSpreadsheetInfo(
  spreadsheetId: string
): Promise<{ title: string; sheets: string[] }> {
  const data = await apiRequest<{
    properties: { title: string };
    sheets: Array<{ properties: { title: string } }>;
  }>(
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  );

  return {
    title: data.properties.title,
    sheets: data.sheets.map((s) => s.properties.title)
  };
}

export async function readSheetData(spreadsheetId: string): Promise<SheetData> {
  const lastCol = columnLetter(FIXED_COLUMNS + 50);
  const [expenseData, settingsData, expenseMetaRows] = await Promise.all([
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:${lastCol}${MAX_ROWS}`
    ),
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B10`
    ).catch(() => ({ values: undefined })),
    readExpenseMetadata(spreadsheetId).catch((): ExpenseMetaRow[] => [])
  ]);

  let currency = 'EUR';
  let lastSplitType: SplitType = 'equal';
  let lastSplitValuePresets: SplitValuePresets = emptySplitValuePresets();
  if (settingsData.values) {
    const currRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'currency'
    );
    if (currRow?.[1]) currency = currRow[1];
    const splitRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'lastsplittype'
    );
    if (splitRow?.[1] && isSplitType(splitRow[1])) {
      lastSplitType = splitRow[1] as SplitType;
    }
    const valuesRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'lastsplitvaluepresets'
    );
    lastSplitValuePresets = parseSplitValuePresets(valuesRow?.[1]);
  }

  let lastPaidBy = '';
  if (settingsData.values) {
    const paidRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'lastpaidby'
    );
    if (paidRow?.[1]) lastPaidBy = paidRow[1];
  }

  const headers = expenseData.values?.[0] || [];
  const memberColumns = headers
    .slice(FIXED_COLUMNS)
    .map((name, idx) => ({
      name: (name || '').trim(),
      colIndex: FIXED_COLUMNS + idx
    }))
    .filter((c) => c.name.length > 0);
  const memberNames = memberColumns.map((c) => c.name);
  const expenseMetaQueues = buildExpenseMetaQueues(expenseMetaRows);

  if (!expenseData.values || expenseData.values.length <= 1) {
    return {
      members: memberNames,
      expenses: [],
      currency,
      lastSplitType,
      lastPaidBy,
      lastSplitValuePresets
    };
  }

  const expenses: Expense[] = [];

  for (let i = 1; i < expenseData.values.length; i++) {
    const row = expenseData.values[i];
    if (!row || row.length < FIXED_COLUMNS || !row[0]) continue;

    const splits: Record<string, number> = {};
    let inferredPaidBy = '';
    let maxPositive = -Infinity;

    for (const memberColumn of memberColumns) {
      const val = parseSheetMoneyCents(row[memberColumn.colIndex] || '0');
      splits[memberColumn.name] = Math.trunc(val);
      if (val > maxPositive) {
        maxPositive = val;
        inferredPaidBy = memberColumn.name;
      }
    }

    const rowSignature = buildExpenseSignatureFromRow(
      row,
      memberColumns,
      currency
    );
    const matchingMeta = expenseMetaQueues.get(rowSignature)?.shift();
    const paidBy =
      matchingMeta?.paidBy && memberNames.includes(matchingMeta.paidBy)
        ? matchingMeta.paidBy
        : inferredPaidBy;
    const splitType = matchingMeta?.splitType || 'equal';

    absorbSplitSumIntoPayer(splits, paidBy);

    const cost = parseSheetMoneyCents(row[3] || '0');
    const category = normalizeCategory(row[2] || 'General');
    const expCurrency = row[4] || currency;

    expenses.push({
      id: uuidv4(),
      date: row[0],
      description: (row[1] || '').trim(),
      category,
      cost,
      currency: expCurrency,
      paidBy,
      splitType,
      splits
    });
  }
  return {
    members: memberNames,
    expenses,
    currency,
    lastSplitType,
    lastPaidBy,
    lastSplitValuePresets
  };
}

export async function saveSetting(
  spreadsheetId: string,
  key: string,
  value: string
): Promise<void> {
  const data = await apiRequest<{ values?: string[][] }>(
    `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B20`
  ).catch(() => ({ values: undefined }));

  const rows = data.values ? [...data.values] : [];
  const idx = rows.findIndex((r) => r[0]?.toLowerCase() === key.toLowerCase());
  if (idx >= 0) {
    rows[idx] = [rows[idx][0], value];
  } else {
    rows.push([key, value]);
  }

  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B${rows.length}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) }
  );
}

function expenseToRow(expense: Expense, members: string[]): string[] {
  return [
    expense.date,
    expense.description,
    expense.category,
    formatMoney(expense.cost),
    expense.currency,
    ...members.map((m) => formatMoney(expense.splits[m] ?? 0))
  ];
}

export async function appendExpense(
  spreadsheetId: string,
  expense: Expense,
  members: string[]
): Promise<void> {
  const row = expenseToRow(expense, members);
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) }
  );
}

export async function writeAllExpenses(
  spreadsheetId: string,
  expenses: Expense[],
  members: string[]
): Promise<void> {
  const headers = [
    'Date',
    'Description',
    'Category',
    'Cost',
    'Currency',
    ...members
  ];
  const rows = [headers, ...expenses.map((e) => expenseToRow(e, members))];
  const lastCol = columnLetter(headers.length - 1);

  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:${lastCol}${MAX_ROWS}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) }
  );
  await writeAllExpenseMetadata(spreadsheetId, expenses, members);
}

export async function addMemberColumn(
  spreadsheetId: string,
  members: string[],
  newMember: string
): Promise<void> {
  const colLetter = columnLetter(FIXED_COLUMNS + members.length);
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!${colLetter}1?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: [[newMember]] }) }
  );
}

export async function renameMemberColumn(
  spreadsheetId: string,
  members: string[],
  oldName: string,
  newName: string
): Promise<void> {
  const colIndex = members.indexOf(oldName);
  if (colIndex < 0) return;
  const colLetter = columnLetter(FIXED_COLUMNS + colIndex);
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!${colLetter}1?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: [[newName]] }) }
  );
}

export async function updateExpenseRow(
  spreadsheetId: string,
  rowIndex: number,
  expense: Expense,
  members: string[]
): Promise<void> {
  const row = expenseToRow(expense, members);
  const rowNum = rowIndex + 2;
  const lastCol = columnLetter(row.length - 1);
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A${rowNum}:${lastCol}${rowNum}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: [row] }) }
  );
}

export async function deleteExpenseRow(
  spreadsheetId: string,
  rowIndex: number
): Promise<void> {
  const sheetInfo = await apiRequest<{
    sheets: Array<{ properties: { sheetId: number; title: string } }>;
  }>(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`);

  const expensesSheet = sheetInfo.sheets.find(
    (s) => s.properties.title === 'Expenses'
  );
  if (!expensesSheet) throw new Error('Expenses sheet not found');

  await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: expensesSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex + 1,
              endIndex: rowIndex + 2
            }
          }
        }
      ]
    })
  });
}

export async function readMemberProfiles(
  spreadsheetId: string
): Promise<MemberInfo[]> {
  const data = await apiRequest<{ values?: string[][] }>(
    `${SHEETS_API}/${spreadsheetId}/values/_members!A2:C100`
  ).catch(() => ({ values: undefined }));

  if (!data.values) return [];
  return data.values
    .filter((r) => r[0])
    .map((r) => ({ name: r[0], email: r[1] || '', photoUrl: r[2] || '' }));
}

async function ensureExpenseMetaSheet(spreadsheetId: string): Promise<void> {
  const info = await getSpreadsheetInfo(spreadsheetId);
  if (!info.sheets.includes(EXPENSE_META_SHEET)) {
    await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: EXPENSE_META_SHEET } } }]
      })
    });
    await apiRequest<unknown>(
      `${SHEETS_API}/${spreadsheetId}/values/${EXPENSE_META_SHEET}!A1:C1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [['Signature', 'PaidBy', 'SplitType']] })
      }
    );
  }
}

async function readExpenseMetadata(
  spreadsheetId: string
): Promise<ExpenseMetaRow[]> {
  const data = await apiRequest<{ values?: string[][] }>(
    `${SHEETS_API}/${spreadsheetId}/values/${EXPENSE_META_SHEET}!A2:C${MAX_ROWS}`
  ).catch(() => ({ values: undefined }));

  if (!data.values) return [];

  const metadata: ExpenseMetaRow[] = [];
  for (const row of data.values) {
    const signature = row[0]?.trim();
    const paidBy = row[1]?.trim() || '';
    const splitType = row[2]?.trim();
    if (!signature || !isSplitType(splitType)) continue;
    metadata.push({ signature, paidBy, splitType });
  }

  return metadata;
}

export async function writeAllExpenseMetadata(
  spreadsheetId: string,
  expenses: Expense[],
  members: string[]
): Promise<void> {
  await ensureExpenseMetaSheet(spreadsheetId);
  const rows = [
    ['Signature', 'PaidBy', 'SplitType'],
    ...expenses.map((expense) => [
      buildExpenseSignatureFromExpense(expense, members),
      expense.paidBy,
      expense.splitType
    ])
  ];

  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/${EXPENSE_META_SHEET}!A1:C${rows.length}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) }
  );
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/${EXPENSE_META_SHEET}!A${rows.length + 1}:C${MAX_ROWS}:clear`,
    { method: 'POST', body: JSON.stringify({}) }
  ).catch(() => {});
}

async function ensureMembersSheet(spreadsheetId: string): Promise<void> {
  const info = await getSpreadsheetInfo(spreadsheetId);
  if (!info.sheets.includes('_members')) {
    await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: '_members' } } }]
      })
    });
    await apiRequest<unknown>(
      `${SHEETS_API}/${spreadsheetId}/values/_members!A1:C1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [['Name', 'Email', 'PhotoURL']] })
      }
    );
  }
}

export async function writeAllMemberProfiles(
  spreadsheetId: string,
  profiles: MemberInfo[]
): Promise<void> {
  await ensureMembersSheet(spreadsheetId);
  const header = ['Name', 'Email', 'PhotoURL'];
  const rows = [header, ...profiles.map((p) => [p.name, p.email, p.photoUrl])];
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/_members!A1:C${rows.length}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: rows }) }
  );
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/_members!A${rows.length + 1}:C200:clear`,
    { method: 'POST', body: JSON.stringify({}) }
  ).catch(() => {});
}
