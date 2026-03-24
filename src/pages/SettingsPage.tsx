import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { exportToCSV, downloadCSV } from '../utils/csv';
import {
  LogOut,
  UserPlus,
  Download,
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
    loadData,
    disconnect,
    isLoading
  } = useApp();

  useEffect(() => {
    if (members.length === 0 && !isLoading) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [adding, setAdding] = useState(false);
  const [linkingMember, setLinkingMember] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(
    null
  );

  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState('');

  const startEditMember = (name: string) => {
    setEditingMember(name);
    setMemberDraft(name);
  };

  const confirmRenameMember = async () => {
    if (!editingMember) return;
    const trimmed = memberDraft.trim();
    if (!trimmed || trimmed === editingMember) {
      setEditingMember(null);
      setMemberActionError(null);
      return;
    }

    setMemberActionError(null);
    try {
      await renameMember(editingMember, trimmed);
      setEditingMember(null);
    } catch (err) {
      setMemberActionError(
        err instanceof Error ? err.message : 'Failed to rename member'
      );
    }
  };

  const cancelEditMember = () => {
    setEditingMember(null);
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;
    if (members.includes(name)) return;

    setAdding(true);
    setMemberActionError(null);
    try {
      await addMember(name);
      setShowAddMember(false);
      setNewMemberName('');
    } catch (err) {
      setMemberActionError(
        err instanceof Error ? err.message : 'Failed to add member'
      );
    } finally {
      setAdding(false);
    }
  };

  const handleLinkMember = async (memberName: string) => {
    setLinkingMember(memberName);
    setMemberActionError(null);
    try {
      await linkMemberToGoogle(memberName);
    } catch (err) {
      setMemberActionError(
        err instanceof Error ? err.message : 'Failed to link profile'
      );
    } finally {
      setLinkingMember(null);
    }
  };

  const handleExport = () => {
    const csv = exportToCSV(expenses, members);
    const filename = `${spreadsheetName || 'expenses'}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  const handleLogout = async () => {
    if (
      window.confirm(
        'Sign out? You will need to sign in again to access your sheets.'
      )
    ) {
      await logout();
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
          {memberActionError && (
            <p className="text-danger bg-danger/10 mb-3 rounded-xl p-3 text-sm">
              {memberActionError}
            </p>
          )}
          <div className="bg-bg-card border-border/50 divide-border/30 divide-y rounded-xl border">
            {members.length === 0 && isLoading && (
              <div className="text-text-muted p-4 text-center text-sm">
                Loading members...
              </div>
            )}
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
                      onClick={() => void handleLinkMember(m)}
                      disabled={linkingMember === m}
                      className={`shrink-0 rounded-lg p-1.5 text-xs transition-colors ${
                        profile?.email
                          ? 'text-positive hover:bg-positive/10'
                          : 'text-text-muted hover:text-primary hover:bg-primary/10'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      title={
                        linkingMember === m
                          ? 'Linking profile...'
                          : profile?.email
                            ? `Linked to ${profile.email}`
                            : 'Link your Google account'
                      }
                    >
                      {linkingMember === m ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Link size={14} />
                      )}
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
                Preserves Slopwise payer and split metadata
              </p>
            </div>
          </button>
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
          {memberActionError && (
            <p className="text-danger bg-danger/10 rounded-xl p-3 text-sm">
              {memberActionError}
            </p>
          )}
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
