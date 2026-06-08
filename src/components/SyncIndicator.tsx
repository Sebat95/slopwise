import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function SyncIndicator() {
  const { isLoading, isSyncing, error } = useApp();

  if (error) {
    return (
      <div className="text-danger flex items-center gap-1.5 text-xs">
        <CloudOff size={14} />
        <span>Sync error</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="text-warning flex items-center gap-1.5 text-xs">
        <Loader2 size={14} className="animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-text-muted flex items-center gap-1.5 text-xs">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="text-positive flex items-center gap-1.5 text-xs">
      <Cloud size={14} />
      <span>Synced</span>
    </div>
  );
}
