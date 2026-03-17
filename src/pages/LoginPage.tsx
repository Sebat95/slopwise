import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Receipt,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

export default function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="mb-2 flex items-center gap-3">
        <div className="bg-primary flex h-14 w-14 items-center justify-center rounded-2xl">
          <Receipt className="text-white" size={28} />
        </div>
      </div>
      <h1 className="text-text-primary mb-1 text-3xl font-bold">Slopwise</h1>
      <p className="text-text-secondary mb-8 max-w-xs text-center">
        Split expenses with friends. All data lives in your Google Sheets.
      </p>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => setShowSetup((s) => !s)}
          className="text-text-secondary hover:text-text-primary flex w-full items-center gap-2 text-sm transition-colors"
        >
          <Info size={14} />
          <span>Firebase Setup Instructions</span>
          {showSetup ? (
            <ChevronUp size={14} className="ml-auto" />
          ) : (
            <ChevronDown size={14} className="ml-auto" />
          )}
        </button>

        {showSetup && (
          <div className="bg-bg-card border-border text-text-secondary space-y-3 rounded-xl border p-4 text-sm">
            <p className="text-text-primary font-medium">
              Firebase configuration required:
            </p>
            <ol className="list-inside list-decimal space-y-2 text-xs">
              <li>
                Create a project in{' '}
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-0.5 hover:underline"
                >
                  Firebase Console <ExternalLink size={10} />
                </a>
              </li>
              <li>Go to <strong>Authentication</strong> &rarr; <strong>Sign-in method</strong></li>
              <li>Enable <strong>Google</strong> provider</li>
              <li>Add your app URL to <strong>Authorized domains</strong></li>
              <li>Go to <strong>Project Settings</strong> &rarr; <strong>General</strong></li>
              <li>Add a Web App and copy the <code>firebaseConfig</code></li>
              <li>
                Create a <code>.env</code> file based on <code>.env.example</code> and fill in the <code>VITE_FIREBASE_*</code> variables.
              </li>
              <li>
                In Google Cloud Console, ensure <strong>Google Sheets API</strong> and <strong>Google Drive API</strong> are enabled for this Firebase project.
              </li>
            </ol>
          </div>
        )}

        {error && (
          <div className="bg-danger/10 border-danger/30 text-danger rounded-xl border p-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={login}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-gray-800 shadow-lg transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <p className="text-text-muted text-center text-[11px]">
          Your data stays in your Google Sheets. This app only requests access
          to read and write spreadsheets.
        </p>
      </div>
    </div>
  );
}
