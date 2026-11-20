import { useEffect, useState } from 'react';
import { Check, Reply, SendHorizontal, X } from 'lucide-react';
import { Avatar } from './Avatar';
import type { ChatType } from '../types/telegram';

export interface TelegramPopupNotification {
  id: string;
  chatId: string;
  chatType: ChatType;
  title: string;
  subtitle?: string;
  body: string;
  avatarUrl?: string;
  avatarColor: string;
  createdAt: string;
}

interface NotificationPopupsProps {
  items: TelegramPopupNotification[];
  onDismiss: (id: string) => void;
  onOpenChat: (chatId: string, popupId: string) => void;
  onMarkRead: (chatId: string, popupId: string) => void;
  onQuickReply: (chatId: string, text: string, popupId: string) => void;
}

function PopupCard({
  item,
  onDismiss,
  onOpenChat,
  onMarkRead,
  onQuickReply,
}: {
  item: TelegramPopupNotification;
  onDismiss: (id: string) => void;
  onOpenChat: (chatId: string, popupId: string) => void;
  onMarkRead: (chatId: string, popupId: string) => void;
  onQuickReply: (chatId: string, text: string, popupId: string) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || replyOpen) return;
    const timer = setTimeout(() => {
      onDismiss(item.id);
    }, 6200);
    return () => clearTimeout(timer);
  }, [item.id, paused, replyOpen, onDismiss]);

  const timeLabel = (() => {
    try {
      return new Date(item.createdAt).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'сейчас';
    }
  })();

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = replyText.trim();
    if (!cleaned) return;
    onQuickReply(item.chatId, cleaned, item.id);
    setReplyText('');
    setReplyOpen(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="w-[344px] max-w-[calc(100vw-24px)] rounded-2xl bg-white/98 dark:bg-[#17212B]/98 text-slate-900 dark:text-slate-100 shadow-2xl border border-slate-200/90 dark:border-[#2B3B4E] overflow-hidden transition-all duration-200 animate-[fadeIn_160ms_ease-out]"
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onOpenChat(item.chatId, item.id)}
            className="shrink-0 cursor-pointer"
            aria-label={`Открыть чат ${item.title}`}
          >
            <Avatar
              title={item.title}
              avatarUrl={item.avatarUrl}
              avatarColor={item.avatarColor}
              type={item.chatType}
              size="md"
            />
          </button>

          <button
            type="button"
            onClick={() => onOpenChat(item.chatId, item.id)}
            className="min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-[14px] text-slate-900 dark:text-slate-100 truncate">
                {item.title}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                {timeLabel}
              </span>
            </div>

            {item.subtitle && (
              <div
                className="text-[12px] font-semibold truncate mt-0.5"
                style={{ color: 'var(--tg-accent)' }}
              >
                {item.subtitle}
              </div>
            )}

            <p className="text-[13px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5 leading-snug break-words">
              {item.body}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            aria-label="Закрыть уведомление"
            className="w-7 h-7 -mt-1 -mr-1 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Telegram Desktop style action strip */}
        {replyOpen ? (
          <form onSubmit={handleSubmitReply} className="mt-2.5 flex items-center gap-1.5">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Быстрый ответ..."
              autoFocus
              aria-label="Быстрый ответ в уведомлении"
              className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Отправить быстрый ответ"
              className="w-9 h-9 rounded-xl bg-[var(--tg-accent)] text-white flex items-center justify-center hover:opacity-95 cursor-pointer shrink-0"
            >
              <SendHorizontal className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#243242] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tg-accent)] hover:underline cursor-pointer"
            >
              <Reply className="w-3.5 h-3.5" />
              <span>Ответить</span>
            </button>

            <button
              type="button"
              onClick={() => onMarkRead(item.chatId, item.id)}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Прочитано</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationPopups({
  items,
  onDismiss,
  onOpenChat,
  onMarkRead,
  onQuickReply,
}: NotificationPopupsProps) {
  if (items.length === 0) return null;

  return (
    <div
      aria-label="Всплывающие уведомления Тилиграм"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2.5 items-end pointer-events-none"
    >
      {items.slice(0, 3).map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <PopupCard
            item={item}
            onDismiss={onDismiss}
            onOpenChat={onOpenChat}
            onMarkRead={onMarkRead}
            onQuickReply={onQuickReply}
          />
        </div>
      ))}
    </div>
  );
}
