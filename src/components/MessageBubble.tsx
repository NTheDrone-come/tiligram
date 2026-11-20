import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  Forward,
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Reply,
  Trash2,
} from 'lucide-react';
import { QUICK_REACTIONS } from '../data/seedData';
import { formatDuration, formatMessageTime } from '../utils/chatLogic';
import { formatRemainingRetention, isFileExpired } from '../utils/fileRetention';
import type {
  AppSettings,
  ChatMessage,
  ChatType,
  MessageAttachment,
} from '../types/telegram';

interface MessageBubbleProps {
  message: ChatMessage;
  chatType: ChatType;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  currentUserId: string;
  replyTarget?: ChatMessage;
  isHighlighted?: boolean;
  fontSize: AppSettings['fontSize'];
  bubbleRadius: AppSettings['bubbleRadius'];
  largeEmoji: boolean;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onPin: (msg: ChatMessage) => void;
  onForward: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onOpenLightbox: (url: string, caption?: string) => void;
}

function isPureShortEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 14) return false;
  // Remove whitespace and check if only emoji codepoints remain (1 to 3 grapheme-like emojis)
  const stripped = trimmed.replace(/\s+/g, '');
  if (/[a-zA-Z0-9а-яА-ЯёЁ.,!?;:()\-_/\\]/.test(stripped)) return false;
  const segments = Array.from(stripped);
  return segments.length >= 1 && segments.length <= 6;
}

function renderFormattedText(text: string) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>()]+)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-black/8 dark:bg-white/10 font-mono-tabular text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1D74CE] dark:text-[#71BAFF] underline decoration-[#1D74CE]/40 hover:decoration-current [overflow-wrap:anywhere]"
        >
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function StickerIllustration({ attachment }: { attachment?: MessageAttachment }) {
  if (attachment?.stickerImageUrl) {
    return (
      <div className="w-40 h-40 rounded-3xl overflow-hidden flex items-center justify-center select-none bg-transparent">
        <img
          src={attachment.stickerImageUrl}
          alt={attachment.stickerLabel || attachment.name || 'Стикер'}
          className="w-full h-full object-contain drop-shadow-md"
        />
      </div>
    );
  }

  const emoji = attachment?.stickerEmoji || '✨';
  const label = attachment?.stickerLabel || attachment?.name || 'Стикер';
  const bg = attachment?.stickerBg || '#1B365D';
  const accent = attachment?.stickerAccent || '#38BDF8';

  return (
    <div
      className="w-40 h-40 rounded-3xl flex flex-col items-center justify-center gap-2 select-none shadow-md border border-white/12 px-3"
      style={{ backgroundColor: bg }}
    >
      <div className="text-5xl leading-none drop-shadow-xs">{emoji}</div>
      <span
        className="font-display font-bold text-sm text-center line-clamp-2"
        style={{ color: accent }}
      >
        {label}
      </span>
    </div>
  );
}

function VoicePlayer({
  durationSec,
  waveform,
  isOwn,
}: {
  durationSec: number;
  waveform: number[];
  isOwn: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const stepMs = 100;
    const totalMs = Math.max(durationSec, 3) * 1000;
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + stepMs / totalMs;
        if (next >= 1) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, stepMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, durationSec]);

  const bars =
    waveform.length > 0 ? waveform : [25, 45, 70, 55, 85, 60, 40, 65, 50, 30];
  const elapsed = Math.floor(progress * durationSec);

  return (
    <div className="flex items-center gap-3 min-w-[210px] py-1">
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={
          playing
            ? 'Пауза голосового сообщения'
            : 'Воспроизвести голосовое сообщение'
        }
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer text-white ${
          isOwn ? 'bg-[#4FAE4E] dark:bg-[#5288C1]' : ''
        }`}
        style={!isOwn ? { backgroundColor: 'var(--tg-accent)' } : undefined}
      >
        {playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[3px] h-7">
          {bars.map((height, idx) => {
            const ratio = idx / bars.length;
            const active = ratio <= progress;
            return (
              <span
                key={idx}
                className={`w-[3px] rounded-full transition-colors ${
                  active
                    ? isOwn
                      ? 'bg-[#4FAE4E] dark:bg-[#82C3FF]'
                      : 'bg-[#3390EC]'
                    : isOwn
                      ? 'bg-[#4FAE4E]/35 dark:bg-white/25'
                      : 'bg-slate-300 dark:bg-slate-600'
                }`}
                style={{ height: `${Math.max(20, Math.min(100, height))}%` }}
              />
            );
          })}
        </div>
        <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-300/80 mt-0.5">
          {playing ? formatDuration(elapsed) : formatDuration(durationSec)}
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  chatType,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  currentUserId,
  replyTarget,
  isHighlighted = false,
  fontSize,
  bubbleRadius,
  largeEmoji,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onForward,
  onReact,
  onJumpToMessage,
  onOpenLightbox,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const handleCopy = () => {
    if (message.text && navigator.clipboard) {
      navigator.clipboard.writeText(message.text).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setMenuOpen(false);
    }, 650);
  };

  const showSenderName =
    !isOwn && isFirstInGroup && (chatType === 'group' || chatType === 'channel');

  const isBigEmojiMsg =
    largeEmoji &&
    message.kind === 'text' &&
    !replyTarget &&
    !message.forwardedFrom &&
    isPureShortEmoji(message.text);

  const textSizeCls = isBigEmojiMsg
    ? 'text-4xl leading-tight py-0.5'
    : fontSize === 'small'
      ? 'text-[13px] leading-[1.42]'
      : fontSize === 'large'
        ? 'text-[16.5px] leading-[1.5]'
        : 'text-[14.5px] leading-[1.45]';

  const baseRadius =
    bubbleRadius === 'compact'
      ? 'rounded-xl'
      : bubbleRadius === 'soft'
        ? 'rounded-3xl'
        : 'rounded-2xl';

  const bubbleRounding = isOwn
    ? isLastInGroup
      ? `${baseRadius} rounded-br-sm`
      : baseRadius
    : isLastInGroup
      ? `${baseRadius} rounded-bl-sm`
      : baseRadius;

  const attachmentExpired =
    message.attachment?.expiresAt
      ? isFileExpired(message.attachment.expiresAt)
      : false;
  const retentionLabel =
    message.attachment?.expiresAt
      ? formatRemainingRetention(message.attachment.expiresAt)
      : null;

  return (
    <div
      id={`msg-${message.id}`}
      data-testid="message-item"
      className={`group relative w-full min-w-0 flex flex-col ${
        isOwn ? 'items-end' : 'items-start'
      } ${isFirstInGroup ? 'mt-2.5' : 'mt-1'} ${
        isHighlighted
          ? 'bg-[#3390EC]/15 dark:bg-[#3390EC]/25 -mx-3 px-3 py-1 rounded-xl transition-colors'
          : ''
      }`}
    >
      <div
        className={`relative flex items-end gap-1.5 max-w-[92%] sm:max-w-[78%] lg:max-w-[70%] min-w-0 ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Main Bubble */}
        {message.kind === 'sticker' ? (
          <div className="flex flex-col items-end">
            <StickerIllustration attachment={message.attachment} />
            <div className="mt-1 px-2 py-0.5 rounded-full bg-black/40 text-white text-[11px] tabular-nums flex items-center gap-1">
              <span>{formatMessageTime(message.createdAt)}</span>
              {isOwn &&
                (message.status === 'read' ? (
                  <CheckCheck className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                ))}
            </div>
          </div>
        ) : (
          <div
            className={`relative min-w-0 max-w-full shadow-[0_1px_2px_rgba(16,24,40,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${bubbleRounding} ${
              isOwn
                ? 'bg-[#EEFFDE] dark:bg-[#2B5278] text-slate-900 dark:text-slate-100'
                : 'bg-white dark:bg-[#182533] text-slate-900 dark:text-slate-100'
            } ${message.kind === 'image' && !message.text ? 'p-1.5' : 'px-3.5 py-2'}`}
          >
            {/* Sender Name for Groups / Channels */}
            {showSenderName && (
              <div
                className="text-[13px] font-semibold mb-0.5 truncate"
                style={{ color: message.senderColor || '#3390EC' }}
              >
                {message.senderName}
              </div>
            )}

            {/* Forwarded Label */}
            {message.forwardedFrom && (
              <div className="text-[12px] text-[#3390EC] dark:text-[#71BAFF] mb-1 flex items-center gap-1">
                <Forward className="w-3 h-3 shrink-0" />
                <span className="truncate">Переслано от {message.forwardedFrom}</span>
              </div>
            )}

            {/* Reply Quote */}
            {replyTarget && (
              <button
                type="button"
                onClick={() => onJumpToMessage(replyTarget.id)}
                className={`block w-full max-w-full overflow-hidden text-left mb-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  isOwn
                    ? 'bg-[#4FAE4E]/12 dark:bg-white/10 hover:bg-[#4FAE4E]/20'
                    : 'bg-[#3390EC]/10 dark:bg-white/8 hover:bg-[#3390EC]/15'
                }`}
              >
                <div className="text-[12px] font-semibold text-[#2E7D32] dark:text-[#71BAFF] truncate">
                  {replyTarget.senderName}
                </div>
                <div className="text-[12.5px] text-slate-600 dark:text-slate-300 truncate">
                  {replyTarget.text || replyTarget.attachment?.name || 'Вложение'}
                </div>
              </button>
            )}

            {/* Image Attachment */}
            {message.kind === 'image' && message.attachment && (
              <div className={message.text ? 'mb-1.5 -mx-1.5 -mt-0.5' : ''}>
                {!imgFailed && !attachmentExpired ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLightbox(
                        message.attachment!.url,
                        message.text || message.attachment!.name,
                      )
                    }
                    aria-label="Открыть фотографию в полном размере"
                    className="block w-full overflow-hidden rounded-xl cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#3390EC]"
                  >
                    <img
                      src={message.attachment.url}
                      alt={message.text || message.attachment.name}
                      referrerPolicy="no-referrer"
                      onError={() => setImgFailed(true)}
                      className="max-h-[300px] w-full object-cover bg-slate-200 dark:bg-slate-800"
                    />
                  </button>
                ) : (
                  <div className="w-64 h-36 rounded-xl bg-slate-200/80 dark:bg-slate-700/60 flex flex-col items-center justify-center text-xs text-slate-500 dark:text-slate-300 px-4 text-center gap-1">
                    <Clock className="w-4 h-4 opacity-70" />
                    <span>
                      {attachmentExpired
                        ? 'Срок хранения файла истёк — удалён с сервера'
                        : `Изображение: ${message.attachment.name}`}
                    </span>
                  </div>
                )}

                {retentionLabel && !attachmentExpired && (
                  <div className="mt-1 px-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-300/80">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{retentionLabel}</span>
                  </div>
                )}
              </div>
            )}

            {/* File Attachment */}
            {message.kind === 'file' && message.attachment && (
              <div className="flex items-center gap-3 py-1 mb-1">
                {attachmentExpired ? (
                  <div className="w-10 h-10 rounded-xl bg-slate-400/30 dark:bg-slate-600/50 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                ) : (
                  <a
                    href={message.attachment.url}
                    download={message.attachment.name}
                    aria-label={`Скачать ${message.attachment.name}`}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white transition-transform hover:scale-105 ${
                      isOwn ? 'bg-[#4FAE4E] dark:bg-[#5288C1]' : ''
                    }`}
                    style={!isOwn ? { backgroundColor: 'var(--tg-accent)' } : undefined}
                  >
                    {message.attachment.url.startsWith('/api/files/') ? (
                      <Download className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate">
                    {message.attachment.name}
                  </div>
                  <div className="text-[12px] text-slate-500 dark:text-slate-300/80 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{message.attachment.sizeLabel || 'Документ'}</span>
                    {retentionLabel && (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          attachmentExpired
                            ? 'text-red-500 dark:text-red-400 font-medium'
                            : 'text-amber-600 dark:text-amber-300/90'
                        }`}
                      >
                        <Clock className="w-3 h-3 shrink-0" />
                        {retentionLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Voice Message */}
            {message.kind === 'voice' && message.attachment && (
              <VoicePlayer
                durationSec={message.attachment.durationSec ?? 12}
                waveform={message.attachment.waveform ?? []}
                isOwn={isOwn}
              />
            )}

            {/* Message Text */}
            {message.text && (
              <div className={`${textSizeCls} whitespace-pre-wrap break-words`}>
                {renderFormattedText(message.text)}
              </div>
            )}

            {/* Footer: Time + Edited + Read Status */}
            <div className="flex items-center justify-end gap-1 mt-1 select-none">
              {message.editedAt && (
                <span
                  className={`text-[11px] ${
                    isOwn
                      ? 'text-[#4F9A50] dark:text-[#8FBBE4]'
                      : 'text-slate-400 dark:text-slate-400'
                  }`}
                >
                  изм.
                </span>
              )}
              <span
                className={`text-[11px] tabular-nums ${
                  isOwn
                    ? 'text-[#4F9A50] dark:text-[#8FBBE4]'
                    : 'text-slate-400 dark:text-slate-400'
                }`}
              >
                {formatMessageTime(message.createdAt)}
              </span>
              {isOwn &&
                (message.status === 'read' ? (
                  <CheckCheck
                    aria-label="Прочитано"
                    className="w-3.5 h-3.5 text-[#4FAE4E] dark:text-[#7CC0FA]"
                  />
                ) : (
                  <Check
                    aria-label="Отправлено"
                    className="w-3.5 h-3.5 text-[#4FAE4E] dark:text-[#7CC0FA]"
                  />
                ))}
            </div>
          </div>
        )}

        {/* Action Trigger Button */}
        <div className="relative self-center shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Действия с сообщением от ${message.senderName}`}
            aria-expanded={menuOpen}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 bg-white/85 dark:bg-[#17212B]/90 hover:bg-white dark:hover:bg-[#232E3C] shadow-xs transition-opacity cursor-pointer ${
              menuOpen
                ? 'opacity-100'
                : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className={`absolute bottom-9 z-30 w-52 rounded-2xl bg-white dark:bg-[#17212B] shadow-xl border border-slate-200/80 dark:border-slate-700/70 p-1.5 ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              {/* Quick Reactions Row */}
              <div className="flex items-center justify-between px-1.5 py-1.5 mb-1 border-b border-slate-100 dark:border-slate-700/60">
                {QUICK_REACTIONS.slice(0, 6).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(message, emoji);
                      setMenuOpen(false);
                    }}
                    aria-label={`Поставить реакцию ${emoji}`}
                    className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-[#242F3D] flex items-center justify-center text-base transition-transform hover:scale-115 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReply(message);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
              >
                <Reply className="w-4 h-4 text-slate-500" />
                <span>Ответить</span>
              </button>

              {isOwn && message.kind === 'text' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onEdit(message);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-slate-500" />
                  <span>Редактировать</span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPin(message);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
              >
                <Pin className="w-4 h-4 text-slate-500" />
                <span>Закрепить</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onForward(message);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
              >
                <Forward className="w-4 h-4 text-slate-500" />
                <span>Переслать</span>
              </button>

              {message.text && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#242F3D] rounded-xl cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>{copied ? 'Скопировано' : 'Копировать текст'}</span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDelete(message);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reactions Bar */}
      {message.reactions.length > 0 && (
        <div
          className={`flex flex-wrap items-center gap-1 mt-1 ${
            isOwn ? 'justify-end' : 'justify-start'
          }`}
        >
          {message.reactions.map((reaction) => {
            const reactedByMe = reaction.userIds.includes(currentUserId);
            return (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message, reaction.emoji)}
                aria-label={`Реакция ${reaction.emoji}, выбрано ${reaction.userIds.length}`}
                aria-pressed={reactedByMe}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                  reactedByMe
                    ? 'text-white'
                    : 'bg-white/90 dark:bg-[#182533] text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#223244] shadow-2xs'
                }`}
                style={
                  reactedByMe ? { backgroundColor: 'var(--tg-accent)' } : undefined
                }
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.userIds.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
