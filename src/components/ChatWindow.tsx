import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  BadgeCheck,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  FileText,
  Info,
  Loader2,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  Smile,
  Square,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { MessageBubble } from './MessageBubble';
import { EMOJI_GROUPS } from '../data/seedData';
import {
  formatDateDivider,
  formatDuration,
  searchMessagesInChat,
} from '../utils/chatLogic';
import { formatRemainingRetention } from '../utils/fileRetention';
import type {
  ActiveCallRoom,
  AppSettings,
  CallMode,
  ChatMessage,
  ChatThread,
  CustomSticker,
  MessageAttachment,
  MessageKind,
  StickerPack,
  TypingState,
} from '../types/telegram';

interface ChatWindowProps {
  chat: ChatThread | null;
  messages: ChatMessage[];
  currentUserId: string;
  typingState?: TypingState;
  settings: AppSettings;
  stickerPacks: StickerPack[];
  activeCallInChat?: ActiveCallRoom | null;
  isJoinedToChatCall?: boolean;
  highlightMessageId: string | null;
  showInfoPanel: boolean;
  onBackMobile: () => void;
  onToggleInfoPanel: () => void;
  onSendMessage: (params: {
    chatId: string;
    kind: MessageKind;
    text: string;
    replyToId?: string;
    attachment?: MessageAttachment;
  }) => void;
  onUploadFile: (
    file: File,
  ) => Promise<{ attachment?: MessageAttachment; error?: string }>;
  onOpenStickerStudio: () => void;
  onEditMessage: (chatId: string, messageId: string, text: string) => void;
  onDeleteMessage: (chatId: string, messageId: string) => void;
  onToggleReaction: (chatId: string, messageId: string, emoji: string) => void;
  onPinMessage: (chatId: string, messageId: string | null) => void;
  onForwardMessage: (message: ChatMessage) => void;
  onUpdateChatFlags: (
    chatId: string,
    flags: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ) => void;
  onClearHistory: (chatId: string) => void;
  onTyping: (chatId: string, isTyping: boolean) => void;
  onOpenLightbox: (url: string, caption?: string) => void;
  onClearHighlight: () => void;
  onStartCall: (chatId: string, mode: CallMode) => void;
  onJoinCall: (call: ActiveCallRoom) => void;
  onOpenActiveCall: () => void;
}

export function ChatWindow({
  chat,
  messages,
  currentUserId,
  typingState,
  settings,
  stickerPacks,
  activeCallInChat,
  isJoinedToChatCall,
  highlightMessageId,
  showInfoPanel,
  onBackMobile,
  onToggleInfoPanel,
  onSendMessage,
  onUploadFile,
  onOpenStickerStudio,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onPinMessage,
  onForwardMessage,
  onUpdateChatFlags,
  onClearHistory,
  onTyping,
  onOpenLightbox,
  onClearHighlight,
  onStartCall,
  onJoinCall,
  onOpenActiveCall,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    kind: 'image' | 'file';
    attachment: MessageAttachment;
  } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers'>('emoji');
  const [activePackId, setActivePackId] = useState<string>(
    stickerPacks[0]?.id ?? '',
  );
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // In-chat search state
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Scroll state
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [localHighlightId, setLocalHighlightId] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      stickerPacks.length > 0 &&
      !stickerPacks.some((p) => p.id === activePackId)
    ) {
      setActivePackId(stickerPacks[0].id);
    }
  }, [stickerPacks, activePackId]);

  const messageMap = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );

  const chatSearchMatches = useMemo(
    () => (chatSearchOpen ? searchMessagesInChat(messages, chatSearchQuery) : []),
    [chatSearchOpen, messages, chatSearchQuery],
  );

  useEffect(() => {
    setReplyingTo(null);
    setEditingMsg(null);
    setPendingAttachment(null);
    setUploadError(null);
    setPickerOpen(false);
    setHeaderMenuOpen(false);
    setChatSearchOpen(false);
    setChatSearchQuery('');
    setIsRecording(false);
    setRecordSeconds(0);
    setDraft('');
  }, [chat?.id]);

  useEffect(() => {
    if (!feedRef.current || highlightMessageId) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [chat?.id, messages.length, highlightMessageId]);

  useEffect(() => {
    const targetId = highlightMessageId || localHighlightId;
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => {
      setLocalHighlightId(null);
      if (highlightMessageId) onClearHighlight();
    }, 2200);
    return () => clearTimeout(timer);
  }, [highlightMessageId, localHighlightId, onClearHighlight]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(e.target as Node)
      ) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const wallpaperCls =
    settings.wallpaper === 'minimal'
      ? 'tg-wallpaper-minimal'
      : settings.wallpaper === 'graphite'
        ? 'tg-wallpaper-graphite'
        : settings.wallpaper === 'ocean'
          ? 'tg-wallpaper-ocean'
          : 'tg-wallpaper-pattern';

  if (!chat) {
    return (
      <main
        className={`flex-1 h-full flex items-center justify-center ${wallpaperCls} p-6`}
      >
        <div className="px-5 py-2.5 rounded-full bg-black/30 dark:bg-[#17212B]/90 text-white text-sm font-medium backdrop-blur-xs">
          Выберите чат или создайте новый диалог
        </div>
      </main>
    );
  }

  const pinnedMessage = chat.pinnedMessageId
    ? messageMap.get(chat.pinnedMessageId)
    : undefined;

  const activePack =
    stickerPacks.find((p) => p.id === activePackId) ?? stickerPacks[0] ?? null;

  const jumpToMessage = (messageId: string) => {
    setLocalHighlightId(messageId);
  };

  const handleInputChange = (value: string) => {
    setDraft(value);
    onTyping(chat.id, value.trim().length > 0);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(chat.id, false);
    }, 2500);
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();

    if (editingMsg) {
      if (!trimmed) return;
      onEditMessage(chat.id, editingMsg.id, trimmed);
      setEditingMsg(null);
      setDraft('');
      onTyping(chat.id, false);
      return;
    }

    if (pendingAttachment) {
      onSendMessage({
        chatId: chat.id,
        kind: pendingAttachment.kind,
        text: trimmed,
        replyToId: replyingTo?.id,
        attachment: pendingAttachment.attachment,
      });
      setPendingAttachment(null);
      setReplyingTo(null);
      setDraft('');
      onTyping(chat.id, false);
      return;
    }

    if (!trimmed) return;
    onSendMessage({
      chatId: chat.id,
      kind: 'text',
      text: trimmed,
      replyToId: replyingTo?.id,
    });
    setReplyingTo(null);
    setDraft('');
    onTyping(chat.id, false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadingFile(true);
    const result = await onUploadFile(file);
    setUploadingFile(false);

    if (result.error || !result.attachment) {
      setUploadError(result.error || 'Не удалось загрузить файл');
      return;
    }

    const kind: 'image' | 'file' = file.type.startsWith('image/')
      ? 'image'
      : 'file';
    setPendingAttachment({
      kind,
      attachment: result.attachment,
    });
    inputRef.current?.focus();
  };

  const handleFinishVoice = () => {
    const duration = Math.max(1, recordSeconds);
    const waveform = Array.from({ length: 24 }, (_, idx) =>
      Math.round(25 + Math.abs(Math.sin(idx * 0.7 + duration)) * 68),
    );
    onSendMessage({
      chatId: chat.id,
      kind: 'voice',
      text: '',
      replyToId: replyingTo?.id,
      attachment: {
        url: '',
        name: 'Голосовое сообщение',
        durationSec: duration,
        waveform,
      },
    });
    setIsRecording(false);
    setRecordSeconds(0);
    setReplyingTo(null);
  };

  const handleSendSticker = (sticker: CustomSticker) => {
    onSendMessage({
      chatId: chat.id,
      kind: 'sticker',
      text: '',
      replyToId: replyingTo?.id,
      attachment: {
        url: sticker.imageUrl || '',
        name: sticker.label,
        stickerCode: sticker.id,
        stickerLabel: sticker.label,
        stickerEmoji: sticker.emoji,
        stickerPackId: sticker.packId,
        stickerImageUrl: sticker.imageUrl,
        stickerBg: sticker.bgColor,
        stickerAccent: sticker.accentColor,
      },
    });
    setPickerOpen(false);
    setReplyingTo(null);
  };

  const handleScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 240);
  };

  const subtitle = (() => {
    if (typingState) {
      return `${typingState.userName.split(' ')[0]} печатает...`;
    }
    if (chat.type === 'saved') return 'Личные заметки и сохранённые файлы';
    if (chat.type === 'channel') {
      return `${(chat.memberCount ?? 1).toLocaleString('ru-RU')} подписчиков`;
    }
    if (chat.type === 'group') {
      const onlineMembers = chat.members?.filter((m) => m.online).length ?? 1;
      return `${chat.memberCount ?? chat.members?.length ?? 1} участников, ${onlineMembers} в сети`;
    }
    return chat.online ? 'в сети' : chat.lastSeenText || 'был(а) недавно';
  })();

  const pendingRetentionText = pendingAttachment?.attachment.expiresAt
    ? formatRemainingRetention(pendingAttachment.attachment.expiresAt)
    : pendingAttachment?.attachment.retentionPolicy === 'permanent'
      ? 'хранится бессрочно'
      : null;

  return (
    <main
      aria-label={`Чат ${chat.title}`}
      className="relative flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#0E1621]"
    >
      {/* Chat Header */}
      <header className="h-[58px] px-3 sm:px-4 bg-white dark:bg-[#17212B] border-b border-slate-200/90 dark:border-[#0E1621] flex items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Назад к списку чатов"
            className="md:hidden min-w-[40px] min-h-[40px] -ml-1 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onToggleInfoPanel}
            aria-label={`Открыть профиль: ${chat.title}`}
            className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Avatar
              title={chat.title}
              avatarUrl={chat.avatarUrl}
              avatarColor={chat.avatarColor}
              type={chat.type}
              online={Boolean(chat.online)}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-display font-semibold text-[15.5px] text-slate-900 dark:text-slate-100 truncate">
                  {chat.title}
                </h1>
                {chat.verified && (
                  <BadgeCheck className="w-4 h-4 text-[#3390EC] shrink-0" />
                )}
              </div>
              <p
                className={`text-[12.5px] truncate ${
                  typingState || (chat.type === 'private' && chat.online)
                    ? 'font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
                style={
                  typingState || (chat.type === 'private' && chat.online)
                    ? { color: 'var(--tg-accent)' }
                    : undefined
                }
              >
                {subtitle}
              </p>
            </div>
          </button>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {(chat.type === 'private' || chat.type === 'group') && (
            <>
              <button
                type="button"
                onClick={() => onStartCall(chat.id, 'audio')}
                aria-label={
                  chat.type === 'group'
                    ? 'Начать групповой аудиозвонок'
                    : 'Позвонить (P2P аудио)'
                }
                title={
                  chat.type === 'group' ? 'Групповой звонок' : 'Аудиозвонок P2P'
                }
                className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] hover:text-emerald-500 transition-colors cursor-pointer"
              >
                <Phone className="w-[19px] h-[19px]" />
              </button>

              <button
                type="button"
                onClick={() => onStartCall(chat.id, 'video')}
                aria-label={
                  chat.type === 'group'
                    ? 'Начать групповой видеозвонок'
                    : 'Видеозвонок (P2P)'
                }
                title={
                  chat.type === 'group'
                    ? 'Групповой видеозвонок'
                    : 'Видеозвонок P2P'
                }
                className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] hover:text-[#3390EC] transition-colors cursor-pointer"
              >
                <Video className="w-[19px] h-[19px]" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setChatSearchOpen((prev) => !prev);
              setChatSearchQuery('');
              setActiveMatchIdx(0);
            }}
            aria-label="Поиск в чате"
            aria-pressed={chatSearchOpen}
            className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              chatSearchOpen
                ? 'bg-[#3390EC]/12 text-[#3390EC]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C]'
            }`}
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onToggleInfoPanel}
            aria-label={
              showInfoPanel
                ? 'Скрыть информацию о чате'
                : 'Показать информацию о чате'
            }
            aria-pressed={showInfoPanel}
            className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showInfoPanel
                ? 'bg-[#3390EC]/12 text-[#3390EC]'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C]'
            }`}
          >
            <Info className="w-5 h-5" />
          </button>

          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((o) => !o)}
              aria-label="Дополнительные действия чата"
              aria-expanded={headerMenuOpen}
              className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {headerMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 z-40 w-56 rounded-2xl bg-white dark:bg-[#17212B] shadow-xl border border-slate-200/80 dark:border-slate-700/70 p-1.5"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onUpdateChatFlags(chat.id, { muted: !chat.muted });
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
                >
                  {chat.muted ? (
                    <Bell className="w-4 h-4 text-slate-500" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-500" />
                  )}
                  <span>{chat.muted ? 'Включить звук' : 'Отключить звук'}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onUpdateChatFlags(chat.id, { pinned: !chat.pinned });
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
                >
                  <Pin className="w-4 h-4 text-slate-500" />
                  <span>{chat.pinned ? 'Открепить чат' : 'Закрепить чат'}</span>
                </button>

                {chat.type !== 'saved' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onUpdateChatFlags(chat.id, { archived: !chat.archived });
                      setHeaderMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-slate-500" />
                    <span>{chat.archived ? 'Вернуть из архива' : 'В архив'}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onClearHistory(chat.id);
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Очистить историю</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Active P2P / Group Call Banner */}
      {activeCallInChat && (
        <div className="px-4 py-2.5 bg-emerald-600/12 dark:bg-emerald-500/12 border-b border-emerald-500/25 flex items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              {activeCallInChat.chatType === 'group' ? (
                <Users className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                {activeCallInChat.chatType === 'group'
                  ? 'Активный групповой звонок'
                  : 'Активный P2P-звонок'}
              </div>
              <div className="text-[12px] text-slate-600 dark:text-slate-300 truncate tabular-nums">
                Участников: {activeCallInChat.participants.length} ·{' '}
                {activeCallInChat.participants.map((p) => p.name).join(', ')}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              isJoinedToChatCall
                ? onOpenActiveCall()
                : onJoinCall(activeCallInChat)
            }
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isJoinedToChatCall ? 'Вернуться в звонок' : 'Присоединиться'}
          </button>
        </div>
      )}

      {/* In-Chat Search Bar */}
      {chatSearchOpen && (
        <div className="px-4 py-2 bg-white dark:bg-[#17212B] border-b border-slate-200/80 dark:border-[#0E1621] flex items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={chatSearchQuery}
            onChange={(e) => {
              setChatSearchQuery(e.target.value);
              setActiveMatchIdx(0);
            }}
            placeholder="Найти в этом чате..."
            aria-label="Поиск по сообщениям в текущем чате"
            autoFocus
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {chatSearchQuery && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              {chatSearchMatches.length > 0
                ? `${activeMatchIdx + 1} из ${chatSearchMatches.length}`
                : '0 совпадений'}
            </span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={chatSearchMatches.length === 0}
              onClick={() => {
                const nextIdx =
                  (activeMatchIdx - 1 + chatSearchMatches.length) %
                  chatSearchMatches.length;
                setActiveMatchIdx(nextIdx);
                jumpToMessage(chatSearchMatches[nextIdx].id);
              }}
              aria-label="Предыдущее совпадение"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#242F3D] disabled:opacity-40 cursor-pointer"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={chatSearchMatches.length === 0}
              onClick={() => {
                const nextIdx = (activeMatchIdx + 1) % chatSearchMatches.length;
                setActiveMatchIdx(nextIdx);
                jumpToMessage(chatSearchMatches[nextIdx].id);
              }}
              aria-label="Следующее совпадение"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#242F3D] disabled:opacity-40 cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setChatSearchOpen(false);
                setChatSearchQuery('');
              }}
              aria-label="Закрыть поиск по чату"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <div className="px-4 py-2 bg-white/95 dark:bg-[#17212B]/95 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between gap-3 shrink-0 z-10">
          <button
            type="button"
            onClick={() => jumpToMessage(pinnedMessage.id)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-85 transition-opacity cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-[#3390EC]/12 text-[#3390EC] dark:text-[#6AB3F3] flex items-center justify-center shrink-0">
              <Pin className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[#3390EC] dark:text-[#6AB3F3]">
                Закреплённое сообщение
              </div>
              <div className="text-[13px] text-slate-600 dark:text-slate-300 truncate">
                {pinnedMessage.text || pinnedMessage.attachment?.name || 'Вложение'}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onPinMessage(chat.id, null)}
            aria-label="Открепить сообщение"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        data-testid="message-feed"
        className={`flex-1 overflow-y-auto overflow-x-hidden tg-scroll ${wallpaperCls} px-3 sm:px-6 pt-4 pb-6`}
      >
        <div className="max-w-[760px] mx-auto flex flex-col justify-end min-h-full">
          {messages.length === 0 ? (
            <div className="my-auto text-center py-12">
              <div className="inline-block px-5 py-4 rounded-2xl bg-white/90 dark:bg-[#17212B]/90 shadow-xs max-w-xs border border-slate-200/40 dark:border-white/5">
                <p className="font-display font-semibold text-sm text-slate-800 dark:text-slate-100">
                  {chat.type === 'saved'
                    ? 'Ваше личное облако в Тилиграме'
                    : 'Здесь пока нет сообщений'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {chat.type === 'saved'
                    ? 'Сохраняйте заметки, ссылки, стикеры и файлы. Файлы 1–10 МБ хранятся 5 дней, 10+ МБ — 1 день.'
                    : 'Напишите первое сообщение, прикрепите файл или отправьте стикер.'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const next = messages[idx + 1];
              const currentDay = formatDateDivider(msg.createdAt);
              const prevDay = prev ? formatDateDivider(prev.createdAt) : null;
              const showDateDivider = currentDay !== prevDay;

              const isFirstInGroup =
                showDateDivider || !prev || prev.senderId !== msg.senderId;
              const isLastInGroup =
                !next ||
                formatDateDivider(next.createdAt) !== currentDay ||
                next.senderId !== msg.senderId;

              const replyTarget = msg.replyToId
                ? messageMap.get(msg.replyToId)
                : undefined;

              const highlighted =
                msg.id === highlightMessageId ||
                msg.id === localHighlightId ||
                (chatSearchOpen &&
                  chatSearchMatches[activeMatchIdx]?.id === msg.id);

              return (
                <div key={msg.id} className="min-w-0 w-full">
                  {showDateDivider && (
                    <div className="flex justify-center my-3 sticky top-1 z-10 pointer-events-none">
                      <span className="px-3 py-1 rounded-full bg-slate-900/35 dark:bg-[#17212B]/85 text-white text-[12px] font-medium backdrop-blur-xs">
                        {currentDay}
                      </span>
                    </div>
                  )}

                  <MessageBubble
                    message={msg}
                    chatType={chat.type}
                    isOwn={msg.senderId === currentUserId}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    currentUserId={currentUserId}
                    replyTarget={replyTarget}
                    isHighlighted={highlighted}
                    fontSize={settings.fontSize}
                    bubbleRadius={settings.bubbleRadius}
                    largeEmoji={settings.largeEmoji}
                    onReply={(m) => {
                      setEditingMsg(null);
                      setReplyingTo(m);
                      inputRef.current?.focus();
                    }}
                    onEdit={(m) => {
                      setReplyingTo(null);
                      setEditingMsg(m);
                      setDraft(m.text);
                      inputRef.current?.focus();
                    }}
                    onDelete={(m) => onDeleteMessage(chat.id, m.id)}
                    onPin={(m) => onPinMessage(chat.id, m.id)}
                    onForward={onForwardMessage}
                    onReact={(m, emoji) => onToggleReaction(chat.id, m.id, emoji)}
                    onJumpToMessage={jumpToMessage}
                    onOpenLightbox={onOpenLightbox}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => {
            if (feedRef.current) {
              feedRef.current.scrollTo({
                top: feedRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }
          }}
          aria-label="Прокрутить вниз"
          className="absolute right-5 bottom-22 z-20 w-11 h-11 rounded-full bg-white dark:bg-[#17212B] text-slate-600 dark:text-slate-300 shadow-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-[#232E3C] cursor-pointer"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}

      {/* Composer Area */}
      {chat.canPost === false ? (
        <div className="px-4 py-3 bg-white dark:bg-[#17212B] border-t border-slate-200/90 dark:border-[#0E1621] flex items-center justify-center">
          <button
            type="button"
            onClick={() => onUpdateChatFlags(chat.id, { muted: !chat.muted })}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-[#3390EC] dark:text-[#6AB3F3] hover:bg-[#3390EC]/10 transition-colors cursor-pointer"
          >
            {chat.muted
              ? 'Включить уведомления канала'
              : 'Отключить уведомления канала'}
          </button>
        </div>
      ) : (
        <div className="relative bg-white dark:bg-[#17212B] border-t border-slate-200/90 dark:border-[#0E1621] px-3 sm:px-5 py-2.5 shrink-0">
          <div className="max-w-[760px] mx-auto">
            {uploadError && (
              <div
                role="alert"
                className="mb-2 px-3 py-2 rounded-xl bg-red-500/12 border border-red-500/25 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-2"
              >
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-red-400 hover:text-red-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Reply / Edit / Attachment Context Strip */}
            {(replyingTo || editingMsg || pendingAttachment || uploadingFile) && (
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-2 border-b border-slate-100 dark:border-[#242F3D]">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {uploadingFile ? (
                    <Loader2 className="w-4 h-4 text-[#3390EC] animate-spin shrink-0" />
                  ) : editingMsg ? (
                    <Edit3 className="w-4 h-4 text-[#3390EC] shrink-0" />
                  ) : pendingAttachment ? (
                    <FileText className="w-4 h-4 text-[#3390EC] shrink-0" />
                  ) : (
                    <Reply className="w-4 h-4 text-[#3390EC] shrink-0" />
                  )}

                  {pendingAttachment?.kind === 'image' && (
                    <img
                      src={pendingAttachment.attachment.url}
                      alt={pendingAttachment.attachment.name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#3390EC] dark:text-[#6AB3F3] truncate">
                      {uploadingFile
                        ? 'Загрузка файла на сервер...'
                        : editingMsg
                          ? 'Редактирование сообщения'
                          : pendingAttachment
                            ? `Вложение: ${pendingAttachment.attachment.name}`
                            : `В ответ ${replyingTo?.senderName}`}
                    </div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-2">
                      {uploadingFile ? (
                        <span>Проверяем размер и срок хранения</span>
                      ) : editingMsg ? (
                        <span>{editingMsg.text}</span>
                      ) : pendingAttachment ? (
                        <>
                          <span className="tabular-nums">
                            {pendingAttachment.attachment.sizeLabel || 'Файл готов'}
                          </span>
                          {pendingRetentionText && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300">
                              <Clock className="w-3 h-3" />
                              {pendingRetentionText}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>
                          {replyingTo?.text ||
                            replyingTo?.attachment?.name ||
                            'Вложение'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!uploadingFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(null);
                      setEditingMsg(null);
                      setPendingAttachment(null);
                      if (editingMsg) setDraft('');
                    }}
                    aria-label="Отменить действие"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Emoji & Sticker Popover */}
            {pickerOpen && (
              <div
                ref={pickerRef}
                className="absolute bottom-16 left-3 sm:left-6 z-40 w-[332px] max-w-[92vw] rounded-2xl bg-white dark:bg-[#17212B] shadow-2xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden"
              >
                <div className="flex border-b border-slate-100 dark:border-[#242F3D]">
                  <button
                    type="button"
                    onClick={() => setPickerTab('emoji')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                      pickerTab === 'emoji'
                        ? 'text-[#3390EC] border-b-2 border-[#3390EC]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Эмодзи
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab('stickers')}
                    className={`flex-1 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                      pickerTab === 'stickers'
                        ? 'text-[#3390EC] border-b-2 border-[#3390EC]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Стикеры
                  </button>
                </div>

                {pickerTab === 'emoji' ? (
                  <div className="max-h-68 overflow-y-auto tg-scroll p-3 space-y-3">
                    {EMOJI_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                          {group.label}
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                          {group.emojis.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => {
                                handleInputChange(draft + em);
                                inputRef.current?.focus();
                              }}
                              className="h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-[#242F3D] text-lg flex items-center justify-center cursor-pointer"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col max-h-76">
                    {/* Pack selector strip */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-100 dark:border-[#242F3D] overflow-x-auto">
                      {stickerPacks.map((pack) => (
                        <button
                          key={pack.id}
                          type="button"
                          onClick={() => setActivePackId(pack.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                            activePack?.id === pack.id
                              ? 'bg-[#3390EC] text-white'
                              : 'bg-slate-100 dark:bg-[#242F3D] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2C3A4C]'
                          }`}
                        >
                          {pack.title}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setPickerOpen(false);
                          onOpenStickerStudio();
                        }}
                        aria-label="Создать стикерпак"
                        className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold whitespace-nowrap bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Создать</span>
                      </button>
                    </div>

                    <div className="p-3 overflow-y-auto tg-scroll flex-1">
                      {!activePack || activePack.stickers.length === 0 ? (
                        <div className="py-6 text-center space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            В этом паке пока нет стикеров
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setPickerOpen(false);
                              onOpenStickerStudio();
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#3390EC] text-white text-xs font-semibold cursor-pointer"
                          >
                            Открыть студию стикеров
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {activePack.stickers.map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => handleSendSticker(st)}
                              className="p-2 rounded-xl border border-slate-100 dark:border-slate-700/60 hover:scale-[1.03] transition-transform flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[86px]"
                              style={{
                                backgroundColor: st.imageUrl
                                  ? 'transparent'
                                  : st.bgColor || '#1B365D',
                              }}
                            >
                              {st.imageUrl ? (
                                <img
                                  src={st.imageUrl}
                                  alt={st.label}
                                  className="w-14 h-14 object-contain"
                                />
                              ) : (
                                <span className="text-2xl leading-none">
                                  {st.emoji}
                                </span>
                              )}
                              <span
                                className="text-[10.5px] font-semibold truncate w-full text-center"
                                style={{
                                  color: st.imageUrl
                                    ? undefined
                                    : st.accentColor || '#38BDF8',
                                }}
                              >
                                {st.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Composer Controls */}
            {isRecording ? (
              <div className="flex items-center justify-between gap-3 h-11 px-2">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    Запись голосового · {formatDuration(recordSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecording(false);
                      setRecordSeconds(0);
                    }}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishVoice}
                    aria-label="Отправить голосовое сообщение"
                    className="w-10 h-10 rounded-full text-white flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: 'var(--tg-accent)' }}
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt,.zip,.mp4,.mp3,.json,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Прикрепить файл или фото"
                  className="min-w-[42px] min-h-[42px] rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242F3D] hover:text-[#3390EC] transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-label="Открыть эмодзи и стикеры"
                  aria-expanded={pickerOpen}
                  className={`min-w-[42px] min-h-[42px] rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    pickerOpen
                      ? 'text-[#3390EC] bg-[#3390EC]/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242F3D]'
                  }`}
                >
                  <Smile className="w-5 h-5" />
                </button>

                <div className="flex-1 min-w-0">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (settings.sendByEnter) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={
                      settings.sendByEnter
                        ? 'Написать сообщение...'
                        : 'Написать сообщение (Ctrl+Enter — отправить)...'
                    }
                    aria-label="Поле ввода сообщения"
                    className="w-full max-h-32 py-2.5 px-3 rounded-2xl bg-[#F1F4F7] dark:bg-[#242F3D] text-[14.5px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#3390EC]/40"
                  />
                </div>

                {draft.trim().length > 0 || pendingAttachment || editingMsg ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    aria-label={
                      editingMsg ? 'Сохранить изменения' : 'Отправить сообщение'
                    }
                    className="min-w-[42px] min-h-[42px] rounded-full active:scale-95 text-white flex items-center justify-center shrink-0 transition-all cursor-pointer"
                    style={{ backgroundColor: 'var(--tg-accent)' }}
                  >
                    <SendHorizontal className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordSeconds(0);
                      setIsRecording(true);
                    }}
                    aria-label="Записать голосовое сообщение"
                    className="min-w-[42px] min-h-[42px] rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242F3D] hover:text-[#3390EC] transition-colors shrink-0 cursor-pointer"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
