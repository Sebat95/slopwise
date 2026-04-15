import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode
} from 'react';
import ModalFrame from '../components/ModalFrame';
import { X } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' uses destructive styling for the confirm action (e.g. delete). */
  variant?: 'default' | 'danger';
};

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setPending((p) => {
      if (p) {
        queueMicrotask(() => p.resolve(value));
      }
      return null;
    });
  }, []);

  const variant = pending?.variant ?? 'default';
  const confirmLabel = pending?.confirmLabel ?? 'OK';
  const cancelLabel = pending?.cancelLabel ?? 'Cancel';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ModalFrame open zClass="z-[110]" onBackdropClick={() => finish(false)}>
          <div className="border-border flex items-start justify-between gap-3 border-b p-4">
            <h2 className="text-text-primary pr-2 text-lg leading-tight font-semibold">
              {pending.title}
            </h2>
            <button
              type="button"
              onClick={() => finish(false)}
              className="text-text-muted hover:text-text-primary hover:bg-bg-surface shrink-0 rounded-lg p-1 transition-colors"
              aria-label={cancelLabel}
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4">
            <p className="text-text-secondary text-sm leading-relaxed">
              {pending.message}
            </p>
          </div>
          <div className="border-border flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => finish(false)}
              className="bg-bg-input border-border text-text-primary hover:border-primary/40 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors sm:min-w-[100px]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => finish(true)}
              className={
                variant === 'danger'
                  ? 'bg-danger hover:bg-danger/90 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors sm:min-w-[100px]'
                  : 'bg-primary hover:bg-primary-dark rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors sm:min-w-[100px]'
              }
            >
              {confirmLabel}
            </button>
          </div>
        </ModalFrame>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
