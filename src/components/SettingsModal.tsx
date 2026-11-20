import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  Palette,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import {
  ACCENT_PRESETS,
  AVATAR_COLORS,
  STATUS_EMOJIS,
} from '../data/seedData';
import {
  buildFullName,
  validateProfileInput,
  validateUsername,
} from '../utils/chatLogic';
import type {
  AppSettings,
  NotificationPopupStyle,
  PrivacyAudience,
  StickerPack,
  UserProfile,
} from '../types/telegram';
import type { AppUpdaterController } from '../hooks/useAppUpdater';

export type SettingsTabId =
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'storage'
  | 'stickers';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTabId;
  token: string | null;
  currentUser: UserProfile;
  settings: AppSettings;
  stickerPacks: StickerPack[];
  updater: AppUpdaterController;
  onClose: () => void;
  onSaveProfile: (params: {
    firstName: string;
    lastName: string;
    username: string;
    bio: string;
    phone: string;
    birthday: string;
    city: string;
    statusEmoji: string;
    avatarUrl?: string;
    avatarColor: string;
    profileAccent: string;
  }) => void;
  onChangeSettings: (next: AppSettings) => void;
  onOpenStickerStudio: () => void;
  onTestNotification: () => void;
  onLogout: () => void;
}

const TABS: Array<{ id: SettingsTabId; label: string; Icon: typeof User }> = [
  { id: 'profile', label: 'Мой профиль', Icon: User },
  { id: 'appearance', label: 'Оформление', Icon: Palette },
  { id: 'notifications', label: 'Уведомления', Icon: Bell },
  { id: 'privacy', label: 'Приватность', Icon: Lock },
  { id: 'storage', label: 'Файлы и память', Icon: HardDrive },
  { id: 'stickers', label: 'Стикерпаки', Icon: Sparkles },
];

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 py-2.5 px-3 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#1E2A38] transition-colors text-left cursor-pointer"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {label}
        </div>
        {description && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </div>
        )}
      </div>
      <span
        className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${
          checked ? 'bg-[var(--tg-accent)]' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function AudienceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (val: any) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 px-3">
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
      </span>
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0E1621]">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              value === opt.id
                ? 'bg-white dark:bg-[#232E3C] text-[var(--tg-accent)] shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  initialTab = 'profile',
  token,
  currentUser,
  settings,
  stickerPacks,
  updater,
  onClose,
  onSaveProfile,
  onChangeSettings,
  onOpenStickerStudio,
  onTestNotification,
  onLogout,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const [browserNotifPerm, setBrowserNotifPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported',
  );

  // Profile fields
  const [firstName, setFirstName] = useState(currentUser.firstName);
  const [lastName, setLastName] = useState(currentUser.lastName);
  const [username, setUsername] = useState(currentUser.username.replace(/^@/, ''));
  const [bio, setBio] = useState(currentUser.bio);
  const [phone, setPhone] = useState(currentUser.phone);
  const [birthday, setBirthday] = useState(currentUser.birthday);
  const [city, setCity] = useState(currentUser.city);
  const [statusEmoji, setStatusEmoji] = useState(currentUser.statusEmoji);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(currentUser.avatarUrl);
  const [avatarColor, setAvatarColor] = useState(currentUser.avatarColor);
  const [profileAccent, setProfileAccent] = useState(currentUser.profileAccent);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password change fields
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passMessage, setPassMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTab(initialTab);
      setFirstName(currentUser.firstName);
      setLastName(currentUser.lastName);
      setUsername(currentUser.username.replace(/^@/, ''));
      setBio(currentUser.bio);
      setPhone(currentUser.phone);
      setBirthday(currentUser.birthday);
      setCity(currentUser.city);
      setStatusEmoji(currentUser.statusEmoji);
      setAvatarUrl(currentUser.avatarUrl);
      setAvatarColor(currentUser.avatarColor);
      setProfileAccent(currentUser.profileAccent);
      setProfileError(null);
      setProfileSaved(false);
      setPassMessage(null);
      setCurPassword('');
      setNewPassword('');
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setBrowserNotifPerm(Notification.permission);
      }
    }
    wasOpenRef.current = open;
  }, [open, initialTab, currentUser]);

  // Live check if username changed
  useEffect(() => {
    if (!open || tab !== 'profile') return;
    const clean = username.trim().replace(/^@+/, '').toLowerCase();
    const original = currentUser.username.replace(/^@+/, '').toLowerCase();
    if (!clean || clean === original) {
      setUsernameAvailable(null);
      return;
    }
    const local = validateUsername(clean);
    if (!local.valid) {
      setUsernameAvailable(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(clean)}&excludeUserId=${encodeURIComponent(currentUser.id)}`,
        );
        const data = await res.json();
        if (!cancelled) setUsernameAvailable(Boolean(data.available));
      } catch {
        if (!cancelled) setUsernameAvailable(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, open, tab, currentUser.id, currentUser.username]);

  if (!open) return null;

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setAvatarUrl(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const check = validateProfileInput({
      firstName,
      lastName,
      username,
      bio,
    });
    if (!check.valid) {
      setProfileError(check.error ?? 'Проверьте поля профиля');
      return;
    }
    if (usernameAvailable === false) {
      setProfileError('Этот юзернейм уже занят');
      return;
    }

    onSaveProfile({
      firstName: check.normalizedFirstName,
      lastName: check.normalizedLastName,
      username: check.normalizedUsername,
      bio: bio.trim(),
      phone: phone.trim(),
      birthday: birthday.trim(),
      city: city.trim(),
      statusEmoji,
      avatarUrl,
      avatarColor,
      profileAccent,
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMessage(null);
    if (!token) return;
    if (newPassword.length < 6) {
      setPassMessage({
        ok: false,
        text: 'Новый пароль должен содержать минимум 6 символов',
      });
      return;
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: curPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPassMessage({ ok: false, text: data.error || 'Ошибка смены пароля' });
        return;
      }
      setCurPassword('');
      setNewPassword('');
      setPassMessage({ ok: true, text: 'Пароль успешно обновлён' });
    } catch {
      setPassMessage({ ok: false, text: 'Ошибка соединения с сервером' });
    }
  };

  const totalStickers = stickerPacks.reduce((acc, p) => acc + p.stickers.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-5">
      <button
        type="button"
        aria-label="Закрыть настройки"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] cursor-pointer"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tiligram-settings-title"
        className="relative z-10 w-full max-w-4xl h-[100dvh] sm:h-[86vh] sm:max-h-[740px] rounded-none sm:rounded-2xl bg-white dark:bg-[#17212B] shadow-2xl border-0 sm:border border-slate-200/80 dark:border-[#243242] flex flex-col overflow-hidden pt-safe pb-safe"
      >
        {/* Top Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between shrink-0">
          <h2
            id="tiligram-settings-title"
            className="font-display font-bold text-base text-slate-900 dark:text-slate-100"
          >
            Настройки Тилиграм
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки"
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Section Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Categories Sidebar */}
          <nav
            aria-label="Разделы настроек"
            className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-[#0E1621] p-2.5 bg-slate-50/70 dark:bg-[#131C26] flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto no-scrollbar"
          >
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--tg-accent)] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1E2A38]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}

            <div className="hidden md:block mt-auto pt-3 border-t border-slate-200/80 dark:border-[#243242]">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Выйти</span>
              </button>
            </div>
          </nav>

          {/* Content Panel */}
          <div className="flex-1 min-w-0 overflow-y-auto tg-scroll p-5 sm:p-6">
            {/* TAB 1: DETAILED PROFILE */}
            {tab === 'profile' && (
              <form onSubmit={handleSaveProfileSubmit} className="space-y-5 max-w-xl">
                {/* Profile Banner Preview */}
                <div
                  className="rounded-2xl p-4 flex items-center gap-4 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${profileAccent}, ${profileAccent}bb)`,
                  }}
                >
                  <div className="relative">
                    <Avatar
                      title={buildFullName(firstName || currentUser.firstName, lastName)}
                      avatarUrl={avatarUrl}
                      avatarColor={avatarColor}
                      size="xl"
                    />
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label="Загрузить фото профиля"
                      className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-slate-900/85 text-white flex items-center justify-center hover:bg-slate-900 cursor-pointer shadow"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-lg truncate">
                      {buildFullName(firstName || currentUser.firstName, lastName)}{' '}
                      {statusEmoji && <span>{statusEmoji}</span>}
                    </div>
                    <div className="text-xs text-white/85 truncate mt-0.5">
                      @{username || currentUser.username.replace(/^@/, '')}
                      {city ? ` · ${city}` : ''}
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold cursor-pointer"
                      >
                        Сменить фото
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl(undefined)}
                          className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Убрать</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Name & Surname */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="prof-first-name"
                      className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                    >
                      Имя *
                    </label>
                    <input
                      id="prof-first-name"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prof-last-name"
                      className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                    >
                      Фамилия (необязательно)
                    </label>
                    <input
                      id="prof-last-name"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Не указана"
                      className="w-full h-11 sm:h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label
                    htmlFor="prof-username"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Юзернейм (английский) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">
                      @
                    </span>
                    <input
                      id="prof-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/^@+/, ''))}
                      className="w-full h-11 sm:h-10 pl-8 pr-10 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                    {usernameAvailable === true && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                    {usernameAvailable === false && (
                      <XCircle className="w-4 h-4 text-rose-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="prof-bio"
                      className="text-xs font-semibold text-slate-600 dark:text-slate-300"
                    >
                      О себе
                    </label>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {bio.length}/140
                    </span>
                  </div>
                  <textarea
                    id="prof-bio"
                    rows={2}
                    maxLength={140}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Пара слов о вас, профессии или интересах..."
                    className="w-full p-3 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 resize-none border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                  />
                </div>

                {/* Birthday, City, Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="prof-birthday"
                      className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                    >
                      Дата рождения
                    </label>
                    <input
                      id="prof-birthday"
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full h-11 sm:h-10 px-3 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-city"
                      className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                    >
                      Город
                    </label>
                    <input
                      id="prof-city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Москва"
                      className="w-full h-11 sm:h-10 px-3 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="prof-phone"
                      className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                    >
                      Телефон
                    </label>
                    <input
                      id="prof-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+7 999 000-00-00"
                      className="w-full h-11 sm:h-10 px-3 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-base sm:text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Status Emoji */}
                <div>
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Эмодзи-статус возле имени
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_EMOJIS.map((em, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setStatusEmoji(em)}
                        className={`h-9 px-3 rounded-xl text-sm flex items-center justify-center cursor-pointer border ${
                          statusEmoji === em
                            ? 'border-[var(--tg-accent)] bg-[var(--tg-accent)]/15 text-slate-900 dark:text-white font-semibold'
                            : 'border-slate-200 dark:border-[#243242] text-slate-500'
                        }`}
                      >
                        {em || 'Нет'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Profile Accent & Avatar Color */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      Цвет шапки профиля
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setProfileAccent(hex)}
                          aria-label={`Цвет профиля ${hex}`}
                          className={`w-7 h-7 rounded-full cursor-pointer ${
                            profileAccent === hex
                              ? 'ring-2 ring-offset-2 ring-white dark:ring-offset-[#17212B]'
                              : ''
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      Цвет аватара (без фото)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setAvatarColor(hex)}
                          aria-label={`Цвет аватара ${hex}`}
                          className={`w-7 h-7 rounded-full cursor-pointer ${
                            avatarColor === hex
                              ? 'ring-2 ring-offset-2 ring-white dark:ring-offset-[#17212B]'
                              : ''
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {profileError && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-rose-500 bg-rose-500/10 px-3.5 py-2.5 rounded-xl"
                  >
                    {profileError}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[var(--tg-accent)] hover:opacity-95 text-white text-sm font-semibold cursor-pointer"
                  >
                    Сохранить профиль
                  </button>
                  {profileSaved && (
                    <span className="text-xs font-semibold text-emerald-400">
                      Изменения сохранены
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* TAB 2: APPEARANCE */}
            {tab === 'appearance' && (
              <div className="space-y-5 max-w-xl">
                <div className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Цветовая тема
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      По умолчанию в Тилиграм включена тёмная тема
                    </div>
                  </div>
                  <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0E1621]">
                    {(['dark', 'light'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onChangeSettings({ ...settings, theme: t })}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          settings.theme === t
                            ? 'bg-white dark:bg-[#232E3C] text-[var(--tg-accent)] shadow-2xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {t === 'dark' ? 'Тёмная' : 'Светлая'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2.5">
                    Акцентный цвет интерфейса
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() =>
                          onChangeSettings({ ...settings, accentColor: preset.hex })
                        }
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold cursor-pointer ${
                          settings.accentColor === preset.hex
                            ? 'border-[var(--tg-accent)] bg-[var(--tg-accent)]/12 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-[#243242] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="truncate">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Wallpaper */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                    Фон чатов
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'pattern', label: 'Узор' },
                        { id: 'minimal', label: 'Минимал' },
                        { id: 'graphite', label: 'Графит' },
                        { id: 'ocean', label: 'Океан' },
                      ] as const
                    ).map((wp) => (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => onChangeSettings({ ...settings, wallpaper: wp.id })}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          settings.wallpaper === wp.id
                            ? 'border-[var(--tg-accent)] bg-[var(--tg-accent)]/12 text-[var(--tg-accent)]'
                            : 'border-slate-200 dark:border-[#243242] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {wp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <AudienceSelect
                  label="Размер текста сообщений"
                  value={settings.fontSize}
                  options={[
                    { id: 'small', label: 'Мелкий' },
                    { id: 'normal', label: 'Обычный' },
                    { id: 'large', label: 'Крупный' },
                  ]}
                  onChange={(fontSize) => onChangeSettings({ ...settings, fontSize })}
                />

                {/* Bubble radius */}
                <AudienceSelect
                  label="Скругление сообщений"
                  value={settings.bubbleRadius}
                  options={[
                    { id: 'compact', label: 'Строгое' },
                    { id: 'standard', label: 'Обычное' },
                    { id: 'soft', label: 'Мягкое' },
                  ]}
                  onChange={(bubbleRadius) =>
                    onChangeSettings({ ...settings, bubbleRadius })
                  }
                />

                <div className="border-t border-slate-200/70 dark:border-[#243242] pt-2 space-y-1">
                  <ToggleRow
                    label="Отправлять по нажатию Enter"
                    description="Если выключено, отправка работает по Ctrl+Enter"
                    checked={settings.sendByEnter}
                    onChange={(sendByEnter) =>
                      onChangeSettings({ ...settings, sendByEnter })
                    }
                  />
                  <ToggleRow
                    label="Крупные эмодзи"
                    description="Увеличивать одиночные эмодзи в сообщениях"
                    checked={settings.largeEmoji}
                    onChange={(largeEmoji) =>
                      onChangeSettings({ ...settings, largeEmoji })
                    }
                  />
                </div>
              </div>
            )}

            {/* TAB 3: NOTIFICATIONS */}
            {tab === 'notifications' && (
              <div className="space-y-3 max-w-xl">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Всплывающие уведомления (как в Telegram)
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {updater.isElectron
                          ? 'Работают на уровне Windows / macOS / Linux поверх всех окон'
                          : 'Всплывающие окна в углу экрана + системные уведомления браузера (и в Electron-сборке)'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onTestNotification}
                      className="px-3.5 py-2 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-semibold hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Проверить окно
                    </button>
                  </div>

                  <ToggleRow
                    label="Показывать всплывающие окна"
                    description="Отображать карточку сообщения в правом нижнем углу с быстрым ответом"
                    checked={settings.notifications.desktopPopups !== false}
                    onChange={(desktopPopups) =>
                      onChangeSettings({
                        ...settings,
                        notifications: { ...settings.notifications, desktopPopups },
                      })
                    }
                  />

                  <AudienceSelect
                    label="Стиль десктопных уведомлений"
                    value={settings.notifications.popupStyle || 'telegram-popup'}
                    options={[
                      { id: 'telegram-popup', label: 'Окно Тилиграм' },
                      { id: 'native', label: 'Системные ОС' },
                    ]}
                    onChange={(popupStyle: NotificationPopupStyle) =>
                      onChangeSettings({
                        ...settings,
                        notifications: { ...settings.notifications, popupStyle },
                      })
                    }
                  />

                  {!updater.isElectron && browserNotifPerm !== 'granted' && browserNotifPerm !== 'unsupported' && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200/80 dark:border-[#243242]">
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {browserNotifPerm === 'denied'
                          ? 'Системные уведомления заблокированы в браузере'
                          : 'Разрешить системные уведомления рабочего стола'}
                      </span>
                      {browserNotifPerm !== 'denied' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const perm = await Notification.requestPermission();
                              setBrowserNotifPerm(perm);
                            } catch {
                              // ignore
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[var(--tg-accent)]/15 text-[var(--tg-accent)] text-xs font-semibold hover:bg-[var(--tg-accent)]/25 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Разрешить
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <ToggleRow
                  label="Личные чаты"
                  description="Уведомления о новых личных сообщениях"
                  checked={settings.notifications.privateChats}
                  onChange={(privateChats) =>
                    onChangeSettings({
                      ...settings,
                      notifications: { ...settings.notifications, privateChats },
                    })
                  }
                />
                <ToggleRow
                  label="Группы"
                  description="Оповещения из групповых чатов"
                  checked={settings.notifications.groups}
                  onChange={(groups) =>
                    onChangeSettings({
                      ...settings,
                      notifications: { ...settings.notifications, groups },
                    })
                  }
                />
                <ToggleRow
                  label="Каналы"
                  description="Уведомления о новых публикациях в каналах"
                  checked={settings.notifications.channels}
                  onChange={(channels) =>
                    onChangeSettings({
                      ...settings,
                      notifications: { ...settings.notifications, channels },
                    })
                  }
                />
                <div className="my-2 border-t border-slate-200/70 dark:border-[#243242]" />
                <ToggleRow
                  label="Звуки сообщений и звонков"
                  description="Воспроизводить мягкий звук при входящих сообщениях и рингтон при звонках"
                  checked={settings.notifications.soundEnabled}
                  onChange={(soundEnabled) =>
                    onChangeSettings({
                      ...settings,
                      notifications: { ...settings.notifications, soundEnabled },
                    })
                  }
                />
                <ToggleRow
                  label="Предпросмотр текста"
                  description="Показывать фрагмент сообщения в уведомлении"
                  checked={settings.notifications.showPreview}
                  onChange={(showPreview) =>
                    onChangeSettings({
                      ...settings,
                      notifications: { ...settings.notifications, showPreview },
                    })
                  }
                />
              </div>
            )}

            {/* TAB 4: PRIVACY & SECURITY */}
            {tab === 'privacy' && (
              <div className="space-y-5 max-w-xl">
                <div className="space-y-1">
                  <AudienceSelect
                    label="Последняя активность и статус «в сети»"
                    value={settings.privacy.lastSeen}
                    options={[
                      { id: 'everybody', label: 'Все' },
                      { id: 'contacts', label: 'Контакты' },
                      { id: 'nobody', label: 'Никто' },
                    ]}
                    onChange={(lastSeen: PrivacyAudience) =>
                      onChangeSettings({
                        ...settings,
                        privacy: { ...settings.privacy, lastSeen },
                      })
                    }
                  />
                  <AudienceSelect
                    label="Фотография профиля"
                    value={settings.privacy.profilePhoto}
                    options={[
                      { id: 'everybody', label: 'Все' },
                      { id: 'contacts', label: 'Контакты' },
                      { id: 'nobody', label: 'Никто' },
                    ]}
                    onChange={(profilePhoto: PrivacyAudience) =>
                      onChangeSettings({
                        ...settings,
                        privacy: { ...settings.privacy, profilePhoto },
                      })
                    }
                  />
                  <AudienceSelect
                    label="Дата рождения"
                    value={settings.privacy.birthday}
                    options={[
                      { id: 'everybody', label: 'Все' },
                      { id: 'contacts', label: 'Контакты' },
                      { id: 'nobody', label: 'Никто' },
                    ]}
                    onChange={(birthday: PrivacyAudience) =>
                      onChangeSettings({
                        ...settings,
                        privacy: { ...settings.privacy, birthday },
                      })
                    }
                  />
                  <AudienceSelect
                    label="Кто может приглашать в группы"
                    value={settings.privacy.groupInvites}
                    options={[
                      { id: 'everybody', label: 'Все' },
                      { id: 'contacts', label: 'Контакты' },
                    ]}
                    onChange={(groupInvites: 'everybody' | 'contacts') =>
                      onChangeSettings({
                        ...settings,
                        privacy: { ...settings.privacy, groupInvites },
                      })
                    }
                  />
                  <ToggleRow
                    label="Отчёты о прочтении (✓✓)"
                    description="Показывать собеседникам время прочтения сообщений"
                    checked={settings.privacy.readReceipts}
                    onChange={(readReceipts) =>
                      onChangeSettings({
                        ...settings,
                        privacy: { ...settings.privacy, readReceipts },
                      })
                    }
                  />
                </div>

                {/* Change Password */}
                <form
                  onSubmit={handleChangePassword}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] space-y-3"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Смена пароля аккаунта
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="password"
                      value={curPassword}
                      onChange={(e) => setCurPassword(e.target.value)}
                      placeholder="Текущий пароль"
                      aria-label="Текущий пароль"
                      className="h-10 px-3.5 rounded-xl bg-white dark:bg-[#17212B] text-sm text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#243242] focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Новый пароль (от 6 симв.)"
                      aria-label="Новый пароль"
                      className="h-10 px-3.5 rounded-xl bg-white dark:bg-[#17212B] text-sm text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#243242] focus:border-[var(--tg-accent)] focus:outline-none"
                    />
                  </div>
                  {passMessage && (
                    <p
                      className={`text-xs font-medium ${
                        passMessage.ok ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {passMessage.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
                  >
                    Обновить пароль
                  </button>
                </form>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-500 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Выйти из аккаунта {currentUser.username}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: STORAGE & FILE RETENTION */}
            {tab === 'storage' && (
              <div className="space-y-5 max-w-xl">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] space-y-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Политика хранения файлов на сервере Тилиграм
                  </div>
                  <div className="divide-y divide-slate-200/70 dark:divide-[#243242] text-sm">
                    <div className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-slate-600 dark:text-slate-300">
                        Файлы до 1 МБ
                      </span>
                      <span className="font-semibold text-emerald-500 tabular-nums">
                        Хранятся бессрочно
                      </span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-slate-600 dark:text-slate-300">
                        Файлы от 1 до 10 МБ
                      </span>
                      <span className="font-semibold text-amber-400 tabular-nums">
                        Доступны 5 дней
                      </span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-slate-600 dark:text-slate-300">
                        Крупные файлы 10+ МБ
                      </span>
                      <span className="font-semibold text-rose-400 tabular-nums">
                        Доступны 1 день (24 ч)
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    По истечении срока хранения сервер автоматически удаляет файл с диска. Максимальный размер одного загружаемого файла — 25 МБ.
                  </p>
                </div>

                <div className="space-y-1">
                  <ToggleRow
                    label="Автозагрузка фотографий"
                    description="Сразу отображать отправленные фотографии в ленте"
                    checked={settings.storage.autoDownloadPhotos}
                    onChange={(autoDownloadPhotos) =>
                      onChangeSettings({
                        ...settings,
                        storage: { ...settings.storage, autoDownloadPhotos },
                      })
                    }
                  />
                  <ToggleRow
                    label="Предпросмотр документов"
                    description="Показывать размер и оставшийся срок хранения у вложений"
                    checked={settings.storage.autoDownloadFiles}
                    onChange={(autoDownloadFiles) =>
                      onChangeSettings({
                        ...settings,
                        storage: { ...settings.storage, autoDownloadFiles },
                      })
                    }
                  />
                </div>

                {/* App Auto-Update Toggle & Manual Check */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Автообновление приложения
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        Версия v{updater.updateInfo.currentVersion} ·{' '}
                        {updater.isElectron ? 'Electron Desktop' : 'Web'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={updater.updateInfo.status === 'checking'}
                      onClick={() => void updater.checkForUpdates()}
                      className="px-3.5 py-2 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-semibold hover:opacity-95 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {updater.updateInfo.status === 'checking' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Проверить</span>
                    </button>
                  </div>

                  <ToggleRow
                    label="Автоматически проверять обновления"
                    description="Загружать новые релизы Тилиграм из привязанного репозитория GitHub"
                    checked={settings.updates?.autoCheck ?? true}
                    onChange={(autoCheck) =>
                      onChangeSettings({
                        ...settings,
                        updates: {
                          autoCheck,
                          githubRepo: settings.updates?.githubRepo ?? '',
                        },
                      })
                    }
                  />

                  {updater.updateInfo.status === 'up-to-date' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-xs font-medium text-emerald-500">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Установлена актуальная версия v{updater.updateInfo.currentVersion}</span>
                    </div>
                  )}

                  {updater.updateInfo.status === 'available' && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200/80 dark:border-[#243242]">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Доступна версия v{updater.updateInfo.latestVersion}
                      </div>
                      <button
                        type="button"
                        onClick={() => void updater.downloadUpdate()}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {updater.isElectron ? (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Скачать</span>
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Открыть релиз</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {updater.updateInfo.status === 'downloading' && (
                    <div className="space-y-1.5 px-1">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                        <span>Скачивание обновления...</span>
                        <span>{updater.updateInfo.percent ?? 0}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[#17212B] overflow-hidden">
                        <div
                          className="h-full bg-[var(--tg-accent)] transition-all"
                          style={{ width: `${updater.updateInfo.percent ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {updater.updateInfo.status === 'downloaded' && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                      <span className="text-xs font-semibold text-emerald-400">
                        Обновление v{updater.updateInfo.latestVersion} готово
                      </span>
                      <button
                        type="button"
                        onClick={() => void updater.installUpdate()}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Перезапустить
                      </button>
                    </div>
                  )}

                  {updater.updateInfo.status === 'error' && (
                    <div className="px-3 py-2 rounded-xl bg-rose-500/10 text-xs text-rose-400">
                      {updater.updateInfo.error || 'Не удалось проверить обновления'}
                    </div>
                  )}
                </div>

                {/* Mobile PWA Installation Card */}
                <PWAInstallButton variant="card" />
              </div>
            )}

            {/* TAB 6: STICKERS */}
            {tab === 'stickers' && (
              <div className="space-y-4 max-w-xl">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Конструктор стикерпаков
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      Доступно наборов: {stickerPacks.length} · Всего стикеров: {totalStickers}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenStickerStudio();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-semibold hover:opacity-95 shrink-0 cursor-pointer"
                  >
                    Открыть студию
                  </button>
                </div>

                <div className="space-y-2">
                  {stickerPacks.map((pack) => (
                    <div
                      key={pack.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200/80 dark:border-[#243242]"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {pack.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          @{pack.slug} · {pack.stickers.length} стикеров
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenStickerStudio();
                        }}
                        className="text-xs font-semibold text-[var(--tg-accent)] hover:underline cursor-pointer shrink-0"
                      >
                        Управлять
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
