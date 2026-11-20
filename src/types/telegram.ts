export type ChatType = 'private' | 'group' | 'channel' | 'saved';

export type ChatFolder = 'all' | 'private' | 'groups' | 'channels';

export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'sticker';

export type PrivacyAudience = 'everybody' | 'contacts' | 'nobody';

export type FileRetentionPolicy = 'permanent' | '5_days' | '1_day';

export interface NotificationSettings {
  privateChats: boolean;
  groups: boolean;
  channels: boolean;
  soundEnabled: boolean;
  showPreview: boolean;
}

export interface PrivacySettings {
  lastSeen: PrivacyAudience;
  profilePhoto: PrivacyAudience;
  birthday: PrivacyAudience;
  groupInvites: 'everybody' | 'contacts';
  readReceipts: boolean;
}

export interface StorageSettings {
  autoDownloadPhotos: boolean;
  autoDownloadFiles: boolean;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  accentColor: string;
  wallpaper: 'pattern' | 'minimal' | 'graphite' | 'ocean';
  fontSize: 'small' | 'normal' | 'large';
  bubbleRadius: 'compact' | 'standard' | 'soft';
  sendByEnter: boolean;
  largeEmoji: boolean;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  storage: StorageSettings;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  username: string; // @username
  bio: string;
  phone: string;
  birthday: string;
  city: string;
  statusEmoji: string;
  avatarUrl?: string;
  avatarColor: string;
  profileAccent: string;
  online: boolean;
  lastSeen: string;
}

export interface PublicUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  username: string;
  bio: string;
  avatarUrl?: string;
  avatarColor: string;
  statusEmoji: string;
  online: boolean;
}

export interface ChatMember {
  id: string;
  name: string;
  username: string;
  role?: 'owner' | 'admin' | 'member';
  avatarUrl?: string;
  avatarColor: string;
  online: boolean;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface MessageAttachment {
  url: string;
  name: string;
  fileId?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  mimeType?: string;
  expiresAt?: string | null;
  retentionPolicy?: FileRetentionPolicy;
  durationSec?: number;
  waveform?: number[];
  stickerCode?: string;
  stickerLabel?: string;
  stickerEmoji?: string;
  stickerPackId?: string;
  stickerImageUrl?: string;
  stickerBg?: string;
  stickerAccent?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderColor?: string;
  kind: MessageKind;
  text: string;
  createdAt: string;
  editedAt?: string;
  status: 'sent' | 'read';
  replyToId?: string;
  forwardedFrom?: string;
  reactions: MessageReaction[];
  attachment?: MessageAttachment;
}

export interface ChatThread {
  id: string;
  type: ChatType;
  title: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  avatarColor: string;
  verified?: boolean;
  online?: boolean;
  lastSeenText?: string;
  ownerId?: string;
  participantIds?: string[];
  memberCount?: number;
  members?: ChatMember[];
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  unreadCount: number;
  pinnedMessageId?: string | null;
  canPost?: boolean;
  draft?: string;
  lastMessageAt: string;
}

export interface CustomSticker {
  id: string;
  packId: string;
  emoji: string;
  label: string;
  imageUrl?: string;
  bgColor?: string;
  accentColor?: string;
  createdAt: string;
}

export interface StickerPack {
  id: string;
  slug: string;
  title: string;
  description: string;
  authorId: string;
  authorName: string;
  isSystem?: boolean;
  stickers: CustomSticker[];
  createdAt: string;
}

export interface ServerStateSnapshot {
  currentUser: UserProfile;
  settings?: AppSettings;
  chats: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  stickerPacks: StickerPack[];
  onlineClientCount: number;
}

export interface TypingState {
  chatId: string;
  userId: string;
  userName: string;
  expiresAt: number;
}

export type ClientWsEvent =
  | { type: 'client:auth'; token: string }
  | {
      type: 'message:send';
      payload: {
        id: string;
        chatId: string;
        senderId: string;
        senderName: string;
        kind: MessageKind;
        text: string;
        replyToId?: string;
        forwardedFrom?: string;
        attachment?: MessageAttachment;
      };
    }
  | {
      type: 'message:edit';
      payload: { chatId: string; messageId: string; text: string };
    }
  | {
      type: 'message:delete';
      payload: { chatId: string; messageId: string };
    }
  | {
      type: 'message:react';
      payload: { chatId: string; messageId: string; emoji: string; userId: string };
    }
  | {
      type: 'chat:pin_message';
      payload: { chatId: string; messageId: string | null };
    }
  | {
      type: 'chat:mark_read';
      payload: { chatId: string };
    }
  | {
      type: 'chat:update_flags';
      payload: {
        chatId: string;
        pinned?: boolean;
        muted?: boolean;
        archived?: boolean;
      };
    }
  | {
      type: 'chat:clear_history';
      payload: { chatId: string };
    }
  | {
      type: 'chat:create';
      payload: {
        id: string;
        type: ChatType;
        title: string;
        bio?: string;
        username?: string;
        avatarColor: string;
        targetUserId?: string;
        memberNames?: string[];
      };
    }
  | {
      type: 'typing:set';
      payload: { chatId: string; userId: string; userName: string; isTyping: boolean };
    }
  | {
      type: 'profile:update';
      payload: {
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
      };
    }
  | {
      type: 'settings:update';
      payload: AppSettings;
    };

export type ServerWsEvent =
  | { type: 'sync:init'; payload: ServerStateSnapshot }
  | { type: 'auth:error'; payload: { message: string } }
  | { type: 'message:created'; payload: { message: ChatMessage; chat: ChatThread } }
  | { type: 'message:updated'; payload: { message: ChatMessage } }
  | {
      type: 'message:deleted';
      payload: { chatId: string; messageId: string; chat: ChatThread };
    }
  | { type: 'chat:created'; payload: { chat: ChatThread; messages: ChatMessage[] } }
  | { type: 'chat:updated'; payload: { chat: ChatThread } }
  | { type: 'chat:cleared'; payload: { chatId: string; chat: ChatThread } }
  | {
      type: 'typing:update';
      payload: { chatId: string; userId: string; userName: string; isTyping: boolean };
    }
  | { type: 'profile:updated'; payload: { user: UserProfile } }
  | { type: 'settings:updated'; payload: { settings: AppSettings } }
  | { type: 'stickers:updated'; payload: { stickerPacks: StickerPack[] } }
  | { type: 'presence:count'; payload: { onlineClientCount: number } };
