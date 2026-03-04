import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className="animate-spin text-primary" size={32} />
      {text && <p className="text-text-secondary text-sm">{text}</p>}
    </div>
  );
}
