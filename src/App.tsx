import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Send, X } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CallOverlay } from './components/CallOverlay';
import { ChatInfoPanel } from './components/ChatInfoPanel';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatWindow } from './components/ChatWindow';
import {
  CreateChatModal,
  ForwardModal,
  PhotoLightbox,
} from './components/Modals';
import { NavigationDrawer } from './components/NavigationDrawer';
import {
  NotificationPopups,
  type TelegramPopupNotification,
} from './components/NotificationPopups';
import { OfflineIndicator } from './components/PWAInstallButton';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal';
import { StickerStudioModal } from './components/StickerStudioModal';
import { DEFAULT_APP_SETTINGS } from './data/seedData';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useTelegramSocket } from './hooks/useTelegramSocket';
import { useWebRTCCall } from './hooks/useWebRTCCall';
import { playMessageNotificationSound } from './utils/sounds';
import type {
  ActiveCallRoom,
  AppSettings,
  CallSignalPayload,
  ChatFolder,
  ChatMember,
  ChatMessage,
  ChatThread,
  ChatType,
  CustomSticker,
  UserProfile,
} from './types/telegram';

const AUTH_TOKEN_KEY = 'tiligram-auth-token-v1';

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [checkingAuth, setCheckingAuth] = useState<boolean>(() => Boolean(authToken));
  const [initialUser, setInitialUser] = useState<UserProfile | null>(null);
  const [initialSettings, setInitialSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS,
  );

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [folder, setFolder] = useState<ChatFolder>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createModal, setCreateModal] = useState<{ open: boolean; type: ChatType }>({
    open: false,
    type: 'private',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('profile');
  const [stickerStudioOpen, setStickerStudioOpen] = useState(false);
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string } | null>(
    null,
  );
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [popups, setPopups] = useState<TelegramPopupNotification[]>([]);

  const activeChatIdRef = useRef<string | null>(activeChatId);
  activeChatIdRef.current = activeChatId;

  const settingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const callHandlersRef = useRef<{
    onIncomingCall: (call: ActiveCallRoom) => void;
    onCallSignal: (payload: {
      callId: string;
      fromUserId: string;
      signal: CallSignalPayload;
    }) => void;
    onCallEnded: (payload: {
      callId: string;
      chatId: string;
      reason?: string;
    }) => void;
  }>({
    onIncomingCall: () => {},
    onCallSignal: () => {},
    onCallEnded: () => {},
  });

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
    setAuthToken(null);
    setInitialUser(null);
    setActiveChatId(null);
    setDrawerOpen(false);
    setSettingsOpen(false);
    setStickerStudioOpen(false);
    setPopups([]);
  }, []);

  // Verify saved session token on initial load
  useEffect(() => {
    if (!authToken) {
      setCheckingAuth(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            handleLogout();
            setCheckingAuth(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setInitialUser(data.user as UserProfile);
          if (data.settings) {
            setInitialSettings({
              ...DEFAULT_APP_SETTINGS,
              ...data.settings,
              notifications: {
                ...DEFAULT_APP_SETTINGS.notifications,
                ...(data.settings.notifications ?? {}),
              },
              updates: {
                ...DEFAULT_APP_SETTINGS.updates!,
                ...(data.settings.updates ?? {}),
              },
            });
          }
          setCheckingAuth(false);
        }
      } catch {
        if (!cancelled) {
          setCheckingAuth(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, handleLogout]);

  const dispatchPopupNotification = useCallback(
    (item: TelegramPopupNotification, force = false) => {
      const cfg = settingsRef.current.notifications;
      if (!force && cfg.desktopPopups === false) return;

      if (cfg.soundEnabled) {
        playMessageNotificationSound();
      }

      // 1. Always show crisp Telegram-style bottom-right popup card inside the app
      setPopups((prev) => [item, ...prev.filter((p) => p.id !== item.id)].slice(0, 4));

      // 2. If running inside Electron Desktop, also dispatch real OS/desktop popup
      if (window.tiligramDesktop?.showNotification) {
        void window.tiligramDesktop.showNotification({
          chatId: item.chatId,
          title: item.title,
          subtitle: item.subtitle,
          body: item.body,
          avatarColor: item.avatarColor,
          silent: !cfg.soundEnabled,
          style: cfg.popupStyle || 'telegram-popup',
        });
        return;
      }

      // 3. In web browser, also trigger native OS Notification if permission is granted
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (force || document.hidden || activeChatIdRef.current !== item.chatId)
      ) {
        try {
          const nativeNotif = new Notification(item.title, {
            body: item.subtitle ? `${item.subtitle}: ${item.body}` : item.body,
            tag: item.chatId,
            silent: !cfg.soundEnabled,
          });
          nativeNotif.onclick = () => {
            window.focus();
            setActiveChatId(item.chatId);
            setMobileShowChat(true);
            nativeNotif.close();
          };
        } catch {
          // ignore browser notification error
        }
      }
    },
    [],
  );

  const handleIncomingMessage = useCallback(
    ({ message, chat }: { message: ChatMessage; chat: ChatThread }) => {
      if (chat.muted) return;
      const cfg = settingsRef.current.notifications;
      if (chat.type === 'private' && !cfg.privateChats) return;
      if (chat.type === 'group' && !cfg.groups) return;
      if (chat.type === 'channel' && !cfg.channels) return;

      const isCurrentlyFocusedOnChat =
        !document.hidden && activeChatIdRef.current === chat.id;
      if (isCurrentlyFocusedOnChat) return;

      const previewBody = cfg.showPreview
        ? message.text ||
          (message.kind === 'image'
            ? 'Фотография'
            : message.kind === 'voice'
              ? 'Голосовое сообщение'
              : message.kind === 'sticker'
                ? `${message.attachment?.stickerEmoji || ''} Стикер`.trim()
                : message.attachment?.name || 'Файл')
        : 'Новое сообщение';

      dispatchPopupNotification({
        id: `notif-${message.id}`,
        chatId: chat.id,
        chatType: chat.type,
        title: chat.title,
        subtitle:
          chat.type === 'group' ? message.senderName : undefined,
        body: previewBody,
        avatarUrl: chat.avatarUrl,
        avatarColor: chat.avatarColor,
        createdAt: message.createdAt,
      });
    },
    [dispatchPopupNotification],
  );

  const tg = useTelegramSocket({
    token: checkingAuth ? null : authToken,
    initialUser,
    initialSettings,
    onAuthExpired: handleLogout,
    onIncomingMessage: handleIncomingMessage,
    onIncomingCall: (call) => callHandlersRef.current.onIncomingCall(call),
    onCallSignal: (payload) => callHandlersRef.current.onCallSignal(payload),
    onCallEnded: (payload) => callHandlersRef.current.onCallEnded(payload),
  });

  settingsRef.current = tg.settings;

  const callController = useWebRTCCall({
    currentUserId: tg.currentUser?.id ?? null,
    activeCalls: tg.activeCalls,
    soundEnabled: tg.settings.notifications.soundEnabled,
    startCallWs: tg.startCall,
    joinCallWs: tg.joinCall,
    declineCallWs: tg.declineCall,
    leaveCallWs: tg.leaveCall,
    sendSignalWs: tg.sendCallSignal,
    updateMediaStateWs: tg.updateCallMediaState,
  });

  callHandlersRef.current = {
    onIncomingCall: (call) => {
      callController.handleIncomingCallEvent(call);
      if (window.tiligramDesktop?.showNotification) {
        void window.tiligramDesktop.showNotification({
          chatId: call.chatId,
          title: call.chatTitle,
          subtitle:
            call.chatType === 'group' ? 'Групповой звонок' : 'Входящий звонок',
          body: `${call.initiatorName} приглашает в ${call.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'}`,
          avatarColor: '#10B981',
          silent: true,
          style: tg.settings.notifications.popupStyle || 'telegram-popup',
        });
      }
    },
    onCallSignal: callController.handleCallSignalEvent,
    onCallEnded: callController.handleCallEndedEvent,
  };

  const updater = useAppUpdater(
    tg.settings.updates?.githubRepo,
    tg.settings.updates?.autoCheck ?? true,
  );

  // Sync Electron desktop notification click -> jump straight to chat
  useEffect(() => {
    if (!window.tiligramDesktop?.onNotificationClick) return;
    return window.tiligramDesktop.onNotificationClick(({ chatId }) => {
      if (chatId) {
        setActiveChatId(chatId);
        setMobileShowChat(true);
        tg.markChatRead(chatId);
      }
    });
  }, [tg.markChatRead]);

  // Sync unread badge count to Electron taskbar/dock icon
  useEffect(() => {
    if (!window.tiligramDesktop?.setBadgeCount) return;
    const totalUnread = tg.chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    void window.tiligramDesktop.setBadgeCount(totalUnread);
  }, [tg.chats]);

  // Sync Tailwind v4 dark class & CSS accent variable (dark theme by default)
  useEffect(() => {
    const root = document.documentElement;
    const theme = authToken ? tg.settings.theme : 'dark';
    const accent = authToken ? tg.settings.accentColor : DEFAULT_APP_SETTINGS.accentColor;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.setProperty('--tg-accent', accent || '#3390EC');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#17212B' : '#FFFFFF');
    }
  }, [authToken, tg.settings.theme, tg.settings.accentColor]);

  // Select Saved Messages (or first available chat) once chats arrive
  useEffect(() => {
    if (!authToken || tg.chats.length === 0) return;
    if (!activeChatId || !tg.chats.some((c) => c.id === activeChatId)) {
      const saved = tg.chats.find((c) => c.type === 'saved');
      setActiveChatId(saved?.id ?? tg.chats[0].id);
    }
  }, [authToken, tg.chats, activeChatId]);

  // Automatically send real-time read receipts when viewing an open chat with unread messages
  const activeChatMsgs = activeChatId ? tg.messagesByChat[activeChatId] : undefined;
  const activeChatHasUnread = Boolean(
    activeChatId &&
      tg.currentUser &&
      ((tg.chats.find((c) => c.id === activeChatId)?.unreadCount ?? 0) > 0 ||
        (activeChatMsgs ?? []).some(
          (m) =>
            m.senderId !== tg.currentUser!.id &&
            m.status !== 'read' &&
            !(m.readBy?.includes(tg.currentUser!.id)),
        )),
  );

  useEffect(() => {
    if (!activeChatId || !activeChatHasUnread) return;
    if (!document.hidden) {
      tg.markChatRead(activeChatId);
    }
  }, [activeChatId, activeChatHasUnread, tg.markChatRead]);

  useEffect(() => {
    if (!activeChatId) return;
    const handleReadOnReturn = () => {
      if (!document.hidden && activeChatHasUnread) {
        tg.markChatRead(activeChatId);
      }
    };
    window.addEventListener('focus', handleReadOnReturn);
    document.addEventListener('visibilitychange', handleReadOnReturn);
    return () => {
      window.removeEventListener('focus', handleReadOnReturn);
      document.removeEventListener('visibilitychange', handleReadOnReturn);
    };
  }, [activeChatId, activeChatHasUnread, tg.markChatRead]);

  // Close overlays on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (forwardingMsg) setForwardingMsg(null);
        else if (stickerStudioOpen) setStickerStudioOpen(false);
        else if (createModal.open)
          setCreateModal((prev) => ({ ...prev, open: false }));
        else if (settingsOpen) setSettingsOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    lightbox,
    forwardingMsg,
    stickerStudioOpen,
    createModal.open,
    settingsOpen,
    drawerOpen,
  ]);

  if (checkingAuth) {
    return (
      <div className="min-h-[100dvh] h-[100dvh] w-full bg-[#0E1621] text-slate-100 flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#3390EC] text-white flex items-center justify-center shadow-lg">
          <Send className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-[#3390EC]" />
          <span>Загрузка Тилиграм...</span>
        </div>
      </div>
    );
  }

  if (!authToken || !tg.currentUser) {
    return (
      <AuthScreen
        onAuthenticated={({ token, user, settings }) => {
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
          } catch {
            // ignore
          }
          setInitialUser(user);
          setInitialSettings({
            ...DEFAULT_APP_SETTINGS,
            ...settings,
            notifications: {
              ...DEFAULT_APP_SETTINGS.notifications,
              ...(settings?.notifications ?? {}),
            },
            updates: {
              ...DEFAULT_APP_SETTINGS.updates!,
              ...(settings?.updates ?? {}),
            },
          });
          setAuthToken(token);
        }}
      />
    );
  }

  const activeChat = tg.chats.find((c) => c.id === activeChatId) ?? null;
  const activeMessages = activeChatId ? tg.messagesByChat[activeChatId] ?? [] : [];
  const archivedCount = tg.chats.filter((c) => c.archived).length;
  const activeCallInChat = activeChat
    ? tg.activeCalls.find((c) => c.chatId === activeChat.id) ?? null
    : null;
  const isJoinedToChatCall = Boolean(
    activeCallInChat &&
      callController.joinedCall?.callId === activeCallInChat.callId,
  );

  const handleSelectChat = (chatId: string, jumpToMessageId?: string) => {
    setActiveChatId(chatId);
    setMobileShowChat(true);
    tg.markChatRead(chatId);
    if (jumpToMessageId) {
      setHighlightMessageId(jumpToMessageId);
    }
  };

  const handleConfirmForward = (targetChatId: string, msg: ChatMessage) => {
    tg.sendMessage({
      chatId: targetChatId,
      kind: msg.kind,
      text: msg.text,
      forwardedFrom: msg.senderName,
      attachment: msg.attachment,
    });
    setActiveChatId(targetChatId);
    setMobileShowChat(true);
  };

  const handleSendStickerFromStudio = (sticker: CustomSticker) => {
    const targetId = activeChatId ?? tg.chats[0]?.id;
    if (!targetId) return;
    tg.sendMessage({
      chatId: targetId,
      kind: 'sticker',
      text: '',
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
    setStickerStudioOpen(false);
    setMobileShowChat(true);
  };

  const openSettingsTab = (tab: SettingsTabId = 'profile') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const handleTestNotification = () => {
    const targetChat = activeChat ?? tg.chats[0];
    if (!targetChat) return;
    dispatchPopupNotification(
      {
        id: `test-notif-${Date.now()}`,
        chatId: targetChat.id,
        chatType: targetChat.type,
        title: targetChat.title,
        subtitle: tg.currentUser?.name,
        body: 'Так выглядят всплывающие уведомления Тилиграм. Можно ответить прямо отсюда!',
        avatarUrl: targetChat.avatarUrl,
        avatarColor: targetChat.avatarColor || '#3390EC',
        createdAt: new Date().toISOString(),
      },
      true,
    );
  };

  const showUpdateBanner =
    !updater.bannerDismissed &&
    (updater.updateInfo.status === 'available' ||
      updater.updateInfo.status === 'downloaded');

  const handleOpenDirectChatWithMember = (member: ChatMember) => {
    const existing = tg.chats.find(
      (c) =>
        c.type === 'private' &&
        (c.peerUserId === member.id || c.participantIds?.includes(member.id)),
    );
    if (existing) {
      handleSelectChat(existing.id);
      setShowInfoPanel(false);
      return;
    }
    const newId = tg.createChat({
      type: 'private',
      title: member.name,
      username: member.username,
      bio: member.bio,
      avatarColor: member.avatarColor || '#3390EC',
      targetUserId: member.id,
    });
    setShowArchived(false);
    setFolder('all');
    setActiveChatId(newId);
    setMobileShowChat(true);
    setShowInfoPanel(false);
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col bg-white dark:bg-[#0E1621] text-slate-900 dark:text-slate-100">
      {/* Real GitHub Release Auto-Update Banner (only shown when a newer release exists) */}
      {showUpdateBanner && (
        <div className="px-4 py-2 bg-[#3390EC] text-white text-xs sm:text-[13px] flex items-center justify-between gap-3 shrink-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Download className="w-4 h-4 shrink-0" />
            <span className="font-semibold truncate">
              {updater.updateInfo.status === 'downloaded'
                ? `Обновление Тилиграм v${updater.updateInfo.latestVersion} готово к установке`
                : `Доступна новая версия Тилиграм v${updater.updateInfo.latestVersion} на GitHub`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                updater.updateInfo.status === 'downloaded'
                  ? void updater.installUpdate()
                  : void updater.downloadUpdate()
              }
              className="px-3 py-1 rounded-lg bg-white text-[#1E6BB8] font-semibold hover:bg-white/90 cursor-pointer whitespace-nowrap"
            >
              {updater.updateInfo.status === 'downloaded'
                ? 'Перезапустить'
                : updater.isElectron
                  ? 'Обновить'
                  : 'Скачать'}
            </button>
            <button
              type="button"
              onClick={updater.dismissBanner}
              aria-label="Скрыть уведомление об обновлении"
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/15 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 w-full flex overflow-hidden">
        {/* Left Sidebar */}
        <div
          className={`${
            mobileShowChat ? 'hidden md:flex' : 'flex'
          } h-full w-full md:w-auto shrink-0`}
        >
          <ChatSidebar
            chats={tg.chats}
            messagesByChat={tg.messagesByChat}
            typingByChat={tg.typingByChat}
            currentUserId={tg.currentUser.id}
            activeChatId={activeChatId}
            folder={folder}
            searchQuery={searchQuery}
            showArchived={showArchived}
            onSelectChat={handleSelectChat}
            onChangeFolder={setFolder}
            onChangeSearch={setSearchQuery}
            onToggleArchiveView={setShowArchived}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenCreateModal={() => setCreateModal({ open: true, type: 'private' })}
          />
        </div>

        {/* Center Chat Viewport */}
        <div
          className={`${
            mobileShowChat ? 'flex' : 'hidden md:flex'
          } flex-1 min-w-0 h-full`}
        >
          <ChatWindow
            chat={activeChat}
            messages={activeMessages}
            currentUserId={tg.currentUser.id}
            typingState={activeChatId ? tg.typingByChat[activeChatId] : undefined}
            settings={tg.settings}
            stickerPacks={tg.stickerPacks}
            activeCallInChat={activeCallInChat}
            isJoinedToChatCall={isJoinedToChatCall}
            highlightMessageId={highlightMessageId}
            showInfoPanel={showInfoPanel}
            onBackMobile={() => setMobileShowChat(false)}
            onToggleInfoPanel={() => setShowInfoPanel((prev) => !prev)}
            onSendMessage={tg.sendMessage}
            onUploadFile={tg.uploadFile}
            onOpenStickerStudio={() => setStickerStudioOpen(true)}
            onEditMessage={tg.editMessage}
            onDeleteMessage={tg.deleteMessage}
            onToggleReaction={tg.toggleReaction}
            onPinMessage={tg.pinMessage}
            onForwardMessage={(m) => setForwardingMsg(m)}
            onUpdateChatFlags={tg.updateChatFlags}
            onClearHistory={tg.clearChatHistory}
            onTyping={tg.sendTyping}
            onOpenLightbox={(url, caption) => setLightbox({ url, caption })}
            onClearHighlight={() => setHighlightMessageId(null)}
            onStartCall={(chatId, mode) => void callController.initiateCall(chatId, mode)}
            onJoinCall={(call) => void callController.joinExistingCall(call)}
            onOpenActiveCall={() => callController.setMinimized(false)}
          />

          {/* Right Chat Info Inspector */}
          {showInfoPanel && activeChat && (
            <ChatInfoPanel
              chat={activeChat}
              allChats={tg.chats}
              messages={activeMessages}
              currentUser={tg.currentUser}
              onClose={() => setShowInfoPanel(false)}
              onToggleMute={(id, muted) => tg.updateChatFlags(id, { muted })}
              onOpenLightbox={(url, caption) => setLightbox({ url, caption })}
              onJumpToMessage={(messageId) => setHighlightMessageId(messageId)}
              onStartCall={(chatId, mode) =>
                void callController.initiateCall(chatId, mode)
              }
              onSelectChat={(chatId) => handleSelectChat(chatId)}
              onOpenDirectChatWithMember={handleOpenDirectChatWithMember}
              onOpenEditProfile={() => openSettingsTab('profile')}
            />
          )}
        </div>
      </div>

      {/* Slide-out Navigation Drawer */}
      <NavigationDrawer
        open={drawerOpen}
        currentUser={tg.currentUser}
        settings={tg.settings}
        archivedCount={archivedCount}
        appVersion={updater.updateInfo.currentVersion}
        isElectron={updater.isElectron}
        onClose={() => setDrawerOpen(false)}
        onToggleTheme={() =>
          tg.updateSettings({
            ...tg.settings,
            theme: tg.settings.theme === 'dark' ? 'light' : 'dark',
          })
        }
        onOpenSaved={() => {
          setShowArchived(false);
          setFolder('all');
          const saved = tg.chats.find((c) => c.type === 'saved');
          if (saved) handleSelectChat(saved.id);
        }}
        onOpenArchive={() => {
          setShowArchived(true);
          setMobileShowChat(false);
        }}
        onOpenCreate={(type) => setCreateModal({ open: true, type })}
        onOpenSettings={openSettingsTab}
        onOpenStickerStudio={() => setStickerStudioOpen(true)}
        onLogout={handleLogout}
      />

      {/* Modals & Lightbox */}
      <CreateChatModal
        open={createModal.open}
        defaultType={createModal.type}
        directoryVersion={tg.directoryVersion}
        onClose={() => setCreateModal((prev) => ({ ...prev, open: false }))}
        onSearchUsers={tg.searchUsers}
        onCreate={(params) => {
          const newId = tg.createChat(params);
          setShowArchived(false);
          setFolder('all');
          setActiveChatId(newId);
          setMobileShowChat(true);
        }}
      />

      <ForwardModal
        message={forwardingMsg}
        chats={tg.chats}
        onClose={() => setForwardingMsg(null)}
        onConfirmForward={handleConfirmForward}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        token={authToken}
        currentUser={tg.currentUser}
        settings={tg.settings}
        stickerPacks={tg.stickerPacks}
        updater={updater}
        onClose={() => setSettingsOpen(false)}
        onSaveProfile={tg.updateProfile}
        onChangeSettings={tg.updateSettings}
        onOpenStickerStudio={() => {
          setSettingsOpen(false);
          setStickerStudioOpen(true);
        }}
        onTestNotification={handleTestNotification}
        onLogout={handleLogout}
      />

      <StickerStudioModal
        open={stickerStudioOpen}
        currentUserId={tg.currentUser.id}
        stickerPacks={tg.stickerPacks}
        hasActiveChat={Boolean(activeChatId)}
        onClose={() => setStickerStudioOpen(false)}
        onCreatePack={tg.createStickerPack}
        onAddSticker={tg.addStickerToPack}
        onRemoveSticker={tg.removeStickerFromPack}
        onDeletePack={tg.deleteStickerPack}
        onSendSticker={handleSendStickerFromStudio}
      />

      <PhotoLightbox item={lightbox} onClose={() => setLightbox(null)} />

      {/* Telegram-style Bottom-Right Interactive Popup Notifications */}
      <NotificationPopups
        items={popups}
        onDismiss={(id) => setPopups((prev) => prev.filter((p) => p.id !== id))}
        onOpenChat={(chatId, popupId) => {
          setPopups((prev) => prev.filter((p) => p.id !== popupId));
          handleSelectChat(chatId);
        }}
        onMarkRead={(chatId, popupId) => {
          setPopups((prev) => prev.filter((p) => p.id !== popupId));
          tg.markChatRead(chatId);
        }}
        onQuickReply={(chatId, text, popupId) => {
          tg.sendMessage({ chatId, kind: 'text', text });
          tg.markChatRead(chatId);
          setPopups((prev) => prev.filter((p) => p.id !== popupId));
        }}
      />

      {/* Real WebRTC P2P & Group Call Overlay */}
      <CallOverlay call={callController} currentUserId={tg.currentUser.id} />

      {/* Mobile / PWA Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
}
