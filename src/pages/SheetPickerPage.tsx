import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { listSpreadsheets, createSpreadsheet } from '../services/sheets-api';
import { parseCompetitorCSV } from '../utils/csv';
import type { SpreadsheetInfo } from '../types';
import { CURRENCIES } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  FileSpreadsheet,
  Plus,
  Upload,
  Search,
  Clock,
  ArrowRight,
  ChevronLeft,
  Users
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type View = 'list' | 'create' | 'import';

export default function SheetPickerPage() {
  const navigate = useNavigate();
  const { selectSpreadsheet, loadData, importExpenses, currency } = useApp();
  const [view, setView] = useState<View>('list');
  const [sheets, setSheets] = useState<SpreadsheetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [creating, setCreating] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSpreadsheets();
      setSheets(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to list spreadsheets'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  const handleSelect = async (sheet: SpreadsheetInfo) => {
    setLoading(true);
    try {
      selectSpreadsheet(sheet.id, sheet.name);
      await loadData();
      navigate('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to open spreadsheet'
      );
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const members = newMembers
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (members.length < 2) {
      setError('Add at least 2 members (comma-separated)');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const id = await createSpreadsheet(newName.trim(), members, newCurrency);
      selectSpreadsheet(id, newName.trim());
      await loadData();
      navigate('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create spreadsheet'
      );
      setCreating(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setError(null);

    try {
      const text = await importFile.text();
      const { members, expenses } = parseCompetitorCSV(text);
      if (members.length === 0) {
        setError(
          'Could not parse CSV. Make sure it matches Competitor export format.'
        );
        setImporting(false);
        return;
      }

      const name =
        importFile.name.replace(/\.csv$/i, '') || 'Imported Expenses';
      const id = await createSpreadsheet(name, members, currency);
      selectSpreadsheet(id, name);
      await importExpenses(expenses, members);
      await loadData();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  };

  const filtered = sheets.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  if (view === 'create') {
    return (
      <div className="mx-auto min-h-full max-w-lg px-4 py-6">
        <button
          onClick={() => setView('list')}
          className="text-text-secondary hover:text-text-primary mb-6 flex items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-text-primary mb-6 text-2xl font-bold">
          New Expense Group
        </h1>

        <div className="space-y-4">
          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Group Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Trip to Paris"
              className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              <Users size={12} className="mr-1 inline" />
              Members (comma-separated)
            </label>
            <input
              type="text"
              value={newMembers}
              onChange={(e) => setNewMembers(e.target.value)}
              placeholder="e.g., Alice, Bob, Charlie"
              className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-secondary mb-1.5 block text-xs font-medium">
              Currency
            </label>
            <select
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              className="bg-bg-input border-border text-text-primary focus:border-primary w-full appearance-none rounded-xl border px-4 py-3 text-sm focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-danger bg-danger/10 rounded-xl p-3 text-sm">
              {error}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="bg-primary hover:bg-primary-dark w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'import') {
    return (
      <div className="mx-auto min-h-full max-w-lg px-4 py-6">
        <button
          onClick={() => setView('list')}
          className="text-text-secondary hover:text-text-primary mb-6 flex items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-text-primary mb-2 text-2xl font-bold">
          Import from CSV
        </h1>
        <p className="text-text-secondary mb-6 text-sm">
          Import a Competitor CSV export. The app will create a new spreadsheet
          with the imported data.
        </p>

        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="border-border hover:border-primary/50 w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors"
          >
            <Upload size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-text-secondary text-sm">
              {importFile ? importFile.name : 'Click to select CSV file'}
            </p>
          </button>

          {error && (
            <p className="text-danger bg-danger/10 rounded-xl p-3 text-sm">
              {error}
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !importFile}
            className="bg-primary hover:bg-primary-dark w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import & Create Sheet'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-lg px-4 py-6">
      <h1 className="text-text-primary mb-1 text-2xl font-bold">
        Choose a Spreadsheet
      </h1>
      <p className="text-text-secondary mb-6 text-sm">
        Select an existing sheet or create a new one
      </p>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView('create')}
          className="bg-primary hover:bg-primary-dark flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition-colors"
        >
          <Plus size={18} /> New Group
        </button>
        <button
          onClick={() => setView('import')}
          className="bg-bg-surface text-text-primary border-border hover:border-primary/50 flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
        >
          <Upload size={18} /> Import CSV
        </button>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="text-text-muted absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search spreadsheets..."
          className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border py-2.5 pr-4 pl-9 text-sm focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-danger bg-danger/10 mb-4 rounded-xl p-3 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <LoadingSpinner text="Loading your spreadsheets..." />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <FileSpreadsheet size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">No spreadsheets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => handleSelect(sheet)}
              className="bg-bg-card border-border/50 hover:border-primary/50 flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
            >
              <div className="bg-bg-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <FileSpreadsheet size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-text-primary truncate font-medium">
                  {sheet.name}
                </p>
                {sheet.modifiedTime && (
                  <p className="text-text-muted mt-0.5 flex items-center gap-1 text-xs">
                    <Clock size={10} />
                    {format(parseISO(sheet.modifiedTime), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <ArrowRight size={16} className="text-text-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
