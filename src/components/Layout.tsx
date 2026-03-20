import { type ReactNode } from 'react';
import BottomNav from './BottomNav';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export default function Layout({ children, showNav = true }: LayoutProps) {
  const { needsReconnect } = useAuth();
  return (
    <div className="bg-bg-dark flex h-full flex-col">
      <main
        className={`flex-1 overflow-y-auto pb-20 ${needsReconnect ? 'pt-12' : ''}`}
      >
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}
