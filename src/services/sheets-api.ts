import type { SpreadsheetInfo, Expense, SheetData, MemberInfo } from '../types';
import { FIXED_COLUMNS } from '../types';
import { getAccessToken } from './google-auth';
import { normalizeCategory } from '../utils/format';
import { v4 as uuidv4 } from 'uuid';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const MAX_ROWS = 10000;

function columnLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

interface ApiErrorResponse {
  error?: { message?: string };
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers }
  });
  if (!res.ok) {
    const body: ApiErrorResponse = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message || `API error: ${res.status}`);
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
  const [expenseData, settingsData] = await Promise.all([
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:${lastCol}${MAX_ROWS}`
    ).catch(() => ({ values: undefined })),
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B10`
    ).catch(() => ({ values: undefined }))
  ]);

  let currency = 'EUR';
  let lastSplitType: import('../types').SplitType = 'equal';
  if (settingsData.values) {
    const currRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'currency'
    );
    if (currRow?.[1]) currency = currRow[1];
    const splitRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'lastsplittype'
    );
    if (
      splitRow?.[1] &&
      ['equal', 'exact', 'percentage', 'shares'].includes(splitRow[1])
    ) {
      lastSplitType = splitRow[1] as import('../types').SplitType;
    }
  }

  let lastPaidBy = '';
  if (settingsData.values) {
    const paidRow = settingsData.values.find(
      (r) => r[0]?.toLowerCase() === 'lastpaidby'
    );
    if (paidRow?.[1]) lastPaidBy = paidRow[1];
  }

  if (!expenseData.values || expenseData.values.length <= 1) {
    return { members: [], expenses: [], currency, lastSplitType, lastPaidBy };
  }

  const headers = expenseData.values[0];
  const memberNames = headers.slice(FIXED_COLUMNS);
  const expenses: Expense[] = [];

  for (let i = 1; i < expenseData.values.length; i++) {
    const row = expenseData.values[i];
    if (!row || row.length < FIXED_COLUMNS || !row[0]) continue;

    const splits: Record<string, number> = {};
    let paidBy = '';
    let maxPositive = -Infinity;

    for (let j = 0; j < memberNames.length; j++) {
      const val = parseFloat(row[FIXED_COLUMNS + j] || '0');
      splits[memberNames[j]] = val;
      if (val > maxPositive) {
        maxPositive = val;
        paidBy = memberNames[j];
      }
    }

    const cost = parseFloat(row[3] || '0');
    const category = normalizeCategory(row[2] || 'General');
    const expCurrency = row[4] || currency;

    expenses.push({
      id: uuidv4(),
      date: row[0],
      description: row[1] || '',
      category,
      cost,
      currency: expCurrency,
      paidBy,
      splitType: 'equal',
      splits
    });
  }
  return {
    members: memberNames,
    expenses,
    currency,
    lastSplitType,
    lastPaidBy
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
    expense.cost.toFixed(2),
    expense.currency,
    ...members.map((m) => (expense.splits[m] ?? 0).toFixed(2))
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

export async function clearSheet(spreadsheetId: string): Promise<void> {
  await apiRequest<unknown>(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A2:ZZ${MAX_ROWS}:clear`,
    { method: 'POST', body: JSON.stringify({}) }
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

export async function initializeSheetIfNeeded(
  spreadsheetId: string,
  members: string[],
  currency: string
): Promise<void> {
  const info = await getSpreadsheetInfo(spreadsheetId);

  if (!info.sheets.includes('_settings')) {
    await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: '_settings' } } }]
      })
    });
    await apiRequest<unknown>(
      `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [['currency', currency]] })
      }
    );
  }

  if (!info.sheets.includes('Expenses')) {
    await apiRequest<unknown>(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: 'Expenses' } } }]
      })
    });
    const headers = [
      'Date',
      'Description',
      'Category',
      'Cost',
      'Currency',
      ...members
    ];
    await apiRequest<unknown>(
      `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ values: [headers] }) }
    );
  }
}
