import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStarterStickerPacks,
  DEFAULT_APP_SETTINGS,
} from '../data/seedData';
import {
  applyIdempotentMessageCreate,
  buildFullName,
  toggleReactionOnList,
} from '../utils/chatLogic';
import type {
  ActiveCallRoom,
  AppSettings,
  CallMode,
  CallSignalPayload,
  ChatMessage,
  ChatThread,
  ChatType,
  ClientWsEvent,
  MessageAttachment,
  MessageKind,
  PublicUserSummary,
  ServerWsEvent,
  StickerPack,
  TypingState,
  UserProfile,
} from '../types/telegram';

export interface TelegramSyncApi {
  connected: boolean;
  initialized: boolean;
  currentUser: UserProfile | null;
  settings: AppSettings;
  chats: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  stickerPacks: StickerPack[];
  activeCalls: ActiveCallRoom[];
  typingByChat: Record<string, TypingState | undefined>;
  onlineClientCount: number;
  directoryVersion: number;
  sendMessage: (params: {
    chatId: string;
    kind: MessageKind;
    text: string;
    replyToId?: string;
    forwardedFrom?: string;
    attachment?: MessageAttachment;
  }) => void;
  editMessage: (chatId: string, messageId: string, text: string) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  toggleReaction: (chatId: string, messageId: string, emoji: string) => void;
  pinMessage: (chatId: string, messageId: string | null) => void;
  markChatRead: (chatId: string) => void;
  updateChatFlags: (
    chatId: string,
    flags: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ) => void;
  clearChatHistory: (chatId: string) => void;
  createChat: (params: {
    type: ChatType;
    title: string;
    bio?: string;
    username?: string;
    avatarColor: string;
    targetUserId?: string;
    memberNames?: string[];
  }) => string;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  updateProfile: (params: {
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
  updateSettings: (next: AppSettings) => void;
  uploadFile: (file: File) => Promise<{ attachment?: MessageAttachment; error?: string }>;
  searchUsers: (query: string) => Promise<PublicUserSummary[]>;
  createStickerPack: (params: {
    title: string;
    slug: string;
    description: string;
  }) => Promise<{ pack?: StickerPack; error?: string }>;
  addStickerToPack: (
    packId: string,
    sticker: {
      emoji: string;
      label: string;
      imageUrl?: string;
      bgColor?: string;
      accentColor?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  removeStickerFromPack: (packId: string, stickerId: string) => Promise<void>;
  deleteStickerPack: (packId: string) => Promise<void>;
  startCall: (chatId: string, mode: CallMode) => void;
  joinCall: (callId: string, mode?: CallMode) => void;
  declineCall: (callId: string) => void;
  leaveCall: (callId: string) => void;
  sendCallSignal: (
    callId: string,
    targetUserId: string,
    signal: CallSignalPayload,
  ) => void;
  updateCallMediaState: (
    callId: string,
    state: { micMuted: boolean; videoEnabled: boolean; screenSharing: boolean },
  ) => void;
}

interface UseTelegramSocketOptions {
  token: string | null;
  initialUser: UserProfile | null;
  initialSettings?: AppSettings;
  onAuthExpired: () => void;
  onIncomingMessage?: (payload: { message: ChatMessage; chat: ChatThread }) => void;
  onIncomingCall?: (call: ActiveCallRoom) => void;
  onCallSignal?: (payload: {
    callId: string;
    fromUserId: string;
    signal: CallSignalPayload;
  }) => void;
  onCallEnded?: (payload: {
    callId: string;
    chatId: string;
    reason?: string;
  }) => void;
}

export function useTelegramSocket({
  token,
  initialUser,
  initialSettings,
  onAuthExpired,
  onIncomingMessage,
  onIncomingCall,
  onCallSignal,
  onCallEnded,
}: UseTelegramSocketOptions): TelegramSyncApi {
  const [connected, setConnected] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser);
  const [settings, setSettings] = useState<AppSettings>(
    initialSettings ?? DEFAULT_APP_SETTINGS,
  );
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>(createStarterStickerPacks);
  const [activeCalls, setActiveCalls] = useState<ActiveCallRoom[]>([]);
  const [typingByChat, setTypingByChat] = useState<
    Record<string, TypingState | undefined>
  >({});
  const [onlineClientCount, setOnlineClientCount] = useState(1);
  const [directoryVersion, setDirectoryVersion] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<ClientWsEvent[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const onAuthExpiredRef = useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;
  const onIncomingMessageRef = useRef(onIncomingMessage);
  onIncomingMessageRef.current = onIncomingMessage;
  const onIncomingCallRef = useRef(onIncomingCall);
  onIncomingCallRef.current = onIncomingCall;
  const onCallSignalRef = useRef(onCallSignal);
  onCallSignalRef.current = onCallSignal;
  const onCallEndedRef = useRef(onCallEnded);
  onCallEndedRef.current = onCallEnded;

  useEffect(() => {
    if (initialUser) setCurrentUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    if (initialSettings) setSettings({ ...DEFAULT_APP_SETTINGS, ...initialSettings });
  }, [initialSettings]);

  const dispatchWs = useCallback((event: ClientWsEvent) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    } else {
      pendingQueueRef.current.push(event);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      setInitialized(false);
      setChats([]);
      setMessagesByChat({});
      return;
    }

    let disposed = false;
    let reconnectAttempt = 0;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let pongTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearHeartbeat() {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (pongTimeout) {
        clearTimeout(pongTimeout);
        pongTimeout = null;
      }
    }

    function connect() {
      if (disposed || !token) return;
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        reconnectAttempt = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: 'client:auth', token } satisfies ClientWsEvent));
        while (pendingQueueRef.current.length > 0) {
          const queued = pendingQueueRef.current.shift();
          if (queued) socket.send(JSON.stringify(queued));
        }

        clearHeartbeat();
        pingInterval = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          try {
            socket.send(
              JSON.stringify({ type: 'client:ping', ts: Date.now() } satisfies ClientWsEvent),
            );
            if (pongTimeout) clearTimeout(pongTimeout);
            pongTimeout = setTimeout(() => {
              // Stale / half-open socket -> force immediate reconnect
              if (socket.readyState === WebSocket.OPEN) {
                socket.close();
              }
            }, 10_000);
          } catch {
            socket.close();
          }
        }, 20_000);
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerWsEvent;
          switch (msg.type) {
            case 'server:pong': {
              if (pongTimeout) {
                clearTimeout(pongTimeout);
                pongTimeout = null;
              }
              break;
            }
            case 'auth:error': {
              onAuthExpiredRef.current();
              break;
            }
            case 'sync:init': {
              setCurrentUser(msg.payload.currentUser);
              if (msg.payload.settings) {
                setSettings({
                  ...DEFAULT_APP_SETTINGS,
                  ...msg.payload.settings,
                  notifications: {
                    ...DEFAULT_APP_SETTINGS.notifications,
                    ...(msg.payload.settings.notifications ?? {}),
                  },
                  privacy: {
                    ...DEFAULT_APP_SETTINGS.privacy,
                    ...(msg.payload.settings.privacy ?? {}),
                  },
                  storage: {
                    ...DEFAULT_APP_SETTINGS.storage,
                    ...(msg.payload.settings.storage ?? {}),
                  },
                  updates: {
                    ...DEFAULT_APP_SETTINGS.updates!,
                    ...(msg.payload.settings.updates ?? {}),
                  },
                });
              }
              setChats(msg.payload.chats);
              setMessagesByChat(msg.payload.messagesByChat);
              setStickerPacks(msg.payload.stickerPacks);
              setActiveCalls(msg.payload.activeCalls ?? []);
              setOnlineClientCount(msg.payload.onlineClientCount);
              setDirectoryVersion((v) => v + 1);
              setInitialized(true);
              break;
            }
            case 'message:created': {
              const { message, chat } = msg.payload;
              setMessagesByChat((prev) => ({
                ...prev,
                [message.chatId]: applyIdempotentMessageCreate(
                  prev[message.chatId] ?? [],
                  message,
                ),
              }));
              setChats((prev) => {
                const exists = prev.some((c) => c.id === chat.id);
                if (!exists) return [chat, ...prev];
                return prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
              });
              // Clear typing indicator for the user who just sent the message
              setTypingByChat((prev) => {
                const current = prev[message.chatId];
                if (current && current.userId === message.senderId) {
                  const next = { ...prev };
                  delete next[message.chatId];
                  return next;
                }
                return prev;
              });
              if (
                currentUserRef.current &&
                message.senderId !== currentUserRef.current.id
              ) {
                onIncomingMessageRef.current?.({ message, chat });
              }
              break;
            }
            case 'message:updated': {
              const { message } = msg.payload;
              setMessagesByChat((prev) => ({
                ...prev,
                [message.chatId]: (prev[message.chatId] ?? []).map((m) =>
                  m.id === message.id ? message : m,
                ),
              }));
              break;
            }
            case 'message:deleted': {
              const { chatId, messageId, chat } = msg.payload;
              setMessagesByChat((prev) => ({
                ...prev,
                [chatId]: (prev[chatId] ?? []).filter((m) => m.id !== messageId),
              }));
              setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
              );
              break;
            }
            case 'messages:read': {
              const { chatId, messageIds, readerId } = msg.payload;
              const idSet = new Set(messageIds);
              setMessagesByChat((prev) => {
                const list = prev[chatId];
                if (!list || list.length === 0) return prev;
                let changed = false;
                const nextList = list.map((m) => {
                  if (!idSet.has(m.id)) return m;
                  changed = true;
                  const readBy = m.readBy ?? [];
                  return {
                    ...m,
                    status: 'read' as const,
                    readBy: readBy.includes(readerId) ? readBy : [...readBy, readerId],
                  };
                });
                return changed ? { ...prev, [chatId]: nextList } : prev;
              });
              break;
            }
            case 'chat:created': {
              const { chat, messages } = msg.payload;
              setChats((prev) => {
                const idx = prev.findIndex((c) => c.id === chat.id);
                if (idx >= 0) {
                  return prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
                }
                return [chat, ...prev];
              });
              setMessagesByChat((prev) => ({
                ...prev,
                [chat.id]: prev[chat.id]?.length ? prev[chat.id] : messages,
              }));
              break;
            }
            case 'chat:updated': {
              const { chat } = msg.payload;
              setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
              );
              break;
            }
            case 'chat:cleared': {
              const { chatId, chat } = msg.payload;
              setMessagesByChat((prev) => ({ ...prev, [chatId]: [] }));
              setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
              );
              break;
            }
            case 'typing:update': {
              const { chatId, userId, userName, isTyping } = msg.payload;
              if (currentUserRef.current && userId === currentUserRef.current.id) {
                break;
              }
              setTypingByChat((prev) => {
                if (!isTyping) {
                  const next = { ...prev };
                  delete next[chatId];
                  return next;
                }
                return {
                  ...prev,
                  [chatId]: {
                    chatId,
                    userId,
                    userName,
                    expiresAt: Date.now() + 4500,
                  },
                };
              });
              break;
            }
            case 'presence:update': {
              const { userId, online, lastSeenAt, lastSeenText } = msg.payload;
              const meId = currentUserRef.current?.id;
              setChats((prev) =>
                prev.map((chat) => {
                  if (
                    chat.type === 'private' &&
                    userId !== meId &&
                    chat.participantIds?.includes(userId)
                  ) {
                    return {
                      ...chat,
                      online,
                      lastSeenAt,
                      lastSeenText,
                    };
                  }
                  if (
                    chat.type === 'group' &&
                    chat.members?.some((m) => m.id === userId)
                  ) {
                    return {
                      ...chat,
                      members: chat.members.map((m) =>
                        m.id === userId
                          ? { ...m, online, lastSeenAt, lastSeenText }
                          : m,
                      ),
                    };
                  }
                  return chat;
                }),
              );
              setDirectoryVersion((v) => v + 1);
              break;
            }
            case 'user:profile_changed': {
              const { user } = msg.payload;
              const meId = currentUserRef.current?.id;
              setChats((prev) =>
                prev.map((chat) => {
                  if (
                    chat.type === 'private' &&
                    user.id !== meId &&
                    chat.participantIds?.includes(user.id)
                  ) {
                    return {
                      ...chat,
                      title: user.name,
                      username: user.username,
                      bio: user.bio,
                      phone: user.phone,
                      birthday: user.birthday,
                      city: user.city,
                      statusEmoji: user.statusEmoji,
                      avatarUrl: user.avatarUrl,
                      avatarColor: user.avatarColor,
                      profileAccent: user.profileAccent,
                      peerUserId: user.id,
                      createdAt: user.createdAt ?? chat.createdAt,
                      online: user.online,
                      lastSeenAt: user.lastSeenAt,
                      lastSeenText: user.lastSeenText,
                    };
                  }
                  if (
                    chat.type === 'group' &&
                    chat.members?.some((m) => m.id === user.id)
                  ) {
                    return {
                      ...chat,
                      members: chat.members.map((m) =>
                        m.id === user.id
                          ? {
                              ...m,
                              name: user.name,
                              username: user.username,
                              bio: user.bio,
                              phone: user.phone,
                              birthday: user.birthday,
                              city: user.city,
                              statusEmoji: user.statusEmoji,
                              avatarUrl: user.avatarUrl,
                              avatarColor: user.avatarColor,
                              profileAccent: user.profileAccent,
                              online: user.online,
                              lastSeenAt: user.lastSeenAt,
                              lastSeenText: user.lastSeenText,
                              createdAt: user.createdAt ?? m.createdAt,
                            }
                          : m,
                      ),
                    };
                  }
                  return chat;
                }),
              );
              setDirectoryVersion((v) => v + 1);
              break;
            }
            case 'directory:updated': {
              setDirectoryVersion((v) => v + 1);
              break;
            }
            case 'profile:updated': {
              const updatedUser = msg.payload.user;
              setCurrentUser(updatedUser);
              setChats((prev) =>
                prev.map((chat) =>
                  chat.type === 'saved'
                    ? {
                        ...chat,
                        username: updatedUser.username,
                        phone: updatedUser.phone,
                        birthday: updatedUser.birthday,
                        city: updatedUser.city,
                        statusEmoji: updatedUser.statusEmoji,
                        profileAccent: updatedUser.profileAccent,
                        createdAt: updatedUser.createdAt ?? chat.createdAt,
                      }
                    : chat,
                ),
              );
              break;
            }
            case 'settings:updated': {
              setSettings({ ...DEFAULT_APP_SETTINGS, ...msg.payload.settings });
              break;
            }
            case 'stickers:updated': {
              setStickerPacks(msg.payload.stickerPacks);
              break;
            }
            case 'presence:count': {
              setOnlineClientCount(msg.payload.onlineClientCount);
              break;
            }
            case 'call:incoming': {
              const { call } = msg.payload;
              setActiveCalls((prev) => {
                const idx = prev.findIndex((c) => c.callId === call.callId);
                if (idx >= 0) {
                  return prev.map((c) => (c.callId === call.callId ? call : c));
                }
                return [call, ...prev];
              });
              onIncomingCallRef.current?.(call);
              break;
            }
            case 'call:room_updated': {
              const { call } = msg.payload;
              setActiveCalls((prev) => {
                const idx = prev.findIndex((c) => c.callId === call.callId);
                if (idx >= 0) {
                  return prev.map((c) => (c.callId === call.callId ? call : c));
                }
                return [call, ...prev];
              });
              break;
            }
            case 'call:ended': {
              setActiveCalls((prev) =>
                prev.filter((c) => c.callId !== msg.payload.callId),
              );
              onCallEndedRef.current?.(msg.payload);
              break;
            }
            case 'call:signal': {
              onCallSignalRef.current?.(msg.payload);
              break;
            }
          }
        } catch (err) {
          console.warn('Failed to parse server event:', err);
        }
      };

      socket.onclose = () => {
        clearHeartbeat();
        if (disposed) return;
        setConnected(false);
        const delay = Math.min(4000, 700 + reconnectAttempt * 600);
        reconnectAttempt += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    const ensureConnected = () => {
      if (disposed) return;
      const socket = wsRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        connect();
      } else if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({ type: 'client:ping', ts: Date.now() } satisfies ClientWsEvent),
          );
        } catch {
          socket.close();
        }
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) ensureConnected();
    };

    window.addEventListener('online', ensureConnected);
    window.addEventListener('focus', ensureConnected);
    document.addEventListener('visibilitychange', handleVisibility);

    connect();

    return () => {
      disposed = true;
      clearHeartbeat();
      window.removeEventListener('online', ensureConnected);
      window.removeEventListener('focus', ensureConnected);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingByChat((prev) => {
        let changed = false;
        const next: Record<string, TypingState | undefined> = {};
        for (const [chatId, state] of Object.entries(prev)) {
          if (state && state.expiresAt > now) {
            next[chatId] = state;
          } else if (state) {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sendMessage = useCallback<TelegramSyncApi['sendMessage']>(
    ({ chatId, kind, text, replyToId, forwardedFrom, attachment }) => {
      const me = currentUserRef.current;
      if (!me) return;
      const targetChat = chatsRef.current.find((c) => c.id === chatId);
      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();
      const optimistic: ChatMessage = {
        id,
        chatId,
        senderId: me.id,
        senderName: me.name,
        senderColor: me.profileAccent,
        kind,
        text: text.trim(),
        createdAt: nowIso,
        status: targetChat?.type === 'saved' ? 'read' : 'sent',
        readBy: [me.id],
        replyToId,
        forwardedFrom,
        reactions: [],
        attachment,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: applyIdempotentMessageCreate(prev[chatId] ?? [], optimistic),
      }));
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, lastMessageAt: nowIso, archived: false } : c,
        ),
      );

      dispatchWs({
        type: 'message:send',
        payload: {
          id,
          chatId,
          senderId: me.id,
          senderName: me.name,
          kind,
          text: optimistic.text,
          replyToId,
          forwardedFrom,
          attachment,
        },
      });
    },
    [dispatchWs],
  );

  const editMessage = useCallback(
    (chatId: string, messageId: string, text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      const editedAt = new Date().toISOString();
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).map((m) =>
          m.id === messageId ? { ...m, text: cleaned, editedAt } : m,
        ),
      }));
      dispatchWs({
        type: 'message:edit',
        payload: { chatId, messageId, text: cleaned },
      });
    },
    [dispatchWs],
  );

  const deleteMessage = useCallback(
    (chatId: string, messageId: string) => {
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).filter((m) => m.id !== messageId),
      }));
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId && c.pinnedMessageId === messageId
            ? { ...c, pinnedMessageId: null }
            : c,
        ),
      );
      dispatchWs({
        type: 'message:delete',
        payload: { chatId, messageId },
      });
    },
    [dispatchWs],
  );

  const toggleReaction = useCallback(
    (chatId: string, messageId: string, emoji: string) => {
      const userId = currentUserRef.current?.id;
      if (!userId) return;
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: toggleReactionOnList(m.reactions, emoji, userId),
              }
            : m,
        ),
      }));
      dispatchWs({
        type: 'message:react',
        payload: { chatId, messageId, emoji, userId },
      });
    },
    [dispatchWs],
  );

  const pinMessage = useCallback(
    (chatId: string, messageId: string | null) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, pinnedMessageId: messageId } : c,
        ),
      );
      dispatchWs({
        type: 'chat:pin_message',
        payload: { chatId, messageId },
      });
    },
    [dispatchWs],
  );

  const markChatRead = useCallback(
    (chatId: string) => {
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
      );
      dispatchWs({
        type: 'chat:mark_read',
        payload: { chatId },
      });
    },
    [dispatchWs],
  );

  const updateChatFlags = useCallback(
    (
      chatId: string,
      flags: { pinned?: boolean; muted?: boolean; archived?: boolean },
    ) => {
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, ...flags } : c)),
      );
      dispatchWs({
        type: 'chat:update_flags',
        payload: { chatId, ...flags },
      });
    },
    [dispatchWs],
  );

  const clearChatHistory = useCallback(
    (chatId: string) => {
      setMessagesByChat((prev) => ({ ...prev, [chatId]: [] }));
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, pinnedMessageId: null, unreadCount: 0 } : c,
        ),
      );
      dispatchWs({
        type: 'chat:clear_history',
        payload: { chatId },
      });
    },
    [dispatchWs],
  );

  const createChat = useCallback<TelegramSyncApi['createChat']>(
    ({ type, title, bio, username, avatarColor, targetUserId, memberNames }) => {
      const me = currentUserRef.current;
      if (type === 'private' && targetUserId && me) {
        const existing = chatsRef.current.find(
          (c) =>
            c.type === 'private' &&
            c.participantIds &&
            c.participantIds.includes(me.id) &&
            c.participantIds.includes(targetUserId),
        );
        if (existing) {
          return existing.id;
        }
      }

      const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();
      const optimisticChat: ChatThread = {
        id,
        type,
        title: title.trim(),
        bio: bio?.trim() || undefined,
        username: username?.trim() || undefined,
        avatarColor,
        ownerId: me?.id,
        participantIds: targetUserId && me ? [me.id, targetUserId] : me ? [me.id] : [],
        online: false,
        lastSeenText: type === 'private' ? 'был(а) недавно' : undefined,
        memberCount:
          type === 'group'
            ? 1 + (memberNames?.length ?? 0)
            : type === 'channel'
              ? 1
              : undefined,
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        canPost: true,
        lastMessageAt: nowIso,
      };

      setChats((prev) => [optimisticChat, ...prev]);
      setMessagesByChat((prev) => ({ ...prev, [id]: [] }));

      dispatchWs({
        type: 'chat:create',
        payload: {
          id,
          type,
          title,
          bio,
          username,
          avatarColor,
          targetUserId,
          memberNames,
        },
      });

      return id;
    },
    [dispatchWs],
  );

  const sendTyping = useCallback(
    (chatId: string, isTyping: boolean) => {
      const me = currentUserRef.current;
      if (!me) return;
      dispatchWs({
        type: 'typing:set',
        payload: {
          chatId,
          userId: me.id,
          userName: me.name,
          isTyping,
        },
      });
    },
    [dispatchWs],
  );

  const updateProfile = useCallback<TelegramSyncApi['updateProfile']>(
    (params) => {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              ...params,
              name: buildFullName(params.firstName, params.lastName),
              username: params.username.startsWith('@')
                ? params.username
                : `@${params.username}`,
            }
          : prev,
      );
      dispatchWs({
        type: 'profile:update',
        payload: params,
      });
    },
    [dispatchWs],
  );

  const updateSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      dispatchWs({
        type: 'settings:update',
        payload: next,
      });
    },
    [dispatchWs],
  );

  const uploadFile = useCallback<TelegramSyncApi['uploadFile']>(
    async (file: File) => {
      if (!token) return { error: 'Требуется вход' };
      try {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataBase64,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { error: data.error || 'Не удалось загрузить файл' };
        }
        return { attachment: data as MessageAttachment };
      } catch (err: any) {
        return { error: err?.message || 'Ошибка загрузки файла' };
      }
    },
    [token],
  );

  const searchUsers = useCallback<TelegramSyncApi['searchUsers']>(
    async (query: string) => {
      if (!token) return [];
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.users) ? (data.users as PublicUserSummary[]) : [];
      } catch {
        return [];
      }
    },
    [token],
  );

  const createStickerPack = useCallback<TelegramSyncApi['createStickerPack']>(
    async (params) => {
      if (!token) return { error: 'Требуется вход' };
      try {
        const res = await fetch('/api/stickers/packs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || 'Не удалось создать стикерпак' };
        if (Array.isArray(data.stickerPacks)) setStickerPacks(data.stickerPacks);
        return { pack: data.pack as StickerPack };
      } catch {
        return { error: 'Ошибка сети при создании стикерпака' };
      }
    },
    [token],
  );

  const addStickerToPack = useCallback<TelegramSyncApi['addStickerToPack']>(
    async (packId, sticker) => {
      if (!token) return { ok: false, error: 'Требуется вход' };
      try {
        const res = await fetch(`/api/stickers/packs/${packId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(sticker),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'Не удалось добавить стикер' };
        if (Array.isArray(data.stickerPacks)) setStickerPacks(data.stickerPacks);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Ошибка сети при сохранении стикера' };
      }
    },
    [token],
  );

  const removeStickerFromPack = useCallback(
    async (packId: string, stickerId: string) => {
      if (!token) return;
      const res = await fetch(`/api/stickers/packs/${packId}/items/${stickerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stickerPacks)) setStickerPacks(data.stickerPacks);
      }
    },
    [token],
  );

  const deleteStickerPack = useCallback(
    async (packId: string) => {
      if (!token) return;
      const res = await fetch(`/api/stickers/packs/${packId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stickerPacks)) setStickerPacks(data.stickerPacks);
      }
    },
    [token],
  );

  const startCall = useCallback(
    (chatId: string, mode: CallMode) => {
      dispatchWs({ type: 'call:start', payload: { chatId, mode } });
    },
    [dispatchWs],
  );

  const joinCall = useCallback(
    (callId: string, mode?: CallMode) => {
      dispatchWs({ type: 'call:join', payload: { callId, mode } });
    },
    [dispatchWs],
  );

  const declineCall = useCallback(
    (callId: string) => {
      dispatchWs({ type: 'call:decline', payload: { callId } });
    },
    [dispatchWs],
  );

  const leaveCall = useCallback(
    (callId: string) => {
      dispatchWs({ type: 'call:leave', payload: { callId } });
    },
    [dispatchWs],
  );

  const sendCallSignal = useCallback(
    (callId: string, targetUserId: string, signal: CallSignalPayload) => {
      dispatchWs({
        type: 'call:signal',
        payload: { callId, targetUserId, signal },
      });
    },
    [dispatchWs],
  );

  const updateCallMediaState = useCallback(
    (
      callId: string,
      state: { micMuted: boolean; videoEnabled: boolean; screenSharing: boolean },
    ) => {
      dispatchWs({
        type: 'call:media_state',
        payload: { callId, ...state },
      });
    },
    [dispatchWs],
  );

  return {
    connected,
    initialized,
    currentUser,
    settings,
    chats,
    messagesByChat,
    stickerPacks,
    activeCalls,
    typingByChat,
    onlineClientCount,
    directoryVersion,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    pinMessage,
    markChatRead,
    updateChatFlags,
    clearChatHistory,
    createChat,
    sendTyping,
    updateProfile,
    updateSettings,
    uploadFile,
    searchUsers,
    createStickerPack,
    addStickerToPack,
    removeStickerFromPack,
    deleteStickerPack,
    startCall,
    joinCall,
    declineCall,
    leaveCall,
    sendCallSignal,
    updateCallMediaState,
  };
}
