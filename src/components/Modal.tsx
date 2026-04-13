import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import ModalFrame from './ModalFrame';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: Props) {
  return (
    <ModalFrame open={open} onBackdropClick={onClose}>
      <div className="border-border flex items-center justify-between border-b p-4">
        <h2 className="text-text-primary text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-lg p-1 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </ModalFrame>
  );
}
