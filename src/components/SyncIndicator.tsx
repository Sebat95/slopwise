import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function SyncIndicator() {
  const { isSyncing, error } = useApp();

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-danger text-xs">
        <CloudOff size={14} />
        <span>Sync error</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 text-warning text-xs">
        <Loader2 size={14} className="animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-positive text-xs">
      <Cloud size={14} />
      <span>Synced</span>
    </div>
  );
}
