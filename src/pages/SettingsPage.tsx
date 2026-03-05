import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { exportToCSV, downloadCSV, parseSplitwiseCSV } from '../utils/csv';
import {
  LogOut,
  UserPlus,
  Download,
  Upload,
  FileSpreadsheet,
  ExternalLink,
  Users,
  RefreshCw,
  Unplug,
  Pencil,
  Check,
  X,
  Link
} from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    spreadsheetId,
    spreadsheetName,
    members,
    memberProfiles,
    expenses,
    addMember,
    renameMember,
    linkMemberToGoogle,
    importExpenses,
    loadData,
    disconnect,
    isLoading
  } = useApp();

  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState('');

  const startEditMember = (name: string) => {
    setEditingMember(name);
    setMemberDraft(name);
  };

  const confirmRenameMember = async () => {
    if (!editingMember) return;
    const trimmed = memberDraft.trim();
    if (trimmed && trimmed !== editingMember) {
      await renameMember(editingMember, trimmed);
    }
    setEditingMember(null);
  };

  const cancelEditMember = () => {
    setEditingMember(null);
  };

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
      const { members: csvMembers, expenses: csvExpenses } =
        parseSplitwiseCSV(text);
      if (csvMembers.length === 0) {
        alert(
          'Could not parse CSV file. Make sure it matches Splitwise export format.'
        );
        return;
      }
      if (
        window.confirm(
          `Import ${csvExpenses.length} expenses with ${csvMembers.length} members?`
        )
      ) {
        await importExpenses(csvExpenses, csvMembers);
      }
    } catch {
      alert('Failed to import CSV file');
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  const handleLogout = () => {
    if (
      window.confirm(
        'Sign out? You will need to sign in again to access your sheets.'
      )
    ) {
      logout();
      navigate('/');
    }
  };

  const handleDisconnect = () => {
    if (
      window.confirm(
        'Disconnect from this spreadsheet? You can reconnect later.'
      )
    ) {
      disconnect();
      navigate('/sheets');
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-lg px-4 py-4">
        <h1 className="text-text-primary mb-6 text-xl font-bold">Settings</h1>

        {/* Spreadsheet Info */}
        <section className="mb-6">
          <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
            Spreadsheet
          </h2>
          <div className="bg-bg-card border-border/50 space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={20} className="text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-text-primary truncate text-sm font-medium">
                  {spreadsheetName}
                </p>
                <p className="text-text-muted truncate text-xs">
                  {spreadsheetId}
                </p>
              </div>
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="text-text-muted hover:text-primary hover:bg-bg-surface rounded-lg p-2 transition-colors"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => loadData()}
                disabled={isLoading}
                className="bg-bg-surface text-text-primary border-border hover:border-primary/30 flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
              >
                <RefreshCw
                  size={14}
                  className={isLoading ? 'animate-spin' : ''}
                />{' '}
                Refresh
              </button>
              <button
                onClick={handleDisconnect}
                className="bg-bg-surface text-text-primary border-border hover:border-warning/30 flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
              >
                <Unplug size={14} /> Switch Sheet
              </button>
            </div>
          </div>
        </section>

        {/* Members */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
              <Users size={12} className="mr-1 inline" />
              Members ({members.length})
            </h2>
            <button
              onClick={() => setShowAddMember(true)}
              className="text-primary flex items-center gap-1 text-xs hover:underline"
            >
              <UserPlus size={14} /> Add
            </button>
          </div>
          <div className="bg-bg-card border-border/50 divide-border/30 divide-y rounded-xl border">
            {members.map((m) => {
              const profile = memberProfiles[m];
              const isEditing = editingMember === m;

              return (
                <div key={m} className="flex items-center gap-3 p-3">
                  <Avatar name={m} size="sm" />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={memberDraft}
                          onChange={(e) => setMemberDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmRenameMember();
                            if (e.key === 'Escape') cancelEditMember();
                          }}
                          autoFocus
                          className="bg-bg-input border-border text-text-primary focus:border-primary min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm focus:outline-none"
                        />
                        <button
                          onClick={confirmRenameMember}
                          className="text-positive hover:bg-positive/10 rounded-md p-1 transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEditMember}
                          className="text-text-muted hover:bg-bg-surface rounded-md p-1 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditMember(m)}
                        className="group flex items-center gap-1.5 text-left"
                      >
                        <span className="text-text-primary text-sm">{m}</span>
                        <Pencil
                          size={11}
                          className="text-text-muted shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </button>
                    )}
                    {profile?.email && !isEditing && (
                      <p className="text-text-muted mt-0.5 text-[11px]">
                        {profile.email}
                      </p>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => linkMemberToGoogle(m)}
                      className={`shrink-0 rounded-lg p-1.5 text-xs transition-colors ${
                        profile?.email
                          ? 'text-positive hover:bg-positive/10'
                          : 'text-text-muted hover:text-primary hover:bg-primary/10'
                      }`}
                      title={profile?.email ? `Linked to ${profile.email}` : 'Link your Google account'}
                    >
                      <Link size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Data */}
        <section className="mb-6">
          <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
            Data
          </h2>
          <div className="space-y-2">
            <button
              onClick={handleExport}
              className="bg-bg-card border-border/50 hover:border-primary/30 flex w-full items-center gap-3 rounded-xl border p-3.5 transition-colors"
            >
              <Download size={18} className="text-primary" />
              <div className="text-left">
                <p className="text-text-primary text-sm font-medium">
                  Export CSV
                </p>
                <p className="text-text-muted text-xs">
                  Splitwise-compatible format
                </p>
              </div>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="bg-bg-card border-border/50 hover:border-primary/30 flex w-full items-center gap-3 rounded-xl border p-3.5 transition-colors"
            >
              <Upload size={18} className="text-primary" />
              <div className="text-left">
                <p className="text-text-primary text-sm font-medium">
                  Import CSV
                </p>
                <p className="text-text-muted text-xs">
                  Import Splitwise CSV export
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
            Account
          </h2>
          <button
            onClick={handleLogout}
            className="bg-bg-card border-danger/20 hover:border-danger/40 flex w-full items-center gap-3 rounded-xl border p-3.5 transition-colors"
          >
            <LogOut size={18} className="text-danger" />
            <span className="text-danger text-sm font-medium">Sign Out</span>
          </button>
        </section>
      </div>

      {/* Add Member Modal */}
      <Modal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        title="Add Member"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Member name"
            className="bg-bg-input border-border text-text-primary placeholder:text-text-muted focus:border-primary w-full rounded-xl border px-4 py-3 text-sm focus:outline-none"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
          />
          <button
            onClick={handleAddMember}
            disabled={
              adding ||
              !newMemberName.trim() ||
              members.includes(newMemberName.trim())
            }
            className="bg-primary hover:bg-primary-dark w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </Modal>
    </Layout>
  );
}
