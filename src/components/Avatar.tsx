import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { getInitials } from '../utils/chatLogic';
import type { ChatType } from '../types/telegram';

interface AvatarProps {
  title: string;
  avatarUrl?: string;
  avatarColor: string;
  type?: ChatType;
  online?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

export function Avatar({
  title,
  avatarUrl,
  avatarColor,
  type = 'private',
  online = false,
  size = 'md',
  active = false,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sizeCls = SIZE_CLASSES[size];

  return (
    <div className={`relative shrink-0 ${sizeCls}`}>
      {type === 'saved' ? (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center text-white shadow-xs ${
            active ? 'bg-white/25' : 'bg-[#3390EC]'
          }`}
        >
          <Bookmark
            className={size === 'xl' ? 'w-9 h-9' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
            fill="currentColor"
          />
        </div>
      ) : avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover bg-slate-200 dark:bg-slate-700"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-display font-semibold text-white select-none"
          style={{
            background: `linear-gradient(145deg, ${avatarColor}, ${avatarColor}cc)`,
          }}
        >
          {getInitials(title)}
        </div>
      )}

      {online && type === 'private' && (
        <span
          aria-label="В сети"
          className={`absolute bottom-0 right-0 rounded-full bg-[#4FAE4E] border-2 ${
            size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
          } ${
            active
              ? 'border-[#3390EC] dark:border-[#2B5278]'
              : 'border-white dark:border-[#17212B]'
          }`}
        />
      )}
    </div>
  );
}
