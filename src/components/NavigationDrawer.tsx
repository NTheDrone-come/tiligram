import {
  Archive,
  Bookmark,
  LogOut,
  Megaphone,
  Moon,
  Settings,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import type { AppSettings, ChatType, UserProfile } from '../types/telegram';
import type { SettingsTabId } from './SettingsModal';

interface NavigationDrawerProps {
  open: boolean;
  currentUser: UserProfile;
  settings: AppSettings;
  archivedCount: number;
  onClose: () => void;
  onToggleTheme: () => void;
  onOpenSaved: () => void;
  onOpenArchive: () => void;
  onOpenCreate: (defaultType: ChatType) => void;
  onOpenSettings: (tab?: SettingsTabId) => void;
  onOpenStickerStudio: () => void;
  onLogout: () => void;
}

export function NavigationDrawer({
  open,
  currentUser,
  settings,
  archivedCount,
  onClose,
  onToggleTheme,
  onOpenSaved,
  onOpenArchive,
  onOpenCreate,
  onOpenSettings,
  onOpenStickerStudio,
  onLogout,
}: NavigationDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px] cursor-pointer"
      />

      {/* Slide-out Panel */}
      <nav
        aria-label="Главное меню Тилиграм"
        className="relative z-10 w-[300px] max-w-[85vw] h-full bg-white dark:bg-[#17212B] shadow-2xl flex flex-col"
      >
        {/* User Header */}
        <div
          className="px-5 pt-5 pb-4 text-white"
          style={{
            background: `linear-gradient(135deg, ${currentUser.profileAccent || '#3390EC'} 0%, #162436 100%)`,
          }}
        >
          <div className="flex items-start justify-between">
            <button
              type="button"
              onClick={() => {
                onOpenSettings('profile');
                onClose();
              }}
              aria-label="Редактировать профиль"
              className="rounded-full ring-2 ring-white/25 hover:ring-white/60 transition-all cursor-pointer"
            >
              <Avatar
                title={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                avatarColor={currentUser.avatarColor || '#3390EC'}
                size="lg"
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть боковое меню"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:bg-white/15 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3.5">
            <div className="font-display font-bold text-[16px] leading-snug truncate flex items-center gap-1.5">
              <span className="truncate">{currentUser.name}</span>
              {currentUser.statusEmoji && (
                <span className="text-base shrink-0">{currentUser.statusEmoji}</span>
              )}
            </div>
            <div className="text-[13px] text-white/85 mt-0.5 truncate">
              {currentUser.username}
              {currentUser.city ? ` · ${currentUser.city}` : ''}
            </div>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onOpenSettings('profile');
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Мой профиль</span>
          </button>

          <div className="my-1.5 border-t border-slate-100 dark:border-[#0E1621]" />

          <button
            type="button"
            onClick={() => {
              onOpenCreate('private');
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <UserPlus className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Найти пользователя</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenCreate('group');
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Создать группу</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenCreate('channel');
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Megaphone className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Создать канал</span>
          </button>

          <div className="my-1.5 border-t border-slate-100 dark:border-[#0E1621]" />

          <button
            type="button"
            onClick={() => {
              onOpenSaved();
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Bookmark className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Избранное</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenStickerStudio();
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Стикерпаки</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenArchive();
              onClose();
            }}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3.5">
              <Archive className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span>Архив</span>
            </span>
            {archivedCount > 0 && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {archivedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenSettings('profile');
              onClose();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Settings className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span>Настройки</span>
          </button>

          <div className="my-1.5 border-t border-slate-100 dark:border-[#0E1621]" />

          <button
            type="button"
            onClick={onToggleTheme}
            role="switch"
            aria-checked={settings.theme === 'dark'}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3.5">
              {settings.theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-500" />
              )}
              <span>Ночной режим</span>
            </span>
            <span
              className="w-10 h-5 rounded-full relative transition-colors"
              style={{
                backgroundColor:
                  settings.theme === 'dark' ? 'var(--tg-accent)' : '#CBD5E1',
              }}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                  settings.theme === 'dark' ? 'left-5' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14.5px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            <span>Выйти из аккаунта</span>
          </button>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-[#0E1621] text-xs text-slate-400 dark:text-slate-500">
          Тилиграм Web
        </div>
      </nav>
    </div>
  );
}
