import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, PlusCircle, Scale, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/expenses', label: 'Expenses', icon: Receipt },
  { path: '/add', label: 'Add', icon: PlusCircle },
  { path: '/balances', label: 'Balances', icon: Scale },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border z-50 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path || (path === '/add' && location.pathname.startsWith('/add'));
          const isAdd = path === '/add';
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isAdd
                  ? 'text-primary'
                  : active
                    ? 'text-primary'
                    : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={isAdd ? 28 : 22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] mt-0.5 ${active ? 'font-semibold' : ''}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
