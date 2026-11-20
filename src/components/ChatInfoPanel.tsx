import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  AtSign,
  BadgeCheck,
  Bell,
  BellOff,
  Cake,
  Calendar,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  computeChatProfileStats,
  extractSharedItems,
  findCommonGroups,
  formatBirthdayWithAge,
  formatChatListTime,
  formatDuration,
  formatLastSeen,
  formatMemberSince,
} from '../utils/chatLogic';
import type {
  CallMode,
  ChatMember,
  ChatMessage,
  ChatThread,
  UserProfile,
} from '../types/telegram';

interface ChatInfoPanelProps {
  chat: ChatThread | null;
  allChats: ChatThread[];
  messages: ChatMessage[];
  currentUser: UserProfile;
  onClose: () => void;
  onToggleMute: (chatId: string, muted: boolean) => void;
  onOpenLightbox: (url: string, caption?: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onStartCall?: (chatId: string, mode: CallMode) => void;
  onSelectChat?: (chatId: string) => void;
  onOpenDirectChatWithMember?: (member: ChatMember) => void;
  onOpenEditProfile?: () => void;
}

type InspectorTab =
  | 'members'
  | 'groups'
  | 'media'
  | 'files'
  | 'voice'
  | 'links';

export function ChatInfoPanel({
  chat,
  allChats,
  messages,
  currentUser,
  onClose,
  onToggleMute,
  onOpenLightbox,
  onJumpToMessage,
  onStartCall,
  onSelectChat,
  onOpenDirectChatWithMember,
  onOpenEditProfile,
}: ChatInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('media');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inspectedMember, setInspectedMember] = useState<ChatMember | null>(null);

  const shared = useMemo(() => extractSharedItems(messages), [messages]);
  const stats = useMemo(
    () => computeChatProfileStats(messages, currentUser.id),
    [messages, currentUser.id],
  );
  const commonGroups = useMemo(
    () =>
      chat?.type === 'private'
        ? findCommonGroups(allChats, chat.peerUserId)
        : [],
    [allChats, chat?.type, chat?.peerUserId],
  );

  if (!chat) return null;

  const isSaved = chat.type === 'saved';
  const profileAccent =
    (isSaved ? currentUser.profileAccent : chat.profileAccent) ||
    chat.avatarColor ||
    '#3390EC';
  const displayUsername = isSaved ? currentUser.username : chat.username;
  const displayBio = isSaved ? currentUser.bio || chat.bio : chat.bio;
  const displayPhone = isSaved ? currentUser.phone : chat.phone;
  const displayCity = isSaved ? currentUser.city : chat.city;
  const displayBirthday = formatBirthdayWithAge(
    isSaved ? currentUser.birthday : chat.birthday,
  );
  const displayStatusEmoji = isSaved
    ? currentUser.statusEmoji
    : chat.statusEmoji;
  const displayAvatarUrl = isSaved ? currentUser.avatarUrl : chat.avatarUrl;
  const memberSince = formatMemberSince(
    isSaved ? currentUser.createdAt : chat.createdAt,
  );
  const firstMessageDate = formatMemberSince(stats.firstMessageAt);

  const hasMembers = chat.type === 'group' && (chat.members?.length ?? 0) > 0;
  const hasCommonGroups = chat.type === 'private' && commonGroups.length > 0;

  const tabs: Array<{ id: InspectorTab; label: string; count: number }> = [
    ...(hasMembers
      ? [
          {
            id: 'members' as const,
            label: 'Участники',
            count: chat.members?.length ?? 0,
          },
        ]
      : []),
    ...(hasCommonGroups
      ? [
          {
            id: 'groups' as const,
            label: 'Группы',
            count: commonGroups.length,
          },
        ]
      : []),
    { id: 'media', label: 'Медиа', count: shared.media.length },
    { id: 'files', label: 'Файлы', count: shared.files.length },
    { id: 'voice', label: 'Голосовые', count: shared.voice.length },
    { id: 'links', label: 'Ссылки', count: shared.links.length },
  ];

  const effectiveTab = tabs.some((t) => t.id === activeTab)
    ? activeTab
    : tabs[0].id;

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const onlineMembersCount =
    chat.type === 'group'
      ? chat.members?.filter((m) => m.online).length ?? 0
      : 0;

  const statusText =
    chat.type === 'channel'
      ? `${(chat.memberCount ?? 1).toLocaleString('ru-RU')} подписчиков`
      : chat.type === 'group'
        ? `${chat.memberCount ?? chat.members?.length ?? 1} участников · ${onlineMembersCount} в сети`
        : isSaved
          ? `${currentUser.name} · личное облако`
          : chat.online
            ? 'в сети'
            : chat.lastSeenAt
              ? formatLastSeen(chat.lastSeenAt, false)
              : chat.lastSeenText || 'был(а) недавно';

  // Nested member profile view inside group inspector
  if (inspectedMember) {
    const memBirthday = formatBirthdayWithAge(inspectedMember.birthday);
    const memSince = formatMemberSince(inspectedMember.createdAt);
    const memAccent =
      inspectedMember.profileAccent || inspectedMember.avatarColor || '#3390EC';
    const isSelfMember = inspectedMember.id === currentUser.id;

    return (
      <aside
        aria-label={`Профиль участника ${inspectedMember.name}`}
        className="fixed inset-0 z-40 w-full sm:inset-y-0 sm:left-auto sm:max-w-[376px] lg:static lg:w-[348px] shrink-0 bg-white dark:bg-[#17212B] border-l border-slate-200/90 dark:border-[#0E1621] flex flex-col h-full shadow-2xl lg:shadow-none pt-safe pb-safe"
      >
        <div className="h-[58px] px-3 sm:px-4 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setInspectedMember(null)}
              aria-label="Назад к списку участников"
              className="min-w-[44px] min-h-[44px] -ml-1 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-display font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
              Профиль участника
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель информации"
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto tg-scroll">
          <div
            className="px-5 pt-7 pb-6 flex flex-col items-center text-center text-white relative"
            style={{
              background: `linear-gradient(155deg, ${memAccent} 0%, #142233 100%)`,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (inspectedMember.avatarUrl) {
                  onOpenLightbox(inspectedMember.avatarUrl, inspectedMember.name);
                }
              }}
              aria-label={`Аватар ${inspectedMember.name}`}
              className={inspectedMember.avatarUrl ? 'cursor-zoom-in' : 'cursor-default'}
            >
              <Avatar
                title={inspectedMember.name}
                avatarUrl={inspectedMember.avatarUrl}
                avatarColor={inspectedMember.avatarColor}
                online={inspectedMember.online}
                size="xl"
              />
            </button>
            <div className="mt-3.5 flex items-center gap-1.5">
              <h3 className="font-display font-bold text-[18px] text-white">
                {inspectedMember.name}
              </h3>
              {inspectedMember.statusEmoji && (
                <span className="text-lg">{inspectedMember.statusEmoji}</span>
              )}
            </div>
            <p className="text-[13px] text-white/85 mt-0.5">
              {inspectedMember.online
                ? 'в сети'
                : inspectedMember.lastSeenAt
                  ? formatLastSeen(inspectedMember.lastSeenAt, false)
                  : inspectedMember.lastSeenText || 'был(а) недавно'}
            </p>
          </div>

          {!isSelfMember && onOpenDirectChatWithMember && (
            <div className="p-4 border-b border-slate-100 dark:border-[#0E1621]">
              <button
                type="button"
                onClick={() => {
                  onOpenDirectChatWithMember(inspectedMember);
                  setInspectedMember(null);
                }}
                className="w-full min-h-[44px] rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: 'var(--tg-accent)' }}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Написать сообщение</span>
              </button>
            </div>
          )}

          <div className="px-4 py-3 space-y-2">
            {inspectedMember.username && (
              <button
                type="button"
                onClick={() => void handleCopy('mem-user', inspectedMember.username)}
                className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202B36] text-left cursor-pointer"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <AtSign className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {inspectedMember.username}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Имя пользователя
                    </div>
                  </div>
                </div>
                {copiedKey === 'mem-user' ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </button>
            )}

            {inspectedMember.phone && (
              <div className="flex items-start gap-3 px-2.5 py-2">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {inspectedMember.phone}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Телефон
                  </div>
                </div>
              </div>
            )}

            {inspectedMember.city && (
              <div className="flex items-start gap-3 px-2.5 py-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {inspectedMember.city}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Город
                  </div>
                </div>
              </div>
            )}

            {memBirthday && (
              <div className="flex items-start gap-3 px-2.5 py-2">
                <Cake className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {memBirthday}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    День рождения
                  </div>
                </div>
              </div>
            )}

            {inspectedMember.bio && (
              <div className="flex items-start gap-3 px-2.5 py-2">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13.5px] text-slate-800 dark:text-slate-200 leading-relaxed">
                    {inspectedMember.bio}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    О себе
                  </div>
                </div>
              </div>
            )}

            {memSince && (
              <div className="flex items-start gap-3 px-2.5 py-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {memSince}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    В Тилиграме с
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  const handleJump = (messageId: string) => {
    onJumpToMessage(messageId);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <aside
      aria-label="Информация о чате"
      className="fixed inset-0 z-40 w-full sm:inset-y-0 sm:left-auto sm:max-w-[376px] lg:static lg:w-[348px] shrink-0 bg-white dark:bg-[#17212B] border-l border-slate-200/90 dark:border-[#0E1621] flex flex-col h-full shadow-2xl lg:shadow-none pt-safe pb-safe"
    >
      {/* Header */}
      <div className="h-[58px] px-3 sm:px-4 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Назад к чату"
            className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-display font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
            {chat.type === 'group'
              ? 'Информация о группе'
              : chat.type === 'channel'
                ? 'Информация о канале'
                : isSaved
                  ? 'Мой профиль'
                  : 'Профиль'}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель информации"
          className="hidden lg:flex min-w-[40px] min-h-[40px] rounded-full items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto tg-scroll">
        {/* Accent Profile Cover & Identity Summary */}
        <div
          className="px-5 pt-6 pb-5 flex flex-col items-center text-center text-white relative overflow-hidden"
          style={{
            background: `linear-gradient(155deg, ${profileAccent} 0%, #142233 100%)`,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (displayAvatarUrl) {
                onOpenLightbox(displayAvatarUrl, chat.title);
              }
            }}
            aria-label={`Фото профиля ${chat.title}`}
            className={`rounded-full ring-2 ring-white/30 ${
              displayAvatarUrl ? 'cursor-zoom-in' : 'cursor-default'
            }`}
          >
            <Avatar
              title={chat.title}
              avatarUrl={displayAvatarUrl}
              avatarColor={chat.avatarColor}
              type={chat.type}
              online={Boolean(chat.online)}
              size="xl"
            />
          </button>

          <div className="mt-3.5 flex items-center justify-center gap-1.5 max-w-full">
            <h3 className="font-display font-bold text-[18px] text-white truncate">
              {chat.title}
            </h3>
            {displayStatusEmoji && (
              <span className="text-lg shrink-0" aria-label="Статус">
                {displayStatusEmoji}
              </span>
            )}
            {chat.verified && (
              <BadgeCheck className="w-4 h-4 text-[#7CC4FF] shrink-0" />
            )}
          </div>

          <p className="text-[13px] text-white/85 mt-0.5">{statusText}</p>

          {/* Quick Actions Bar */}
          <div className="mt-4 w-full grid grid-cols-3 gap-2">
            {(chat.type === 'private' || chat.type === 'group') && onStartCall && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onStartCall(chat.id, 'audio');
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className="min-h-[44px] py-2 px-2 rounded-xl bg-white/14 hover:bg-white/22 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  <span>Звонок</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartCall(chat.id, 'video');
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className="min-h-[44px] py-2 px-2 rounded-xl bg-white/14 hover:bg-white/22 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Видео</span>
                </button>
              </>
            )}

            {isSaved && onOpenEditProfile && (
              <button
                type="button"
                onClick={() => {
                  onOpenEditProfile();
                  if (window.innerWidth < 1024) onClose();
                }}
                className="col-span-2 min-h-[44px] py-2 px-3 rounded-xl bg-white/16 hover:bg-white/24 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Редактировать профиль</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleMute(chat.id, !chat.muted)}
              aria-pressed={!chat.muted}
              className={`${
                chat.type === 'channel' ? 'col-span-3' : ''
              } min-h-[44px] py-2 px-2 rounded-xl bg-white/14 hover:bg-white/22 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer`}
            >
              {chat.muted ? (
                <BellOff className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              <span>{chat.muted ? 'Без звука' : 'Звук вкл.'}</span>
            </button>
          </div>
        </div>

        {/* Rich Profile Information Fields */}
        <div className="px-4 py-3 space-y-1 border-b border-slate-100 dark:border-[#0E1621]">
          {displayUsername && (
            <button
              type="button"
              onClick={() => void handleCopy('username', displayUsername)}
              aria-label={`Скопировать ${displayUsername}`}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-start gap-3 min-w-0">
                <AtSign className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {displayUsername}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {copiedKey === 'username'
                      ? 'Скопировано в буфер'
                      : `Имя пользователя · tili.app/${displayUsername.replace(/^@/, '')}`}
                  </div>
                </div>
              </div>
              {copiedKey === 'username' ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>
          )}

          {displayPhone && (
            <button
              type="button"
              onClick={() => void handleCopy('phone', displayPhone)}
              aria-label={`Скопировать телефон ${displayPhone}`}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums truncate">
                    {displayPhone}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {copiedKey === 'phone' ? 'Номер скопирован' : 'Телефон'}
                  </div>
                </div>
              </div>
              {copiedKey === 'phone' ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>
          )}

          {displayCity && (
            <div className="flex items-start gap-3 px-2.5 py-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {displayCity}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Город
                </div>
              </div>
            </div>
          )}

          {displayBirthday && (
            <div className="flex items-start gap-3 px-2.5 py-2">
              <Cake className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {displayBirthday}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  День рождения
                </div>
              </div>
            </div>
          )}

          {displayBio && (
            <div className="flex items-start gap-3 px-2.5 py-2">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[13.5px] text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                  {displayBio}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {chat.type === 'group' || chat.type === 'channel'
                    ? 'Описание'
                    : 'О себе'}
                </div>
              </div>
            </div>
          )}

          {memberSince && (
            <div className="flex items-start gap-3 px-2.5 py-2">
              <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {memberSince}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  В Тилиграме с
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onToggleMute(chat.id, !chat.muted)}
            aria-pressed={!chat.muted}
            className="w-full min-h-[44px] flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202B36] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              {chat.muted ? (
                <BellOff className="w-4 h-4 text-slate-400" />
              ) : (
                <Bell className="w-4 h-4 text-[#3390EC]" />
              )}
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Уведомления
              </span>
            </div>
            <span
              className={`w-10 h-5 rounded-full relative transition-colors ${
                chat.muted ? 'bg-slate-300 dark:bg-slate-600' : 'bg-[#3390EC]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                  chat.muted ? 'left-0.5' : 'left-5'
                }`}
              />
            </span>
          </button>
        </div>

        {/* Conversation Statistics Summary (clean unboxed metrics) */}
        <div
          data-testid="profile-chat-stats"
          className="px-5 py-3.5 border-b border-slate-100 dark:border-[#0E1621]"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Статистика чата
            </span>
            {firstMessageDate && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                с {firstMessageDate}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-y-2.5 gap-x-3 text-left">
            <div>
              <div className="text-base font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.totalMessages}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Сообщений
              </div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.mediaCount + stats.filesCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Медиа и файлов
              </div>
            </div>
            <div>
              <div className="text-base font-display font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.voiceCount + stats.stickersCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Голос / стикеры
              </div>
            </div>
          </div>

          {stats.totalMessages > 0 && chat.type === 'private' && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-[#243242]/60 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>Вы: {stats.ownMessages}</span>
              <span aria-hidden="true">·</span>
              <span>Собеседник: {stats.peerMessages}</span>
              <span aria-hidden="true">·</span>
              <span>Ссылок: {stats.linksCount}</span>
            </div>
          )}
        </div>

        {/* Shared Content Tabs */}
        <div
          role="tablist"
          aria-label="Разделы информации чата"
          className="flex border-b border-slate-200/80 dark:border-[#0E1621] px-2 overflow-x-auto no-scrollbar"
        >
          {tabs.map((tab) => {
            const selected = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`relative min-h-[44px] px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                  selected
                    ? 'text-[#3390EC] dark:text-[#6AB3F3]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className="text-[11px] opacity-75 tabular-nums">
                    {tab.count}
                  </span>
                )}
                {selected && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-[#3390EC] dark:bg-[#6AB3F3]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div className="p-3">
          {effectiveTab === 'members' && chat.members && (
            <div className="space-y-1">
              {chat.members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setInspectedMember(member)}
                  className="w-full min-h-[52px] flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/90 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                >
                  <Avatar
                    title={member.name}
                    avatarUrl={member.avatarUrl}
                    avatarColor={member.avatarColor}
                    online={member.online}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1">
                        <span className="truncate">{member.name}</span>
                        {member.statusEmoji && (
                          <span className="text-xs shrink-0">
                            {member.statusEmoji}
                          </span>
                        )}
                      </span>
                      {member.role && member.role !== 'member' && (
                        <span className="text-[11px] font-medium text-[#3390EC] dark:text-[#6AB3F3] shrink-0">
                          {member.role === 'owner' ? 'владелец' : 'админ'}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        member.online
                          ? 'text-[#3390EC] dark:text-[#6AB3F3] font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {member.online
                        ? 'в сети'
                        : member.lastSeenAt
                          ? formatLastSeen(member.lastSeenAt, false)
                          : member.lastSeenText || 'был(а) недавно'}
                      {member.city ? ` · ${member.city}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {effectiveTab === 'groups' && (
            <div className="space-y-1">
              {commonGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    onSelectChat?.(group.id);
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className="w-full min-h-[52px] flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-100/90 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                >
                  <Avatar
                    title={group.title}
                    avatarUrl={group.avatarUrl}
                    avatarColor={group.avatarColor}
                    type="group"
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {group.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {group.memberCount ?? group.members?.length ?? 1} участников
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {effectiveTab === 'media' &&
            (shared.media.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <ImageIcon className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Общих фотографий пока нет
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {shared.media.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() =>
                      onOpenLightbox(
                        msg.attachment!.url,
                        msg.text || msg.attachment!.name,
                      )
                    }
                    aria-label={`Открыть медиа ${msg.attachment?.name}`}
                    className="aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                  >
                    <img
                      src={msg.attachment!.url}
                      alt={msg.text || msg.attachment!.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </button>
                ))}
              </div>
            ))}

          {effectiveTab === 'files' &&
            (shared.files.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Файлы не отправлялись
              </div>
            ) : (
              <div className="space-y-1.5">
                {shared.files.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => handleJump(msg.id)}
                    className="w-full min-h-[52px] flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#3390EC]/12 text-[#3390EC] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {msg.attachment?.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {msg.attachment?.sizeLabel || 'Документ'} ·{' '}
                        {formatChatListTime(msg.createdAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}

          {effectiveTab === 'voice' &&
            (shared.voice.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <Mic className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Голосовых сообщений пока нет
              </div>
            ) : (
              <div className="space-y-1.5">
                {shared.voice.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => handleJump(msg.id)}
                    className="w-full min-h-[52px] flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#3390EC]/12 text-[#3390EC] flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {msg.senderName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDuration(msg.attachment?.durationSec ?? 0)} ·{' '}
                        {formatChatListTime(msg.createdAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}

          {effectiveTab === 'links' &&
            (shared.links.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <Link2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
                Ссылок в чате пока нет
              </div>
            ) : (
              <div className="space-y-2">
                {shared.links.map((item, idx) => (
                  <a
                    key={`${item.messageId}-${idx}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202B36] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#3390EC]/12 text-[#3390EC] flex items-center justify-center shrink-0 mt-0.5">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#3390EC] dark:text-[#6AB3F3] break-all">
                        {item.url}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.senderName} · {formatChatListTime(item.createdAt)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ))}

          {!hasMembers && effectiveTab === 'members' && (
            <div className="py-8 text-center text-xs text-slate-500">
              <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
              Нет списка участников
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
