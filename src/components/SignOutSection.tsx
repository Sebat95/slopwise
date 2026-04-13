import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';

type SignOutSectionProps = {
  /** Extra classes on the wrapping `<section>` (e.g. `mt-8`). */
  className?: string;
};

export default function SignOutSection({ className }: SignOutSectionProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { logout } = useAuth();

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access your spreadsheets.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });
    if (ok) {
      await logout();
      navigate('/');
    }
  };

  return (
    <section className={className}>
      <h2 className="text-text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
        Account
      </h2>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="bg-bg-card border-danger/20 hover:border-danger/40 flex w-full items-center gap-3 rounded-xl border p-3.5 transition-colors"
      >
        <LogOut size={18} className="text-danger" />
        <span className="text-danger text-sm font-medium">Sign Out</span>
      </button>
    </section>
  );
}
