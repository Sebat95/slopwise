import type { SpreadsheetInfo, Expense, SheetData } from '../types';
import { getAccessToken } from './google-auth';
import { v4 as uuidv4 } from 'uuid';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers }
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error: ${res.status}`);
  }
  return res.json();
}

export async function listSpreadsheets(): Promise<SpreadsheetInfo[]> {
  const data = await apiRequest<{
    files: { id: string; name: string; modifiedTime: string }[];
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
  await apiRequest(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
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
    sheets: { properties: { title: string } }[];
  }>(
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  );

  return {
    title: data.properties.title,
    sheets: data.sheets.map((s) => s.properties.title)
  };
}

export async function readSheetData(spreadsheetId: string): Promise<SheetData> {
  const [expenseData, settingsData] = await Promise.all([
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:ZZ10000`
    ).catch(() => ({ values: undefined })),
    apiRequest<{ values?: string[][] }>(
      `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B10`
    ).catch(() => ({ values: undefined }))
  ]);

  let currency = 'EUR';
  if (settingsData.values) {
    const currRow = settingsData.values.find(
      (r) => r[0].toLowerCase() === 'currency'
    );
    if (currRow?.[1]) currency = currRow[1];
  }

  if (!expenseData.values || expenseData.values.length <= 1) {
    return { members: [], expenses: [], currency };
  } else {
    currency = expenseData.values[1][4];
  }

  const headers = expenseData.values[0];
  const memberNames = headers.slice(5);
  const expenses: Expense[] = [];

  for (let i = 1; i < expenseData.values.length; i++) {
    const row = expenseData.values[i];
    if (!row || row.length < 5 || !row[0]) continue;

    const splits: Record<string, number> = {};
    let paidBy = '';
    let maxPositive = -Infinity;

    for (let j = 0; j < memberNames.length; j++) {
      const val = parseFloat(row[5 + j] || '0');
      splits[memberNames[j]] = val;
      if (val > maxPositive) {
        maxPositive = val;
        paidBy = memberNames[j];
      }
    }

    const cost = parseFloat(row[3] || '0');
    const category = row[2] || 'General';

    expenses.push({
      id: uuidv4(),
      date: row[0],
      description: row[1] || '',
      category,
      cost,
      currency: row[4] || currency,
      paidBy,
      splitType: 'equal',
      splits,
      notes: ''
    });
  }
  return { members: memberNames, expenses, currency };
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
  await apiRequest(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: [row] })
    }
  );
}

export async function writeAllExpenses(
  spreadsheetId: string,
  expenses: Expense[],
  members: string[],
  _currency: string
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

  await apiRequest(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1:ZZ10000?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: rows })
    }
  );
}

export async function addMemberColumn(
  spreadsheetId: string,
  members: string[],
  newMember: string
): Promise<void> {
  const colIndex = 5 + members.length;
  const colLetter = String.fromCharCode(65 + colIndex);
  await apiRequest(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!${colLetter}1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [[newMember]] })
    }
  );
}

export async function clearSheet(spreadsheetId: string): Promise<void> {
  await apiRequest(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A2:ZZ10000:clear`,
    {
      method: 'POST',
      body: JSON.stringify({})
    }
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
  await apiRequest(
    `${SHEETS_API}/${spreadsheetId}/values/Expenses!A${rowNum}:ZZ${rowNum}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [row] })
    }
  );
}

export async function deleteExpenseRow(
  spreadsheetId: string,
  rowIndex: number
): Promise<void> {
  const sheetInfo = await apiRequest<{
    sheets: { properties: { sheetId: number; title: string } }[];
  }>(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`);

  const expensesSheet = sheetInfo.sheets.find(
    (s) => s.properties.title === 'Expenses'
  );
  if (!expensesSheet) throw new Error('Expenses sheet not found');

  await apiRequest(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
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

export async function initializeSheetIfNeeded(
  spreadsheetId: string,
  members: string[],
  currency: string
): Promise<void> {
  const info = await getSpreadsheetInfo(spreadsheetId);

  if (!info.sheets.includes('_settings')) {
    await apiRequest(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: '_settings' } } }]
      })
    });

    await apiRequest(
      `${SHEETS_API}/${spreadsheetId}/values/_settings!A1:B1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [['currency', currency]] })
      }
    );
  }

  if (!info.sheets.includes('Expenses')) {
    await apiRequest(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
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
    await apiRequest(
      `${SHEETS_API}/${spreadsheetId}/values/Expenses!A1?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [headers] })
      }
    );
  }
}
