import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { exportToCSV, downloadCSV, parseSplitwiseCSV } from '../utils/csv';
import {
  LogOut, UserPlus, Download, Upload, FileSpreadsheet, ExternalLink,
  Users, RefreshCw, Unplug
} from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    spreadsheetId, spreadsheetName, members, expenses, currency,
    addMember, importExpenses, loadData, disconnect, isLoading
  } = useApp();

  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;
    if (members.includes(name)) return;

    setAdding(true);
    try {
      await addMember(name);
      setShowAddMember(false);
      setNewMemberName('');
    } catch {
    } finally {
      setAdding(false);
    }
  };

  const handleExport = () => {
    const csv = exportToCSV(expenses, members);
    const filename = `${spreadsheetName || 'expenses'}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { members: csvMembers, expenses: csvExpenses } = parseSplitwiseCSV(text);
      if (csvMembers.length === 0) {
        alert('Could not parse CSV file. Make sure it matches Splitwise export format.');
        return;
      }
      if (window.confirm(`Import ${csvExpenses.length} expenses with ${csvMembers.length} members?`)) {
        await importExpenses(csvExpenses, csvMembers);
      }
    } catch (err) {
      alert('Failed to import CSV file');
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  const handleLogout = () => {
    if (window.confirm('Sign out? You will need to sign in again to access your sheets.')) {
      logout();
      navigate('/');
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('Disconnect from this spreadsheet? You can reconnect later.')) {
      disconnect();
      navigate('/sheets');
    }
  };

  return (
    <Layout>
      <div className="px-4 py-4 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-text-primary mb-6">Settings</h1>

        {/* Spreadsheet Info */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Spreadsheet</h2>
          <div className="bg-bg-card border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={20} className="text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{spreadsheetName}</p>
                <p className="text-xs text-text-muted truncate">{spreadsheetId}</p>
              </div>
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-bg-surface transition-colors"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => loadData()}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1.5 bg-bg-surface text-text-primary border border-border rounded-lg px-3 py-2 text-xs font-medium hover:border-primary/30 transition-colors"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 flex items-center justify-center gap-1.5 bg-bg-surface text-text-primary border border-border rounded-lg px-3 py-2 text-xs font-medium hover:border-warning/30 transition-colors"
              >
                <Unplug size={14} /> Switch Sheet
              </button>
            </div>
          </div>
        </section>

        {/* Members */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              <Users size={12} className="inline mr-1" />
              Members ({members.length})
            </h2>
            <button
              onClick={() => setShowAddMember(true)}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              <UserPlus size={14} /> Add
            </button>
          </div>
          <div className="bg-bg-card border border-border/50 rounded-xl divide-y divide-border/30">
            {members.map((m) => (
              <div key={m} className="flex items-center gap-3 p-3">
                <Avatar name={m} size="sm" />
                <span className="text-sm text-text-primary">{m}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Data */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Data</h2>
          <div className="space-y-2">
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 p-3.5 bg-bg-card border border-border/50 rounded-xl hover:border-primary/30 transition-colors"
            >
              <Download size={18} className="text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Export CSV</p>
                <p className="text-xs text-text-muted">Splitwise-compatible format</p>
              </div>
            </button>

            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 p-3.5 bg-bg-card border border-border/50 rounded-xl hover:border-primary/30 transition-colors"
            >
              <Upload size={18} className="text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Import CSV</p>
                <p className="text-xs text-text-muted">Import Splitwise CSV export</p>
              </div>
            </button>
          </div>
        </section>

        {/* Stats */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Stats</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-bg-card border border-border/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{expenses.length}</p>
              <p className="text-[10px] text-text-muted">Expenses</p>
            </div>
            <div className="bg-bg-card border border-border/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{members.length}</p>
              <p className="text-[10px] text-text-muted">Members</p>
            </div>
            <div className="bg-bg-card border border-border/50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{currency}</p>
              <p className="text-[10px] text-text-muted">Currency</p>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Account</h2>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3.5 bg-bg-card border border-danger/20 rounded-xl hover:border-danger/40 transition-colors"
          >
            <LogOut size={18} className="text-danger" />
            <span className="text-sm font-medium text-danger">Sign Out</span>
          </button>
        </section>
      </div>

      {/* Add Member Modal */}
      <Modal open={showAddMember} onClose={() => setShowAddMember(false)} title="Add Member">
        <div className="space-y-4">
          <input
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Member name"
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
          />
          <button
            onClick={handleAddMember}
            disabled={adding || !newMemberName.trim() || members.includes(newMemberName.trim())}
            className="w-full bg-primary text-white rounded-xl px-4 py-3.5 font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}
