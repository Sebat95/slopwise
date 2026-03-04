import { getInitials, getAvatarColor } from '../utils/format';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
};

export default function Avatar({ name, size = 'md' }: AvatarProps) {
  const color = getAvatarColor(name);
  return (
    <div
      className={`${SIZES[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  );
}
