import { type ReactNode } from 'react';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export default function Layout({ children, showNav = true }: LayoutProps) {
  return (
    <div className="bg-bg-dark flex h-full flex-col">
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      {showNav && <BottomNav />}
    </div>
  );
}
