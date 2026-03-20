import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function ReconnectBanner() {
  const { needsReconnect, isLoading, error, reconnect } = useAuth();

  if (!needsReconnect) return null;

  return (
    <div className="bg-warning/15 border-warning/30 fixed top-0 right-0 left-0 z-[90] border-b px-4 py-3 text-center">
      <div className="mx-auto flex max-w-lg items-center justify-center gap-3">
        <span className="text-text-primary text-sm">Session expired.</span>
        <button
          onClick={reconnect}
          disabled={isLoading}
          className="bg-primary hover:bg-primary-dark inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Reconnect
        </button>
      </div>
      {error && <p className="text-danger mt-1 text-xs">{error}</p>}
    </div>
  );
}
