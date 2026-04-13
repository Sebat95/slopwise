import { type ReactNode, useEffect } from 'react';

const PANEL_CLASS =
  'bg-bg-card border-border animate-in slide-in-from-bottom relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border duration-200 sm:max-w-md sm:rounded-2xl';

type ModalFrameProps = {
  open: boolean;
  onBackdropClick: () => void;
  zClass?: string;
  panelClassName?: string;
  children: ReactNode;
};

export default function ModalFrame({
  open,
  onBackdropClick,
  zClass = 'z-[100]',
  panelClassName,
  children
}: ModalFrameProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBackdropClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onBackdropClick]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-end justify-center sm:items-center`}
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onBackdropClick}
        aria-hidden
      />
      <div
        className={
          panelClassName ? `${PANEL_CLASS} ${panelClassName}` : PANEL_CLASS
        }
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
