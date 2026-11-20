import { useMemo, useState } from 'react';
import {
  AtSign,
  BadgeCheck,
  Bell,
  BellOff,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { extractSharedItems, formatChatListTime } from '../utils/chatLogic';
import type { ChatMessage, ChatThread } from '../types/telegram';

interface ChatInfoPanelProps {
  chat: ChatThread | null;
  messages: ChatMessage[];
  onClose: () => void;
  onToggleMute: (chatId: string, muted: boolean) => void;
  onOpenLightbox: (url: string, caption?: string) => void;
  onJumpToMessage: (messageId: string) => void;
}

type InspectorTab = 'media' | 'files' | 'links' | 'members';

export function ChatInfoPanel({
  chat,
  messages,
  onClose,
  onToggleMute,
  onOpenLightbox,
  onJumpToMessage,
}: ChatInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('media');

  const shared = useMemo(() => extractSharedItems(messages), [messages]);

  if (!chat) return null;

  const hasMembers = chat.type === 'group' && (chat.members?.length ?? 0) > 0;
  const effectiveTab =
    activeTab === 'members' && !hasMembers ? 'media' : activeTab;

  const tabs: Array<{ id: InspectorTab; label: string; count: number }> = [
    ...(hasMembers
      ? [{ id: 'members' as const, label: 'Участники', count: chat.members?.length ?? 0 }]
      : []),
    { id: 'media', label: 'Медиа', count: shared.media.length },
    { id: 'files', label: 'Файлы', count: shared.files.length },
    { id: 'links', label: 'Ссылки', count: shared.links.length },
  ];

  return (
    <aside
      aria-label="Информация о чате"
      className="fixed inset-y-0 right-0 z-30 w-full max-w-[340px] lg:static lg:w-[324px] shrink-0 bg-white dark:bg-[#17212B] border-l border-slate-200/90 dark:border-[#0E1621] flex flex-col h-full shadow-2xl lg:shadow-none"
    >
      {/* Header */}
      <div className="h-[58px] px-4 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between shrink-0">
        <h2 className="font-display font-semibold text-[15px] text-slate-900 dark:text-slate-100">
          {chat.type === 'group'
            ? 'Информация о группе'
            : chat.type === 'channel'
              ? 'Информация о канале'
              : 'Профиль'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель информации"
          className="min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto tg-scroll">
        {/* Identity Summary */}
        <div className="px-5 py-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-[#0E1621]">
          <Avatar
            title={chat.title}
            avatarUrl={chat.avatarUrl}
            avatarColor={chat.avatarColor}
            type={chat.type}
            online={Boolean(chat.online)}
            size="xl"
          />
          <div className="mt-3.5 flex items-center gap-1.5">
            <h3 className="font-display font-bold text-[17px] text-slate-900 dark:text-slate-100">
              {chat.title}
            </h3>
            {chat.verified && <BadgeCheck className="w-4 h-4 text-[#3390EC]" />}
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            {chat.type === 'channel'
              ? `${(chat.memberCount ?? 1).toLocaleString('ru-RU')} подписчиков`
              : chat.type === 'group'
                ? `${chat.memberCount ?? chat.members?.length ?? 1} участников`
                : chat.type === 'saved'
                  ? 'Облачное хранилище'
                  : chat.online
                    ? 'в сети'
                    : chat.lastSeenText || 'был(а) недавно'}
          </p>
        </div>

        {/* Details & Notification Toggle */}
        <div className="px-4 py-3 space-y-3 border-b border-slate-100 dark:border-[#0E1621]">
          {chat.username && (
            <div className="flex items-start gap-3 px-2 py-1">
              <AtSign className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {chat.username}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Имя пользователя
                </div>
              </div>
            </div>
          )}

          {chat.bio && (
            <div className="flex items-start gap-3 px-2 py-1">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[13.5px] text-slate-800 dark:text-slate-200 leading-relaxed">
                  {chat.bio}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  О себе
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onToggleMute(chat.id, !chat.muted)}
            aria-pressed={!chat.muted}
            className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-[#202B36] transition-colors cursor-pointer"
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

        {/* Shared Tabs */}
        <div
          role="tablist"
          aria-label="Разделы информации чата"
          className="flex border-b border-slate-200/80 dark:border-[#0E1621] px-2"
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
                className={`relative flex-1 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  selected
                    ? 'text-[#3390EC] dark:text-[#6AB3F3]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
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
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl"
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
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {member.name}
                      </span>
                      {member.role && member.role !== 'member' && (
                        <span className="text-[11px] font-medium text-[#3390EC] dark:text-[#6AB3F3] shrink-0">
                          {member.role === 'owner' ? 'владелец' : 'админ'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {member.online ? 'в сети' : 'был(а) недавно'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {effectiveTab === 'media' && (
            shared.media.length === 0 ? (
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
                      onOpenLightbox(msg.attachment!.url, msg.text || msg.attachment!.name)
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
            )
          )}

          {effectiveTab === 'files' && (
            shared.files.length === 0 ? (
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
                    onClick={() => onJumpToMessage(msg.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202B36] transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#3390EC]/12 text-[#3390EC] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {msg.attachment?.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {msg.attachment?.sizeLabel || 'Документ'} · {formatChatListTime(msg.createdAt)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {effectiveTab === 'links' && (
            shared.links.length === 0 ? (
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
            )
          )}

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
