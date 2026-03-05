import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  Scale,
  Settings
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/expenses', label: 'Expenses', icon: Receipt },
  { path: '/add', label: 'Add', icon: PlusCircle },
  { path: '/balances', label: 'Balances', icon: Scale },
  { path: '/settings', label: 'Settings', icon: Settings }
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bg-bg-card border-border safe-bottom fixed right-0 bottom-0 left-0 z-50 border-t">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active =
            location.pathname === path ||
            (path === '/add' && location.pathname.startsWith('/add'));
          const isAdd = path === '/add';
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex h-full flex-1 flex-col items-center justify-center transition-colors ${
                isAdd
                  ? 'text-primary'
                  : active
                    ? 'text-primary'
                    : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={isAdd ? 28 : 22} strokeWidth={active ? 2.5 : 2} />
              <span
                className={`mt-0.5 text-[10px] ${active ? 'font-semibold' : ''}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
