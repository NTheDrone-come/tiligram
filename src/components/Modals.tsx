import { useEffect, useState } from 'react';
import { Loader2, Megaphone, Search, User, Users, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { AVATAR_COLORS } from '../data/seedData';
import { validateCreateChatInput } from '../utils/chatLogic';
import type {
  ChatMessage,
  ChatThread,
  ChatType,
  PublicUserSummary,
} from '../types/telegram';

interface CreateChatModalProps {
  open: boolean;
  defaultType: ChatType;
  onClose: () => void;
  onSearchUsers: (query: string) => Promise<PublicUserSummary[]>;
  onCreate: (params: {
    type: ChatType;
    title: string;
    bio?: string;
    username?: string;
    avatarColor: string;
    targetUserId?: string;
    memberNames?: string[];
  }) => void;
}

export function CreateChatModal({
  open,
  defaultType,
  onClose,
  onSearchUsers,
  onCreate,
}: CreateChatModalProps) {
  const [type, setType] = useState<ChatType>(
    defaultType === 'saved' ? 'private' : defaultType,
  );
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [membersText, setMembersText] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  // Real user search state for 'private' tab
  const [userSearch, setUserSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<PublicUserSummary[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType === 'saved' ? 'private' : defaultType);
      setTitle('');
      setUsername('');
      setBio('');
      setMembersText('');
      setUserSearch('');
      setError(null);
    }
  }, [open, defaultType]);

  useEffect(() => {
    if (!open || type !== 'private') return;
    let cancelled = false;
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      const users = await onSearchUsers(userSearch);
      if (!cancelled) {
        setFoundUsers(users);
        setSearchingUsers(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, type, userSearch, onSearchUsers]);

  if (!open) return null;

  const handleStartDirectChat = (u: PublicUserSummary) => {
    onCreate({
      type: 'private',
      title: u.name,
      username: u.username,
      bio: u.bio || undefined,
      avatarColor: u.avatarColor || AVATAR_COLORS[0],
      targetUserId: u.id,
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCreateChatInput({ title, type, username });
    if (!validation.valid) {
      setError(validation.error ?? 'Проверьте введённые данные');
      return;
    }

    const memberNames =
      type === 'group'
        ? membersText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    onCreate({
      type,
      title: validation.normalizedTitle,
      username: validation.normalizedUsername,
      bio: bio.trim() || undefined,
      avatarColor: color,
      memberNames,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть окно создания"
        onClick={onClose}
        className="fixed inset-0 bg-black/55 backdrop-blur-[1px] cursor-pointer"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-chat-title"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-[#17212B] shadow-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#0E1621] flex items-center justify-between">
          <h2
            id="create-chat-title"
            className="font-display font-bold text-base text-slate-900 dark:text-slate-100"
          >
            {type === 'group'
              ? 'Новая группа'
              : type === 'channel'
                ? 'Новый канал'
                : 'Найти пользователя'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Type Selector */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0E1621]">
            {(
              [
                { id: 'private', label: 'Люди', Icon: User },
                { id: 'group', label: 'Группа', Icon: Users },
                { id: 'channel', label: 'Канал', Icon: Megaphone },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setType(id);
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  type === id
                    ? 'bg-white dark:bg-[#232E3C] text-[#3390EC] dark:text-[#6AB3F3] shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {type === 'private' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск по @username или имени..."
                  aria-label="Поиск пользователей по юзернейму"
                  autoFocus
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none"
                />
              </div>

              <div className="max-h-72 overflow-y-auto tg-scroll space-y-1">
                {searchingUsers ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Поиск аккаунтов...</span>
                  </div>
                ) : foundUsers.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {userSearch
                        ? 'Пользователи не найдены'
                        : 'Пока нет других зарегистрированных аккаунтов'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Пригласите друзей зарегистрироваться в Тилиграме или создайте собственную группу или канал.
                    </p>
                  </div>
                ) : (
                  foundUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors text-left cursor-pointer"
                    >
                      <Avatar
                        title={u.name}
                        avatarUrl={u.avatarUrl}
                        avatarColor={u.avatarColor}
                        online={u.online}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <span className="truncate">{u.name}</span>
                          {u.statusEmoji && (
                            <span className="text-xs">{u.statusEmoji}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {u.username}
                          {u.bio ? ` · ${u.bio}` : ''}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="chat-title-input"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Название
                </label>
                <input
                  id="chat-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    type === 'group'
                      ? 'Например, Команда проекта'
                      : 'Например, Личный блог'
                  }
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="chat-username-input"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Публичная ссылка (необязательно)
                </label>
                <input
                  id="chat-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="@channel_name"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none"
                />
              </div>

              {type === 'group' && (
                <div>
                  <label
                    htmlFor="chat-members-input"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Пригласить участников (имена через запятую)
                  </label>
                  <input
                    id="chat-members-input"
                    type="text"
                    value={membersText}
                    onChange={(e) => setMembersText(e.target.value)}
                    placeholder="Например, @alex, @kate"
                    className="w-full h-10 px-3.5 rounded-xl bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="chat-bio-input"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Описание
                </label>
                <textarea
                  id="chat-bio-input"
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="О чём эта группа или канал..."
                  className="w-full p-3 rounded-xl bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Цвет аватара
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setColor(hex)}
                      aria-label={`Выбрать цвет ${hex}`}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                        color === hex
                          ? 'ring-2 ring-offset-2 ring-[#3390EC] dark:ring-offset-[#17212B] scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/35 px-3 py-2 rounded-xl"
                >
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--tg-accent)' }}
                >
                  Создать
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

interface ForwardModalProps {
  message: ChatMessage | null;
  chats: ChatThread[];
  onClose: () => void;
  onConfirmForward: (targetChatId: string, message: ChatMessage) => void;
}

export function ForwardModal({
  message,
  chats,
  onClose,
  onConfirmForward,
}: ForwardModalProps) {
  if (!message) return null;

  const availableChats = chats.filter((c) => c.canPost !== false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть пересылку"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px] cursor-pointer"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-title"
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white dark:bg-[#17212B] shadow-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#0E1621] flex items-center justify-between">
          <h2
            id="forward-title"
            className="font-display font-bold text-base text-slate-900 dark:text-slate-100"
          >
            Переслать сообщение
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto tg-scroll p-2 space-y-0.5">
          {availableChats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => {
                onConfirmForward(chat.id, message);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors text-left cursor-pointer"
            >
              <Avatar
                title={chat.title}
                avatarUrl={chat.avatarUrl}
                avatarColor={chat.avatarColor}
                type={chat.type}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {chat.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {chat.type === 'saved'
                    ? 'Сохранить в Избранное'
                    : chat.username || 'Личный чат'}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface LightboxProps {
  item: { url: string; caption?: string } | null;
  onClose: () => void;
}

export function PhotoLightbox({ item, onClose }: LightboxProps) {
  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фотографии"
      className="fixed inset-0 z-50 bg-black/88 backdrop-blur-xs flex flex-col items-center justify-center p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть просмотр фотографии"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
      >
        <X className="w-6 h-6" />
      </button>

      <img
        src={item.url}
        alt={item.caption || 'Фотография'}
        referrerPolicy="no-referrer"
        className="max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
      />

      {item.caption && (
        <p className="mt-4 text-sm text-white/90 text-center max-w-xl">
          {item.caption}
        </p>
      )}
    </div>
  );
}
