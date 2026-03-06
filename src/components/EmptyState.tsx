import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-text-muted mb-4">{icon}</div>
      <h3 className="text-text-primary mb-1 text-lg font-semibold">{title}</h3>
      <p className="text-text-secondary mb-6 max-w-xs text-sm">{description}</p>
      {action}
    </div>
  );
}
