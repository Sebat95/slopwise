import { getInitials, getAvatarColor } from '../utils/format';
import { useApp } from '../contexts/AppContext';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg'
};

export default function Avatar({ name, size = 'md' }: AvatarProps) {
  const { memberProfiles } = useApp();
  const profile = memberProfiles[name];
  const photoUrl = profile?.photoUrl;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }

  const color = getAvatarColor(name);
  return (
    <div
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  );
}
