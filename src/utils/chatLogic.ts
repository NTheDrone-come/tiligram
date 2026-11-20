import type {
  ChatFolder,
  ChatMessage,
  ChatThread,
  ChatType,
  MessageReaction,
} from '../types/telegram.ts';

export interface CreateChatValidationResult {
  valid: boolean;
  error?: string;
  normalizedTitle: string;
  normalizedUsername?: string;
}

export interface GlobalMessageMatch {
  chat: ChatThread;
  message: ChatMessage;
}

export interface SharedItemsSummary {
  media: ChatMessage[];
  files: ChatMessage[];
  voice: ChatMessage[];
  links: Array<{
    messageId: string;
    url: string;
    senderName: string;
    createdAt: string;
  }>;
}

export interface ChatProfileStats {
  totalMessages: number;
  ownMessages: number;
  peerMessages: number;
  mediaCount: number;
  filesCount: number;
  voiceCount: number;
  stickersCount: number;
  linksCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export function buildFullName(firstName: string, lastName?: string): string {
  return [firstName.trim(), (lastName ?? '').trim()].filter(Boolean).join(' ');
}

export function validateUsername(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const cleaned = raw.trim().replace(/^@+/, '').toLowerCase();
  if (!cleaned) {
    return { valid: false, normalized: '', error: 'Введите юзернейм на английском' };
  }
  if (cleaned.length < 4 || cleaned.length > 32) {
    return {
      valid: false,
      normalized: cleaned,
      error: 'Юзернейм должен содержать от 4 до 32 символов',
    };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      error: 'Только латинские буквы, цифры и _, начинаться должен с буквы',
    };
  }
  return { valid: true, normalized: cleaned };
}

export function validateRegistrationInput(input: {
  firstName: string;
  lastName?: string;
  username: string;
  password: string;
  confirmPassword?: string;
}): {
  valid: boolean;
  error?: string;
  firstName: string;
  lastName: string;
  username: string;
} {
  const firstName = input.firstName.trim();
  const lastName = (input.lastName ?? '').trim();

  if (firstName.length < 2) {
    return {
      valid: false,
      error: 'Имя должно содержать минимум 2 символа',
      firstName,
      lastName,
      username: '',
    };
  }
  if (firstName.length > 48 || lastName.length > 48) {
    return {
      valid: false,
      error: 'Имя и фамилия не должны превышать 48 символов',
      firstName,
      lastName,
      username: '',
    };
  }

  const uCheck = validateUsername(input.username);
  if (!uCheck.valid) {
    return {
      valid: false,
      error: uCheck.error,
      firstName,
      lastName,
      username: uCheck.normalized,
    };
  }

  if (input.password.length < 6) {
    return {
      valid: false,
      error: 'Пароль должен содержать минимум 6 символов',
      firstName,
      lastName,
      username: uCheck.normalized,
    };
  }

  if (
    input.confirmPassword !== undefined &&
    input.password !== input.confirmPassword
  ) {
    return {
      valid: false,
      error: 'Пароли не совпадают',
      firstName,
      lastName,
      username: uCheck.normalized,
    };
  }

  return {
    valid: true,
    firstName,
    lastName,
    username: uCheck.normalized,
  };
}

export function validateStickerPackInput(input: {
  title: string;
  slug: string;
}): {
  valid: boolean;
  error?: string;
  normalizedTitle: string;
  normalizedSlug: string;
} {
  const title = input.title.trim();
  const slug = input.slug.trim().replace(/^@+/, '').toLowerCase();

  if (title.length < 2 || title.length > 40) {
    return {
      valid: false,
      error: 'Название стикерпака — от 2 до 40 символов',
      normalizedTitle: title,
      normalizedSlug: slug,
    };
  }
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(slug)) {
    return {
      valid: false,
      error: 'Адрес пака: 3–32 символа на английском (a-z, 0-9, _), с буквы',
      normalizedTitle: title,
      normalizedSlug: slug,
    };
  }
  return { valid: true, normalizedTitle: title, normalizedSlug: slug };
}

export function sortChats(chats: ChatThread[]): ChatThread[] {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export function matchesFolder(chat: ChatThread, folder: ChatFolder): boolean {
  if (folder === 'all') return true;
  if (folder === 'private') return chat.type === 'private' || chat.type === 'saved';
  if (folder === 'groups') return chat.type === 'group';
  if (folder === 'channels') return chat.type === 'channel';
  return true;
}

export function filterChats(
  chats: ChatThread[],
  folder: ChatFolder,
  searchQuery: string,
  showArchived: boolean,
): ChatThread[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filtered = chats.filter((chat) => {
    if (showArchived) {
      if (!chat.archived) return false;
    } else if (chat.archived && !normalizedQuery) {
      return false;
    }

    if (!normalizedQuery && !showArchived && !matchesFolder(chat, folder)) {
      return false;
    }

    if (!normalizedQuery) return true;

    const inTitle = chat.title.toLowerCase().includes(normalizedQuery);
    const inUsername = chat.username?.toLowerCase().includes(normalizedQuery) ?? false;
    const inBio = chat.bio?.toLowerCase().includes(normalizedQuery) ?? false;
    return inTitle || inUsername || inBio;
  });

  return sortChats(filtered);
}

export function getUnreadCountByFolder(
  chats: ChatThread[],
): Record<ChatFolder, number> {
  const counts: Record<ChatFolder, number> = {
    all: 0,
    private: 0,
    groups: 0,
    channels: 0,
  };

  for (const chat of chats) {
    if (chat.archived || chat.unreadCount <= 0) continue;
    counts.all += chat.unreadCount;
    if (chat.type === 'private' || chat.type === 'saved') {
      counts.private += chat.unreadCount;
    } else if (chat.type === 'group') {
      counts.groups += chat.unreadCount;
    } else if (chat.type === 'channel') {
      counts.channels += chat.unreadCount;
    }
  }

  return counts;
}

export function searchMessagesInChat(
  messages: ChatMessage[],
  query: string,
): ChatMessage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return messages.filter(
    (msg) =>
      msg.text.toLowerCase().includes(q) ||
      (msg.attachment?.name?.toLowerCase().includes(q) ?? false) ||
      msg.senderName.toLowerCase().includes(q),
  );
}

export function searchMessagesGlobally(
  chats: ChatThread[],
  messagesByChat: Record<string, ChatMessage[]>,
  query: string,
  limit = 15,
): GlobalMessageMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const chatMap = new Map(chats.map((c) => [c.id, c]));
  const matches: GlobalMessageMatch[] = [];

  for (const [chatId, msgs] of Object.entries(messagesByChat)) {
    const chat = chatMap.get(chatId);
    if (!chat) continue;
    for (const msg of msgs) {
      if (
        msg.text.toLowerCase().includes(q) ||
        (msg.attachment?.name?.toLowerCase().includes(q) ?? false)
      ) {
        matches.push({ chat, message: msg });
      }
    }
  }

  matches.sort(
    (a, b) =>
      new Date(b.message.createdAt).getTime() -
      new Date(a.message.createdAt).getTime(),
  );

  return matches.slice(0, limit);
}

export function applyIdempotentMessageCreate(
  existing: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const idx = existing.findIndex((m) => m.id === incoming.id);
  if (idx !== -1) {
    const updated = [...existing];
    updated[idx] = incoming;
    return updated;
  }
  return [...existing, incoming];
}

export function toggleReactionOnList(
  reactions: MessageReaction[],
  emoji: string,
  userId: string,
): MessageReaction[] {
  const next: MessageReaction[] = reactions.map((r) => ({
    emoji: r.emoji,
    userIds: [...r.userIds],
  }));

  const targetIdx = next.findIndex((r) => r.emoji === emoji);
  if (targetIdx === -1) {
    next.push({ emoji, userIds: [userId] });
    return next;
  }

  const entry = next[targetIdx];
  const userIdx = entry.userIds.indexOf(userId);
  if (userIdx === -1) {
    entry.userIds.push(userId);
  } else {
    entry.userIds.splice(userIdx, 1);
  }

  return next.filter((r) => r.userIds.length > 0);
}

export function validateCreateChatInput(input: {
  title: string;
  type: ChatType;
  username?: string;
}): CreateChatValidationResult {
  const normalizedTitle = input.title.trim();
  if (normalizedTitle.length < 2) {
    return {
      valid: false,
      error: 'Введите название длиной не менее 2 символов',
      normalizedTitle,
    };
  }
  if (normalizedTitle.length > 64) {
    return {
      valid: false,
      error: 'Название не должно превышать 64 символа',
      normalizedTitle,
    };
  }

  let normalizedUsername = input.username?.trim();
  if (normalizedUsername) {
    if (!normalizedUsername.startsWith('@')) {
      normalizedUsername = `@${normalizedUsername}`;
    }
    if (!/^@[a-zA-Z0-9_]{3,32}$/.test(normalizedUsername)) {
      return {
        valid: false,
        error: 'Имя пользователя: латиница, цифры и _ (3–32 символа)',
        normalizedTitle,
      };
    }
  } else {
    normalizedUsername = undefined;
  }

  return {
    valid: true,
    normalizedTitle,
    normalizedUsername,
  };
}

export function validateProfileInput(input: {
  firstName: string;
  lastName?: string;
  username: string;
  bio: string;
}): {
  valid: boolean;
  error?: string;
  normalizedFirstName: string;
  normalizedLastName: string;
  normalizedUsername: string;
} {
  const normalizedFirstName = input.firstName.trim();
  const normalizedLastName = (input.lastName ?? '').trim();

  if (normalizedFirstName.length < 2) {
    return {
      valid: false,
      error: 'Имя должно содержать минимум 2 символа',
      normalizedFirstName,
      normalizedLastName,
      normalizedUsername: '',
    };
  }

  const uCheck = validateUsername(input.username);
  if (!uCheck.valid) {
    return {
      valid: false,
      error: uCheck.error,
      normalizedFirstName,
      normalizedLastName,
      normalizedUsername: uCheck.normalized,
    };
  }

  if (input.bio.trim().length > 140) {
    return {
      valid: false,
      error: 'Описание профиля не должно превышать 140 символов',
      normalizedFirstName,
      normalizedLastName,
      normalizedUsername: `@${uCheck.normalized}`,
    };
  }

  return {
    valid: true,
    normalizedFirstName,
    normalizedLastName,
    normalizedUsername: `@${uCheck.normalized}`,
  };
}

export function extractSharedItems(messages: ChatMessage[]): SharedItemsSummary {
  const media: ChatMessage[] = [];
  const files: ChatMessage[] = [];
  const voice: ChatMessage[] = [];
  const links: SharedItemsSummary['links'] = [];
  const urlRegex = /https?:\/\/[^\s<>()]+/gi;

  for (const msg of [...messages].reverse()) {
    if (msg.kind === 'image' && msg.attachment) {
      media.push(msg);
    } else if (msg.kind === 'file' && msg.attachment) {
      files.push(msg);
    } else if (msg.kind === 'voice') {
      voice.push(msg);
    }

    const foundUrls = msg.text.match(urlRegex);
    if (foundUrls) {
      for (const url of foundUrls) {
        links.push({
          messageId: msg.id,
          url,
          senderName: msg.senderName,
          createdAt: msg.createdAt,
        });
      }
    }
  }

  return { media, files, voice, links };
}

export function getMessagePreviewText(message: ChatMessage | undefined): string {
  if (!message) return 'Нет сообщений';
  if (message.kind === 'image') {
    return message.text ? `Фото: ${message.text}` : 'Фотография';
  }
  if (message.kind === 'file') {
    return `Файл: ${message.attachment?.name ?? 'Документ'}`;
  }
  if (message.kind === 'voice') {
    const sec = message.attachment?.durationSec ?? 0;
    return `Голосовое сообщение (${formatDuration(sec)})`;
  }
  if (message.kind === 'sticker') {
    return `Стикер · ${message.attachment?.stickerLabel ?? 'Стикер'}`;
  }
  return message.text || 'Сообщение';
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatChatListTime(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffDays === 0) {
    return formatMessageTime(isoDate);
  }
  if (diffDays === 1) {
    return 'Вчера';
  }
  if (diffDays > 1 && diffDays < 7) {
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export function formatDateDivider(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function getInitials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function formatLastSeen(
  lastSeenAt?: string | null,
  online?: boolean,
  hidden = false,
  now: Date = new Date(),
): string {
  if (hidden) return 'был(а) недавно';
  if (online) return 'в сети';
  if (!lastSeenAt) return 'был(а) недавно';

  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return 'был(а) недавно';

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'был(а) только что';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `был(а) ${diffMin} мин. назад`;

  const timeStr = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return `был(а) сегодня в ${timeStr}`;
  if (diffDays === 1) return `был(а) вчера в ${timeStr}`;

  const dateStr = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
  return `был(а) ${dateStr} в ${timeStr}`;
}

function pluralizeYearsRu(years: number): string {
  const abs = Math.abs(years) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return `${years} лет`;
  if (last === 1) return `${years} год`;
  if (last >= 2 && last <= 4) return `${years} года`;
  return `${years} лет`;
}

export function formatBirthdayWithAge(
  birthday?: string | null,
  now: Date = new Date(),
): string | null {
  const raw = (birthday ?? '').trim();
  if (!raw) return null;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ruMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (ruMatch) {
    day = Number(ruMatch[1]);
    month = Number(ruMatch[2]);
    year = Number(ruMatch[3]);
  }

  if (
    year === null ||
    month === null ||
    day === null ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return raw;
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return raw;
  }

  const formattedDate = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1;
  }

  if (age > 0 && age < 130) {
    return `${formattedDate} · ${pluralizeYearsRu(age)}`;
  }
  return formattedDate;
}

export function formatMemberSince(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function computeChatProfileStats(
  messages: ChatMessage[],
  currentUserId?: string,
): ChatProfileStats {
  const shared = extractSharedItems(messages);
  let ownMessages = 0;
  let peerMessages = 0;
  let stickersCount = 0;

  for (const msg of messages) {
    if (currentUserId && msg.senderId === currentUserId) {
      ownMessages += 1;
    } else {
      peerMessages += 1;
    }
    if (msg.kind === 'sticker') {
      stickersCount += 1;
    }
  }

  return {
    totalMessages: messages.length,
    ownMessages,
    peerMessages,
    mediaCount: shared.media.length,
    filesCount: shared.files.length,
    voiceCount: shared.voice.length,
    stickersCount,
    linksCount: shared.links.length,
    firstMessageAt: messages.length > 0 ? messages[0].createdAt : null,
    lastMessageAt: messages.length > 0 ? messages[messages.length - 1].createdAt : null,
  };
}

export function findCommonGroups(
  chats: ChatThread[],
  peerUserId?: string | null,
): ChatThread[] {
  if (!peerUserId) return [];
  return chats.filter(
    (c) =>
      c.type === 'group' &&
      (c.participantIds?.includes(peerUserId) ||
        c.members?.some((m) => m.id === peerUserId)),
  );
}
