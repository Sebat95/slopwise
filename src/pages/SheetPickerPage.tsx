import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { listSpreadsheets, createSpreadsheet } from '../services/sheets-api';
import { parseSplitwiseCSV } from '../utils/csv';
import type { SpreadsheetInfo } from '../types';
import { CURRENCIES } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { FileSpreadsheet, Plus, Upload, Search, Clock, ArrowRight, ChevronLeft, Users } from 'lucide-react';
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
      setError(err instanceof Error ? err.message : 'Failed to list spreadsheets');
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
      setError(err instanceof Error ? err.message : 'Failed to open spreadsheet');
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const members = newMembers.split(',').map((m) => m.trim()).filter(Boolean);
    if (members.length < 2) {
      setError('Add at least 2 members (comma-separated)');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const id = await createSpreadsheet(newName.trim(), members, currency);
      selectSpreadsheet(id, newName.trim());
      await loadData();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create spreadsheet');
      setCreating(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setError(null);

    try {
      const text = await importFile.text();
      const { members, expenses } = parseSplitwiseCSV(text);
      if (members.length === 0) {
        setError('Could not parse CSV. Make sure it matches Splitwise export format.');
        setImporting(false);
        return;
      }

      const name = importFile.name.replace(/\.csv$/i, '') || 'Imported Expenses';
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

  const filtered = sheets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  if (view === 'create') {
    return (
      <div className="min-h-full px-4 py-6 max-w-lg mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-text-secondary text-sm mb-6 hover:text-text-primary transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-bold text-text-primary mb-6">New Expense Group</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Group Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Trip to Paris"
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              <Users size={12} className="inline mr-1" />
              Members (comma-separated)
            </label>
            <input
              type="text"
              value={newMembers}
              onChange={(e) => setNewMembers(e.target.value)}
              placeholder="e.g., Alice, Bob, Charlie"
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Currency</label>
            <select
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-primary appearance-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="w-full bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'import') {
    return (
      <div className="min-h-full px-4 py-6 max-w-lg mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-text-secondary text-sm mb-6 hover:text-text-primary transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-bold text-text-primary mb-2">Import from CSV</h1>
        <p className="text-sm text-text-secondary mb-6">
          Import a Splitwise CSV export. The app will create a new spreadsheet with the imported data.
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
            className="w-full border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors"
          >
            <Upload size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-secondary">
              {importFile ? importFile.name : 'Click to select CSV file'}
            </p>
          </button>

          {error && (
            <p className="text-danger text-sm bg-danger/10 rounded-xl p-3">{error}</p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !importFile}
            className="w-full bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : 'Import & Create Sheet'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Choose a Spreadsheet</h1>
      <p className="text-sm text-text-secondary mb-6">Select an existing sheet or create a new one</p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('create')}
          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Plus size={18} /> New Group
        </button>
        <button
          onClick={() => setView('import')}
          className="flex-1 flex items-center justify-center gap-2 bg-bg-surface text-text-primary border border-border rounded-xl px-4 py-3 text-sm font-medium hover:border-primary/50 transition-colors"
        >
          <Upload size={18} /> Import CSV
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search spreadsheets..."
          className="w-full bg-bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 rounded-xl p-3 mb-4">{error}</p>
      )}

      {loading ? (
        <LoadingSpinner text="Loading your spreadsheets..." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileSpreadsheet size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary text-sm">No spreadsheets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => handleSelect(sheet)}
              className="w-full flex items-center gap-3 p-3.5 bg-bg-card border border-border/50 rounded-xl hover:border-primary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-bg-surface rounded-lg flex items-center justify-center shrink-0">
                <FileSpreadsheet size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">{sheet.name}</p>
                {sheet.modifiedTime && (
                  <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
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
