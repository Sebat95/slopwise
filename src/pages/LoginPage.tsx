import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Receipt, ExternalLink, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';

export default function LoginPage() {
  const { clientId, setClientId, login, isLoading, error } = useAuth();
  const [showSetup, setShowSetup] = useState(!clientId);

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
          <Receipt className="text-white" size={28} />
        </div>
      </div>
      <h1 className="text-3xl font-bold text-text-primary mb-1">SplitSheet</h1>
      <p className="text-text-secondary text-center mb-8 max-w-xs">
        Split expenses with friends. All data lives in your Google Sheets.
      </p>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => setShowSetup((s) => !s)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors w-full"
        >
          <Info size={14} />
          <span>Setup Instructions</span>
          {showSetup ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
        </button>

        {showSetup && (
          <div className="bg-bg-card border border-border rounded-xl p-4 text-sm text-text-secondary space-y-3">
            <p className="font-medium text-text-primary">First-time setup:</p>
            <ol className="list-decimal list-inside space-y-2 text-xs">
              <li>
                Go to{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  Google Cloud Console <ExternalLink size={10} />
                </a>
              </li>
              <li>Create a project (or select existing)</li>
              <li>Enable <strong>Google Sheets API</strong> and <strong>Google Drive API</strong></li>
              <li>Go to <strong>Credentials</strong> &rarr; <strong>Create OAuth Client ID</strong></li>
              <li>Application type: <strong>Web application</strong></li>
              <li>
                Add your app URL to <strong>Authorized JavaScript origins</strong>
                <br />
                <code className="text-primary bg-bg-surface px-1 py-0.5 rounded text-[11px]">
                  {window.location.origin}
                </code>
              </li>
              <li>Copy the <strong>Client ID</strong> and paste below</li>
              <li>Configure the <strong>OAuth consent screen</strong> (add test users if in testing mode)</li>
            </ol>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Google OAuth Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          onClick={login}
          disabled={isLoading || !clientId}
          className="w-full bg-white text-gray-800 rounded-xl px-4 py-3.5 font-semibold text-sm flex items-center justify-center gap-3 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <p className="text-[11px] text-text-muted text-center">
          Your data stays in your Google Sheets. This app only requests access to read and write spreadsheets.
        </p>
      </div>
    </div>
  );
}
