import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  BellOff,
  Check,
  CheckCheck,
  Megaphone,
  Menu,
  Pencil,
  Pin,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  filterChats,
  formatChatListTime,
  getMessagePreviewText,
  getUnreadCountByFolder,
  searchMessagesGlobally,
} from '../utils/chatLogic';
import type { ChatFolder, ChatMessage, ChatThread } from '../types/telegram';

interface ChatSidebarProps {
  chats: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  currentUserId: string;
  activeChatId: string | null;
  folder: ChatFolder;
  searchQuery: string;
  showArchived: boolean;
  onSelectChat: (chatId: string, highlightMessageId?: string) => void;
  onChangeFolder: (folder: ChatFolder) => void;
  onChangeSearch: (query: string) => void;
  onToggleArchiveView: (show: boolean) => void;
  onOpenDrawer: () => void;
  onOpenCreateModal: () => void;
}

const FOLDERS: Array<{ id: ChatFolder; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'private', label: 'Личные' },
  { id: 'groups', label: 'Группы' },
  { id: 'channels', label: 'Каналы' },
];

export function ChatSidebar({
  chats,
  messagesByChat,
  currentUserId,
  activeChatId,
  folder,
  searchQuery,
  showArchived,
  onSelectChat,
  onChangeFolder,
  onChangeSearch,
  onToggleArchiveView,
  onOpenDrawer,
  onOpenCreateModal,
}: ChatSidebarProps) {
  const visibleChats = filterChats(chats, folder, searchQuery, showArchived);
  const folderUnreads = getUnreadCountByFolder(chats);
  const archivedChats = chats.filter((c) => c.archived);
  const globalMatches = searchQuery.trim().length >= 2
    ? searchMessagesGlobally(chats, messagesByChat, searchQuery, 10)
    : [];

  return (
    <aside
      aria-label="Список чатов"
      className="relative flex flex-col h-full w-full md:w-[356px] lg:w-[388px] shrink-0 bg-white dark:bg-[#17212B] border-r border-slate-200/90 dark:border-[#0E1621]"
    >
      {/* Top Bar: Menu + Search */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2 shrink-0">
        {showArchived ? (
          <button
            type="button"
            onClick={() => onToggleArchiveView(false)}
            aria-label="Назад ко всем чатам"
            className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Открыть меню навигации"
            className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232E3C] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder={showArchived ? 'Поиск в архиве' : 'Поиск'}
            aria-label="Поиск чатов и сообщений"
            className="w-full h-10 pl-10 pr-9 rounded-full bg-[#F1F4F7] dark:bg-[#242F3D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 border border-transparent focus:border-[#3390EC] focus:bg-white dark:focus:bg-[#17212B] focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onChangeSearch('')}
              aria-label="Очистить поиск"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Header or Folder Tabs */}
      {showArchived ? (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-[#0E1621] flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Архив чатов
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {archivedChats.length}
          </span>
        </div>
      ) : (
        <div
          role="tablist"
          aria-label="Папки чатов"
          className="flex items-center px-2 border-b border-slate-200/80 dark:border-[#0E1621] shrink-0 overflow-x-auto"
        >
          {FOLDERS.map((tab) => {
            const isSelected = folder === tab.id;
            const count = folderUnreads[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onChangeFolder(tab.id)}
                className={`relative flex-1 min-w-fit px-3 py-2.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'text-[#3390EC] dark:text-[#6AB3F3]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                style={isSelected ? { color: 'var(--tg-accent)' } : undefined}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 min-w-[18px] h-[18px] rounded-full text-[11px] leading-[18px] font-semibold tabular-nums ${
                      isSelected
                        ? 'text-white'
                        : 'bg-slate-200/90 dark:bg-[#2B3746] text-slate-600 dark:text-slate-300'
                    }`}
                    style={isSelected ? { backgroundColor: 'var(--tg-accent)' } : undefined}
                  >
                    {count}
                  </span>
                )}
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full"
                    style={{ backgroundColor: 'var(--tg-accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable Chat List */}
      <div className="flex-1 overflow-y-auto tg-scroll px-2 py-1.5" data-testid="chat-list">
        {/* Archived shortcut row */}
        {!showArchived && !searchQuery && folder === 'all' && archivedChats.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleArchiveView(true)}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-slate-100/90 dark:hover:bg-[#202B36] transition-colors text-left mb-0.5 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-slate-400/25 dark:bg-slate-600/40 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
              <Archive className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                  Архив
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {archivedChats.length}
                </span>
              </div>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {archivedChats.map((c) => c.title).join(', ')}
              </p>
            </div>
          </button>
        )}

        {visibleChats.length === 0 && globalMatches.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {searchQuery ? 'Ничего не найдено' : 'В этой папке пока нет чатов'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {searchQuery
                ? 'Попробуйте изменить запрос или проверьте раскладку'
                : 'Найдите собеседника по @username или создайте группу кнопкой внизу'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleChats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const msgs = messagesByChat[chat.id] ?? [];
              const lastMsg = msgs[msgs.length - 1];
              const isOwnLast = lastMsg?.senderId === currentUserId;
              const previewText = getMessagePreviewText(lastMsg);

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Открыть чат ${chat.title}`}
                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-[#3390EC] dark:bg-[#2B5278] text-white'
                      : 'hover:bg-slate-100/90 dark:hover:bg-[#202B36] text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <Avatar
                    title={chat.title}
                    avatarUrl={chat.avatarUrl}
                    avatarColor={chat.avatarColor}
                    type={chat.type}
                    online={Boolean(chat.online)}
                    active={isActive}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {chat.type === 'group' && (
                          <Users
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white/85' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                        )}
                        {chat.type === 'channel' && (
                          <Megaphone
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white/85' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                        )}
                        <span className="font-display font-semibold text-[15px] truncate">
                          {chat.title}
                        </span>
                        {chat.verified && (
                          <BadgeCheck
                            aria-label="Подтверждённый канал"
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-[#3390EC]'
                            }`}
                          />
                        )}
                        {chat.muted && (
                          <BellOff
                            aria-label="Уведомления отключены"
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white/75' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isOwnLast && lastMsg && (
                          lastMsg.status === 'read' ? (
                            <CheckCheck
                              aria-hidden="true"
                              className={`w-4 h-4 ${
                                isActive ? 'text-white/90' : 'text-[#4FAE4E] dark:text-[#6AB3F3]'
                              }`}
                            />
                          ) : (
                            <Check
                              aria-hidden="true"
                              className={`w-4 h-4 ${
                                isActive ? 'text-white/80' : 'text-slate-400'
                              }`}
                            />
                          )
                        )}
                        <span
                          className={`text-[12px] tabular-nums ${
                            isActive ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {formatChatListTime(lastMsg?.createdAt ?? chat.lastMessageAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p
                        className={`text-[13.5px] truncate ${
                          isActive ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {chat.type === 'group' && lastMsg && (
                          <span
                            className={`font-medium mr-1 ${
                              isActive ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isOwnLast ? 'Вы:' : `${lastMsg.senderName.split(' ')[0]}:`}
                          </span>
                        )}
                        {chat.type === 'private' && isOwnLast && lastMsg && (
                          <span
                            className={`font-medium mr-1 ${
                              isActive ? 'text-white' : 'text-[#3390EC] dark:text-[#6AB3F3]'
                            }`}
                          >
                            Вы:
                          </span>
                        )}
                        {previewText}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {chat.unreadCount > 0 ? (
                          <span
                            className={`px-1.5 min-w-[20px] h-5 rounded-full text-[11px] leading-5 text-center font-semibold tabular-nums ${
                              isActive
                                ? 'bg-white text-[#3390EC]'
                                : chat.muted
                                  ? 'bg-slate-300 dark:bg-[#3E5063] text-white'
                                  : 'bg-[#3390EC] text-white'
                            }`}
                          >
                            {chat.unreadCount}
                          </span>
                        ) : chat.pinned ? (
                          <Pin
                            aria-label="Закреплённый чат"
                            className={`w-3.5 h-3.5 rotate-45 ${
                              isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Global Message Matches */}
        {globalMatches.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-[#0E1621]">
            <p className="px-2.5 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Найденные сообщения ({globalMatches.length})
            </p>
            <div className="space-y-0.5">
              {globalMatches.map(({ chat, message }) => (
                <button
                  key={`${chat.id}-${message.id}`}
                  type="button"
                  onClick={() => onSelectChat(chat.id, message.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                >
                  <Avatar
                    title={chat.title}
                    avatarUrl={chat.avatarUrl}
                    avatarColor={chat.avatarColor}
                    type={chat.type}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {chat.title}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {formatChatListTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {message.text || message.attachment?.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating Compose Button */}
      <button
        type="button"
        onClick={onOpenCreateModal}
        aria-label="Найти пользователя, создать группу или канал"
        className="absolute bottom-5 right-5 w-13 h-13 rounded-full active:scale-95 text-white shadow-lg flex items-center justify-center transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3390EC]"
        style={{ backgroundColor: 'var(--tg-accent)' }}
      >
        <Pencil className="w-5 h-5" />
      </button>
    </aside>
  );
}
