import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { ChatInfoPanel } from './components/ChatInfoPanel';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatWindow } from './components/ChatWindow';
import {
  CreateChatModal,
  ForwardModal,
  PhotoLightbox,
} from './components/Modals';
import { NavigationDrawer } from './components/NavigationDrawer';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal';
import { StickerStudioModal } from './components/StickerStudioModal';
import { DEFAULT_APP_SETTINGS } from './data/seedData';
import { useTelegramSocket } from './hooks/useTelegramSocket';
import type {
  AppSettings,
  ChatFolder,
  ChatMessage,
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
            setInitialSettings({ ...DEFAULT_APP_SETTINGS, ...data.settings });
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

  const tg = useTelegramSocket({
    token: checkingAuth ? null : authToken,
    initialUser,
    initialSettings,
    onAuthExpired: handleLogout,
  });

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
  }, [authToken, tg.settings.theme, tg.settings.accentColor]);

  // Select Saved Messages (or first available chat) once chats arrive
  useEffect(() => {
    if (!authToken || tg.chats.length === 0) return;
    if (!activeChatId || !tg.chats.some((c) => c.id === activeChatId)) {
      const saved = tg.chats.find((c) => c.type === 'saved');
      setActiveChatId(saved?.id ?? tg.chats[0].id);
    }
  }, [authToken, tg.chats, activeChatId]);

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
      <div className="min-h-screen w-screen bg-[#0E1621] text-slate-100 flex flex-col items-center justify-center gap-4">
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
          setInitialSettings({ ...DEFAULT_APP_SETTINGS, ...settings });
          setAuthToken(token);
        }}
      />
    );
  }

  const activeChat = tg.chats.find((c) => c.id === activeChatId) ?? null;
  const activeMessages = activeChatId ? tg.messagesByChat[activeChatId] ?? [] : [];
  const archivedCount = tg.chats.filter((c) => c.archived).length;

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

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-white dark:bg-[#0E1621] text-slate-900 dark:text-slate-100">
      {/* Left Sidebar */}
      <div
        className={`${
          mobileShowChat ? 'hidden md:flex' : 'flex'
        } h-full w-full md:w-auto shrink-0`}
      >
        <ChatSidebar
          chats={tg.chats}
          messagesByChat={tg.messagesByChat}
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
        />

        {/* Right Chat Info Inspector */}
        {showInfoPanel && activeChat && (
          <ChatInfoPanel
            chat={activeChat}
            messages={activeMessages}
            onClose={() => setShowInfoPanel(false)}
            onToggleMute={(id, muted) => tg.updateChatFlags(id, { muted })}
            onOpenLightbox={(url, caption) => setLightbox({ url, caption })}
            onJumpToMessage={(messageId) => setHighlightMessageId(messageId)}
          />
        )}
      </div>

      {/* Slide-out Navigation Drawer */}
      <NavigationDrawer
        open={drawerOpen}
        currentUser={tg.currentUser}
        settings={tg.settings}
        archivedCount={archivedCount}
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
        onClose={() => setSettingsOpen(false)}
        onSaveProfile={tg.updateProfile}
        onChangeSettings={tg.updateSettings}
        onOpenStickerStudio={() => {
          setSettingsOpen(false);
          setStickerStudioOpen(true);
        }}
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
    </div>
  );
}
