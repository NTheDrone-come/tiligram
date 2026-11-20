import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { TiligramStorage, type ClusterSyncEvent } from './src/server/storage.ts';
import {
  applyIdempotentMessageCreate,
  buildFullName,
  toggleReactionOnList,
  validateProfileInput,
  validateRegistrationInput,
  validateStickerPackInput,
  validateUsername,
} from './src/utils/chatLogic.ts';
import { MAX_UPLOAD_BYTES } from './src/utils/fileRetention.ts';
import {
  isNewerVersion,
  normalizeGitHubRepoSlug,
} from './src/utils/callLogic.ts';
import type {
  ActiveCallRoom,
  CallParticipant,
  ChatMember,
  ChatMessage,
  ChatThread,
  ClientWsEvent,
  ServerWsEvent,
} from './src/types/telegram.ts';

const PORT = Number(process.env.PORT) || 3000;
const storage = new TiligramStorage();

// Run initial expired file cleanup and repeat every 15 minutes
storage.sweepExpiredFiles();
setInterval(() => {
  storage.sweepExpiredFiles();
}, 15 * 60 * 1000);

interface AuthedSocket {
  ws: WebSocket;
  userId: string;
  isAlive: boolean;
}

const activeClients = new Map<WebSocket, AuthedSocket>();
const remoteOnlineUsers = new Set<string>();
const activeCalls = new Map<string, ActiveCallRoom>();

function getOnlineUserIds(): Set<string> {
  const ids = new Set<string>(remoteOnlineUsers);
  for (const client of activeClients.values()) {
    ids.add(client.userId);
  }
  return ids;
}

function hasLocalConnectionForUser(userId: string): boolean {
  for (const client of activeClients.values()) {
    if (client.userId === userId) return true;
  }
  return false;
}

function getAppVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function detectGitHubRepoFromEnvOrGit(): string | null {
  const fromEnv = normalizeGitHubRepoSlug(process.env.GITHUB_REPO || '');
  if (fromEnv) return fromEnv;
  try {
    const gitConfigPath = path.resolve(process.cwd(), '.git/config');
    if (fs.existsSync(gitConfigPath)) {
      const text = fs.readFileSync(gitConfigPath, 'utf-8');
      const match = text.match(/url\s*=\s*(.+)/);
      if (match && match[1]) {
        return normalizeGitHubRepoSlug(match[1]);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getActiveCallsForUser(userId: string): ActiveCallRoom[] {
  const userChatIds = new Set(storage.getChatsForUser(userId).map((c) => c.id));
  const list: ActiveCallRoom[] = [];
  for (const call of activeCalls.values()) {
    if (
      userChatIds.has(call.chatId) ||
      call.participants.some((p) => p.userId === userId)
    ) {
      list.push(call);
    }
  }
  return list;
}

function broadcastCallToChat(chat: ChatThread, event: ServerWsEvent): void {
  const targets = getTargetUserIdsForChat(chat);
  if (targets) broadcastToUsers(targets, event);
  else broadcastAll(event);
}

function removeUserFromCall(callId: string, userId: string, reason?: string): void {
  const call = activeCalls.get(callId);
  if (!call) return;
  const before = call.participants.length;
  call.participants = call.participants.filter((p) => p.userId !== userId);
  if (call.participants.length === before) return;

  const chat = storage.getChatById(call.chatId);
  const shouldEnd =
    call.participants.length === 0 ||
    (call.chatType === 'private' && call.participants.length < 2);

  if (shouldEnd) {
    activeCalls.delete(callId);
    const endEvt: ServerWsEvent = {
      type: 'call:ended',
      payload: {
        callId: call.callId,
        chatId: call.chatId,
        reason: reason || 'Звонок завершён',
      },
    };
    if (chat) broadcastCallToChat(chat, endEvt);
    else broadcastAll(endEvt);
  } else {
    const updEvt: ServerWsEvent = {
      type: 'call:room_updated',
      payload: { call },
    };
    if (chat) broadcastCallToChat(chat, updEvt);
    else broadcastAll(updEvt);
  }
}

function removeUserFromAllCalls(userId: string): void {
  // Only leave calls if the user has no other open WebSocket tabs
  for (const client of activeClients.values()) {
    if (client.userId === userId) return;
  }
  for (const call of Array.from(activeCalls.values())) {
    if (call.participants.some((p) => p.userId === userId)) {
      removeUserFromCall(call.callId, userId, 'Собеседник отключился');
    }
  }
}

function sendWs(ws: WebSocket, event: ServerWsEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function broadcastAll(event: ServerWsEvent, exclude?: WebSocket): void {
  const payload = JSON.stringify(event);
  for (const [ws] of activeClients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastToUsers(
  userIds: Set<string>,
  event: ServerWsEvent,
  exclude?: WebSocket,
): void {
  const payload = JSON.stringify(event);
  for (const [ws, client] of activeClients) {
    if (
      ws !== exclude &&
      userIds.has(client.userId) &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(payload);
    }
  }
}

function getTargetUserIdsForChat(chat: ChatThread): Set<string> | null {
  if (chat.type === 'saved') {
    return new Set(chat.ownerId ? [chat.ownerId] : chat.participantIds ?? []);
  }
  if (chat.type === 'private' && chat.participantIds && chat.participantIds.length > 0) {
    return new Set(chat.participantIds);
  }
  // Groups & channels are visible to participants/all connected clients
  return null;
}

function broadcastPersonalizedChatEvent(
  chat: ChatThread,
  buildEvent: (decoratedChat: ChatThread, recipientUserId: string) => ServerWsEvent,
  exclude?: WebSocket,
): void {
  const targets = getTargetUserIdsForChat(chat);
  const onlineIds = getOnlineUserIds();
  for (const [ws, client] of activeClients) {
    if (ws === exclude || ws.readyState !== WebSocket.OPEN) continue;
    if (targets && !targets.has(client.userId)) continue;
    const decorated = storage.decorateChatForUser(chat, client.userId, onlineIds);
    sendWs(ws, buildEvent(decorated, client.userId));
  }
}

function broadcastPresenceForUser(userId: string, publishCluster = true): void {
  const acc = storage.getAccountById(userId);
  if (!acc) return;
  const onlineIds = getOnlineUserIds();
  const presence = storage.getPresenceForAccount(acc, onlineIds);
  broadcastAll({
    type: 'presence:update',
    payload: {
      userId,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt,
      lastSeenText: presence.lastSeenText,
    },
  });
  if (publishCluster) {
    storage.publishClusterEvent({
      type: 'presence:update',
      userId,
      online: hasLocalConnectionForUser(userId),
      lastSeenAt: acc.lastSeenAt,
    });
  }
}

function handleRemoteClusterEvent(evt: ClusterSyncEvent): void {
  const onlineIds = getOnlineUserIds();
  switch (evt.type) {
    case 'account:upsert': {
      const summary = storage.toPublicUserSummary(evt.account, onlineIds);
      broadcastAll({ type: 'directory:updated', payload: { user: summary } });
      broadcastAll({ type: 'user:profile_changed', payload: { user: summary } });
      break;
    }
    case 'chat:upsert': {
      broadcastPersonalizedChatEvent(evt.chat, (decorated) => ({
        type: 'chat:created',
        payload: {
          chat: decorated,
          messages: evt.messages ?? storage.getChatMessages(evt.chat.id),
        },
      }));
      break;
    }
    case 'message:upsert': {
      broadcastPersonalizedChatEvent(evt.chat, (decorated) => ({
        type: 'message:created',
        payload: { message: evt.message, chat: decorated },
      }));
      break;
    }
    case 'message:delete': {
      broadcastPersonalizedChatEvent(evt.chat, (decorated) => ({
        type: 'message:deleted',
        payload: { chatId: evt.chatId, messageId: evt.messageId, chat: decorated },
      }));
      break;
    }
    case 'chat:clear': {
      broadcastPersonalizedChatEvent(evt.chat, (decorated) => ({
        type: 'chat:cleared',
        payload: { chatId: evt.chatId, chat: decorated },
      }));
      break;
    }
    case 'messages:read': {
      const chat = storage.getChatById(evt.chatId);
      const targets = chat ? getTargetUserIdsForChat(chat) : null;
      const readEvt: ServerWsEvent = {
        type: 'messages:read',
        payload: {
          chatId: evt.chatId,
          messageIds: evt.messageIds,
          readerId: evt.readerId,
          readAt: evt.readAt,
        },
      };
      if (targets) broadcastToUsers(targets, readEvt);
      else broadcastAll(readEvt);
      break;
    }
    case 'typing:update': {
      const chat = storage.getChatById(evt.chatId);
      if (!chat) break;
      const targets = getTargetUserIdsForChat(chat);
      const typingEvt: ServerWsEvent = {
        type: 'typing:update',
        payload: {
          chatId: evt.chatId,
          userId: evt.userId,
          userName: evt.userName,
          isTyping: evt.isTyping,
        },
      };
      if (targets) {
        const others = new Set(Array.from(targets).filter((id) => id !== evt.userId));
        broadcastToUsers(others, typingEvt);
      } else {
        for (const [ws, client] of activeClients) {
          if (client.userId !== evt.userId && ws.readyState === WebSocket.OPEN) {
            sendWs(ws, typingEvt);
          }
        }
      }
      break;
    }
    case 'presence:update': {
      if (evt.online) remoteOnlineUsers.add(evt.userId);
      else remoteOnlineUsers.delete(evt.userId);
      broadcastPresenceForUser(evt.userId, false);
      break;
    }
    case 'stickers:updated': {
      broadcastAll({
        type: 'stickers:updated',
        payload: { stickerPacks: evt.stickerPacks },
      });
      break;
    }
  }
}

function extractBearerUserId(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return storage.verifyToken(token);
}

async function startServer() {
  await storage.ready;
  storage.startClusterSync(handleRemoteClusterEvent);

  const app = express();
  app.use(express.json({ limit: '40mb' }));

  // --- Health ---
  app.get('/api/health', async (_req, res) => {
    const supabase = await storage.checkSupabaseHealth();
    res.json({
      ok: true,
      version: getAppVersion(),
      onlineClients: activeClients.size,
      activeCalls: activeCalls.size,
      storage: supabase.tablesReady ? 'supabase' : 'local',
      supabase,
    });
  });

  // --- GitHub Auto-Update Check ---
  app.get('/api/updates/check', async (req, res) => {
    const currentVersion = getAppVersion();
    const rawRepo = String(req.query.repo ?? '');
    const repo =
      normalizeGitHubRepoSlug(rawRepo) || detectGitHubRepoFromEnvOrGit();

    if (!repo) {
      res.json({
        status: 'idle',
        currentVersion,
        updateAvailable: false,
        repo: '',
        error:
          'Укажите репозиторий GitHub в формате owner/repo (или добавьте переменную GITHUB_REPO)',
      });
      return;
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Tiligram-Updater/1.0',
    };
    const ghToken = process.env.GITHUB_TOKEN?.trim();
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken}`;
    }

    try {
      const releaseRes = await fetch(
        `https://api.github.com/repos/${repo}/releases/latest`,
        { headers },
      );

      if (releaseRes.ok) {
        const rel = (await releaseRes.json()) as {
          tag_name?: string;
          name?: string;
          body?: string;
          html_url?: string;
          published_at?: string;
          assets?: Array<{
            name: string;
            browser_download_url: string;
            size: number;
          }>;
        };
        const latestVersion = (rel.tag_name || currentVersion).replace(/^v/i, '');
        const updateAvailable = isNewerVersion(latestVersion, currentVersion);
        res.json({
          status: updateAvailable ? 'available' : 'up-to-date',
          currentVersion,
          latestVersion,
          updateAvailable,
          releaseName: rel.name || `Тилиграм v${latestVersion}`,
          releaseNotes: rel.body || '',
          releaseUrl: rel.html_url || `https://github.com/${repo}/releases`,
          publishedAt: rel.published_at,
          repo,
          downloadAssets: (rel.assets || []).map((a) => ({
            name: a.name,
            url: a.browser_download_url,
            size: a.size,
          })),
        });
        return;
      }

      if (releaseRes.status === 404 || releaseRes.status === 401 || releaseRes.status === 403) {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
          headers,
        });
        if (repoRes.ok) {
          res.json({
            status: 'up-to-date',
            currentVersion,
            latestVersion: currentVersion,
            updateAvailable: false,
            releaseName: `Тилиграм v${currentVersion}`,
            releaseNotes:
              'Репозиторий подключён. Создайте первый GitHub Release с тегом v1.0.1 (через git tag v1.0.1 && git push --tags), чтобы Electron автоматически скачивал обновления.',
            releaseUrl: `https://github.com/${repo}/releases`,
            repo,
            downloadAssets: [],
          });
          return;
        }
        if (repoRes.status === 401) {
          res.json({
            status: 'error',
            currentVersion,
            updateAvailable: false,
            repo,
            error:
              'GITHUB_TOKEN недействителен или истёк (401 Bad credentials). Проверьте токен в Secrets.',
          });
          return;
        }
        if (repoRes.status === 403) {
          res.json({
            status: 'error',
            currentVersion,
            updateAvailable: false,
            repo,
            error:
              'GITHUB_TOKEN не имеет прав доступа к репозиторию (403 Forbidden). Выдайте права repo или Contents: Read-only.',
          });
          return;
        }
        res.json({
          status: 'error',
          currentVersion,
          updateAvailable: false,
          repo,
          error: ghToken
            ? `Репозиторий "${repo}" не найден (404) даже с GITHUB_TOKEN — проверьте точное название репозитория и что токену выдан доступ к этому репозиторию (Contents: Read-only / repo).`
            : `Репозиторий "${repo}" не найден или приватный, а GITHUB_TOKEN сейчас не задан в Secrets.`,
        });
        return;
      }

      res.json({
        status: 'error',
        currentVersion,
        updateAvailable: false,
        repo,
        error: `GitHub API вернул статус ${releaseRes.status}`,
      });
    } catch (err) {
      res.json({
        status: 'error',
        currentVersion,
        updateAvailable: false,
        repo,
        error:
          err instanceof Error
            ? `Ошибка сети GitHub: ${err.message}`
            : 'Не удалось связаться с GitHub',
      });
    }
  });

  // --- Auth Endpoints ---
  app.get('/api/auth/check-username', async (req, res) => {
    await storage.refreshAccountsFromSupabase();
    const raw = String(req.query.username ?? '');
    const excludeUserId = req.query.excludeUserId
      ? String(req.query.excludeUserId)
      : undefined;
    const check = validateUsername(raw);
    if (!check.valid) {
      res.json({
        valid: false,
        available: false,
        normalized: check.normalized,
        error: check.error,
      });
      return;
    }
    const available = storage.isUsernameAvailable(check.normalized, excludeUserId);
    res.json({
      valid: true,
      available,
      normalized: check.normalized,
      error: available ? undefined : 'Этот юзернейм уже занят',
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    await storage.refreshAccountsFromSupabase(true);
    const body = req.body ?? {};
    const check = validateRegistrationInput({
      firstName: String(body.firstName ?? ''),
      lastName: String(body.lastName ?? ''),
      username: String(body.username ?? ''),
      password: String(body.password ?? ''),
      confirmPassword:
        body.confirmPassword !== undefined
          ? String(body.confirmPassword)
          : undefined,
    });

    if (!check.valid) {
      res.status(400).json({ error: check.error || 'Проверьте заполнение полей' });
      return;
    }

    if (!storage.isUsernameAvailable(check.username)) {
      res.status(409).json({ error: 'Этот юзернейм уже занят' });
      return;
    }

    const { account, savedChat } = storage.registerAccount({
      firstName: check.firstName,
      lastName: check.lastName,
      username: check.username,
      password: String(body.password),
    });

    const summary = storage.toPublicUserSummary(account, getOnlineUserIds());
    broadcastAll({ type: 'directory:updated', payload: { user: summary } });
    storage.publishClusterEvent({ type: 'account:upsert', account });
    storage.publishClusterEvent({ type: 'chat:upsert', chat: savedChat, messages: [] });

    const token = storage.signToken(account.id);
    res.status(201).json({
      token,
      user: storage.toUserProfile(account, true),
      settings: account.settings,
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const rawUsername = String(req.body?.username ?? '');
    const password = String(req.body?.password ?? '');
    let acc = storage.getAccountByUsername(rawUsername);
    if (!acc) {
      await storage.refreshAccountsFromSupabase(true);
      acc = storage.getAccountByUsername(rawUsername);
    }

    if (!acc || !storage.verifyPassword(password, acc.passwordHash, acc.passwordSalt)) {
      res.status(401).json({ error: 'Неверный юзернейм или пароль' });
      return;
    }

    const token = storage.signToken(acc.id);
    res.json({
      token,
      user: storage.toUserProfile(acc, true),
      settings: acc.settings,
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Неавторизован' });
      return;
    }
    let acc = storage.getAccountById(userId);
    if (!acc) {
      await storage.refreshAccountsFromSupabase(true);
      acc = storage.getAccountById(userId);
    }
    if (!acc) {
      res.status(401).json({ error: 'Аккаунт не найден' });
      return;
    }
    res.json({
      user: storage.toUserProfile(acc, true),
      settings: acc.settings,
    });
  });

  app.post('/api/auth/change-password', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
      return;
    }
    const result = storage.updateAccountPassword(userId, currentPassword, newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // --- Users Directory Search ---
  app.get('/api/users/search', async (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    await storage.refreshAccountsFromSupabase();
    const q = String(req.query.q ?? '');
    const users = storage.searchAccounts(q, userId, getOnlineUserIds());
    res.json({ users });
  });

  // --- File Upload & TTL Download ---
  app.post('/api/files', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }

    const name = String(req.body?.name ?? 'file').slice(0, 180);
    const mimeType = String(req.body?.mimeType ?? 'application/octet-stream');
    const dataBase64 = String(req.body?.dataBase64 ?? '');
    if (!dataBase64) {
      res.status(400).json({ error: 'Файл пуст' });
      return;
    }

    const base64Part = dataBase64.includes(',')
      ? dataBase64.slice(dataBase64.indexOf(',') + 1)
      : dataBase64;
    const buffer = Buffer.from(base64Part, 'base64');

    if (buffer.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({
        error: 'Максимальный размер файла — 25 МБ',
      });
      return;
    }

    const { meta, sizeLabel } = storage.saveUploadedFile({
      uploaderId: userId,
      originalName: name,
      mimeType,
      buffer,
    });

    res.status(201).json({
      url: `/api/files/${meta.id}`,
      name: meta.originalName,
      fileId: meta.id,
      sizeBytes: meta.sizeBytes,
      sizeLabel,
      mimeType: meta.mimeType,
      expiresAt: meta.expiresAt,
      retentionPolicy: meta.retentionPolicy,
    });
  });

  app.get('/api/files/:id', (req, res) => {
    const { meta, expired } = storage.getFileById(req.params.id);
    if (expired) {
      res.status(410).json({
        error: 'Срок хранения файла истёк — он был автоматически удалён с сервера',
      });
      return;
    }
    if (!meta || !fs.existsSync(meta.storagePath)) {
      res.status(404).json({ error: 'Файл не найден' });
      return;
    }
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    fs.createReadStream(meta.storagePath).pipe(res);
  });

  // --- Custom Sticker Packs CRUD ---
  app.get('/api/stickers/packs', (_req, res) => {
    res.json({ stickerPacks: storage.getStickerPacks() });
  });

  app.post('/api/stickers/packs', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const acc = storage.getAccountById(userId);
    if (!acc) {
      res.status(401).json({ error: 'Аккаунт не найден' });
      return;
    }

    const check = validateStickerPackInput({
      title: String(req.body?.title ?? ''),
      slug: String(req.body?.slug ?? ''),
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    const result = storage.createStickerPack({
      title: check.normalizedTitle,
      slug: check.normalizedSlug,
      description: String(req.body?.description ?? ''),
      authorId: acc.id,
      authorName: buildFullName(acc.firstName, acc.lastName),
    });

    if (result.error || !result.pack) {
      res.status(409).json({ error: result.error });
      return;
    }

    const allPacks = storage.getStickerPacks();
    broadcastAll({ type: 'stickers:updated', payload: { stickerPacks: allPacks } });
    res.status(201).json({ pack: result.pack, stickerPacks: allPacks });
  });

  app.post('/api/stickers/packs/:packId/items', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }

    const result = storage.addStickerToPack(req.params.packId, userId, {
      emoji: String(req.body?.emoji ?? '✨'),
      label: String(req.body?.label ?? 'Стикер'),
      imageUrl: req.body?.imageUrl ? String(req.body.imageUrl) : undefined,
      bgColor: req.body?.bgColor ? String(req.body.bgColor) : undefined,
      accentColor: req.body?.accentColor ? String(req.body.accentColor) : undefined,
    });

    if (result.error || !result.sticker) {
      res.status(400).json({ error: result.error });
      return;
    }

    const allPacks = storage.getStickerPacks();
    broadcastAll({ type: 'stickers:updated', payload: { stickerPacks: allPacks } });
    res.status(201).json({ sticker: result.sticker, stickerPacks: allPacks });
  });

  app.delete('/api/stickers/packs/:packId/items/:stickerId', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }

    const result = storage.removeStickerFromPack(
      req.params.packId,
      req.params.stickerId,
      userId,
    );
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const allPacks = storage.getStickerPacks();
    broadcastAll({ type: 'stickers:updated', payload: { stickerPacks: allPacks } });
    res.json({ ok: true, stickerPacks: allPacks });
  });

  app.delete('/api/stickers/packs/:packId', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }

    const result = storage.deleteStickerPack(req.params.packId, userId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const allPacks = storage.getStickerPacks();
    broadcastAll({ type: 'stickers:updated', payload: { stickerPacks: allPacks } });
    res.json({ ok: true, stickerPacks: allPacks });
  });

  // --- Vite / Static ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // WebSocket keepalive ping/pong every 25s so Cloud Run / proxies never drop idle sockets
  const heartbeatInterval = setInterval(() => {
    for (const [ws, client] of activeClients) {
      if (!client.isAlive) {
        ws.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, 25_000);
  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws) => {
    ws.on('pong', () => {
      const client = activeClients.get(ws);
      if (client) client.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString()) as ClientWsEvent;

        if (event.type === 'client:ping') {
          const client = activeClients.get(ws);
          if (client) client.isAlive = true;
          sendWs(ws, { type: 'server:pong', ts: event.ts });
          return;
        }

        if (event.type === 'client:auth') {
          const userId = storage.verifyToken(event.token);
          if (!userId) {
            sendWs(ws, { type: 'auth:error', payload: { message: 'Сессия истекла' } });
            return;
          }
          const acc = storage.getAccountById(userId);
          if (!acc) {
            sendWs(ws, { type: 'auth:error', payload: { message: 'Аккаунт не найден' } });
            return;
          }

          activeClients.set(ws, { ws, userId, isAlive: true });
          storage.touchAccountLastSeen(userId);
          const onlineIds = getOnlineUserIds();

          sendWs(ws, {
            type: 'sync:init',
            payload: {
              currentUser: storage.toUserProfile(acc, true),
              settings: acc.settings,
              chats: storage.getChatsForUser(userId, onlineIds),
              messagesByChat: storage.getMessagesForUser(userId),
              stickerPacks: storage.getStickerPacks(),
              activeCalls: getActiveCallsForUser(userId),
              onlineClientCount: activeClients.size,
            },
          });

          broadcastPresenceForUser(userId, true);
          broadcastAll({
            type: 'presence:count',
            payload: { onlineClientCount: activeClients.size },
          });
          return;
        }

        const authed = activeClients.get(ws);
        if (!authed) {
          sendWs(ws, { type: 'auth:error', payload: { message: 'Требуется вход' } });
          return;
        }
        authed.isAlive = true;
        const me = storage.getAccountById(authed.userId);
        if (!me) return;

        switch (event.type) {
          case 'message:send': {
            const p = event.payload;
            const chat = storage.getChatById(p.chatId);
            if (!chat) break;

            const nowIso = new Date().toISOString();
            const message: ChatMessage = {
              id: p.id,
              chatId: p.chatId,
              senderId: me.id,
              senderName: buildFullName(me.firstName, me.lastName),
              senderColor: me.profileAccent,
              kind: p.kind,
              text: p.text.trim(),
              createdAt: nowIso,
              status: chat.type === 'saved' ? 'read' : 'sent',
              readBy: [me.id],
              replyToId: p.replyToId,
              forwardedFrom: p.forwardedFrom,
              reactions: [],
              attachment: p.attachment,
            };

            const existing = storage.getChatMessages(p.chatId);
            storage.setChatMessages(
              p.chatId,
              applyIdempotentMessageCreate(existing, message),
            );
            chat.lastMessageAt = nowIso;
            chat.archived = false;
            storage.saveMessage(message, chat);
            storage.publishClusterEvent({ type: 'message:upsert', message, chat });

            broadcastPersonalizedChatEvent(chat, (decoratedChat) => ({
              type: 'message:created',
              payload: { message, chat: decoratedChat },
            }));
            break;
          }

          case 'message:edit': {
            const { chatId, messageId, text } = event.payload;
            const chat = storage.getChatById(chatId);
            const list = storage.getChatMessages(chatId);
            const msg = list.find((m) => m.id === messageId && m.senderId === me.id);
            if (!msg || !chat || !text.trim()) break;

            msg.text = text.trim();
            msg.editedAt = new Date().toISOString();
            storage.saveMessage(msg, chat);
            storage.publishClusterEvent({ type: 'message:upsert', message: msg, chat });

            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = { type: 'message:updated', payload: { message: msg } };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
            break;
          }

          case 'message:delete': {
            const { chatId, messageId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;

            const nextList = storage
              .getChatMessages(chatId)
              .filter((m) => m.id !== messageId);
            storage.setChatMessages(chatId, nextList);
            if (chat.pinnedMessageId === messageId) {
              chat.pinnedMessageId = null;
            }
            storage.deleteMessage(chatId, messageId, chat);
            storage.publishClusterEvent({
              type: 'message:delete',
              chatId,
              messageId,
              chat,
            });

            broadcastPersonalizedChatEvent(chat, (decoratedChat) => ({
              type: 'message:deleted',
              payload: { chatId, messageId, chat: decoratedChat },
            }));
            break;
          }

          case 'message:react': {
            const { chatId, messageId, emoji } = event.payload;
            const chat = storage.getChatById(chatId);
            const list = storage.getChatMessages(chatId);
            const msg = list.find((m) => m.id === messageId);
            if (!msg || !chat) break;

            msg.reactions = toggleReactionOnList(msg.reactions, emoji, me.id);
            storage.saveMessage(msg, chat);
            storage.publishClusterEvent({ type: 'message:upsert', message: msg, chat });

            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = { type: 'message:updated', payload: { message: msg } };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
            break;
          }

          case 'chat:pin_message': {
            const { chatId, messageId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;
            chat.pinnedMessageId = messageId;
            storage.upsertChat(chat);

            broadcastPersonalizedChatEvent(chat, (decoratedChat) => ({
              type: 'chat:updated',
              payload: { chat: decoratedChat },
            }));
            break;
          }

          case 'chat:mark_read': {
            const { chatId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;

            const emitReadReceipt = me.settings?.privacy?.readReceipts !== false;
            const { changedMessageIds, readAt } = storage.markChatMessagesRead(
              chatId,
              me.id,
              emitReadReceipt,
            );

            // Update reader's own unread count across all their tabs
            const decoratedForReader = storage.decorateChatForUser(
              chat,
              me.id,
              getOnlineUserIds(),
            );
            broadcastToUsers(new Set([me.id]), {
              type: 'chat:updated',
              payload: { chat: decoratedForReader },
            });

            // Immediately highlight checkmarks for the sender(s) in real time
            if (changedMessageIds.length > 0) {
              const readEvt: ServerWsEvent = {
                type: 'messages:read',
                payload: {
                  chatId,
                  messageIds: changedMessageIds,
                  readerId: me.id,
                  readAt,
                },
              };
              const targets = getTargetUserIdsForChat(chat);
              if (targets) broadcastToUsers(targets, readEvt);
              else broadcastAll(readEvt);

              storage.publishClusterEvent({
                type: 'messages:read',
                chatId,
                messageIds: changedMessageIds,
                readerId: me.id,
                readAt,
              });
            }
            break;
          }

          case 'chat:update_flags': {
            const { chatId, pinned, muted, archived } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;
            if (typeof pinned === 'boolean') chat.pinned = pinned;
            if (typeof muted === 'boolean') chat.muted = muted;
            if (typeof archived === 'boolean') chat.archived = archived;
            storage.upsertChat(chat);
            const decorated = storage.decorateChatForUser(
              chat,
              me.id,
              getOnlineUserIds(),
            );
            broadcastToUsers(new Set([me.id]), {
              type: 'chat:updated',
              payload: { chat: decorated },
            });
            break;
          }

          case 'chat:clear_history': {
            const { chatId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;
            chat.pinnedMessageId = null;
            chat.unreadCount = 0;
            storage.clearChatMessages(chatId, chat);
            storage.publishClusterEvent({ type: 'chat:clear', chatId, chat });

            broadcastPersonalizedChatEvent(chat, (decoratedChat) => ({
              type: 'chat:cleared',
              payload: { chatId, chat: decoratedChat },
            }));
            break;
          }

          case 'chat:create': {
            const p = event.payload;
            const onlineIds = getOnlineUserIds();
            if (p.type === 'private' && p.targetUserId) {
              const existing = storage.findExistingDirectChat(me.id, p.targetUserId);
              if (existing) {
                sendWs(ws, {
                  type: 'chat:created',
                  payload: {
                    chat: storage.decorateChatForUser(existing, me.id, onlineIds),
                    messages: storage.getChatMessages(existing.id),
                  },
                });
                break;
              }
            }

            const nowIso = new Date().toISOString();
            const targetAcc = p.targetUserId
              ? storage.getAccountById(p.targetUserId)
              : undefined;

            const participantIds = targetAcc ? [me.id, targetAcc.id] : [me.id];
            const groupMembers: ChatMember[] | undefined =
              p.type === 'group'
                ? [
                    {
                      id: me.id,
                      name: buildFullName(me.firstName, me.lastName),
                      username: `@${me.username}`,
                      role: 'owner',
                      avatarUrl: me.avatarUrl,
                      avatarColor: me.avatarColor,
                      online: true,
                      lastSeenAt: me.lastSeenAt,
                      lastSeenText: 'в сети',
                    },
                  ]
                : undefined;

            if (p.type === 'group' && groupMembers && p.memberNames) {
              for (let i = 0; i < p.memberNames.length; i++) {
                const rawName = p.memberNames[i].trim();
                if (!rawName) continue;
                const matchedAcc = storage.getAccountByUsername(rawName);
                if (matchedAcc && matchedAcc.id !== me.id) {
                  if (!participantIds.includes(matchedAcc.id)) {
                    participantIds.push(matchedAcc.id);
                    const presence = storage.getPresenceForAccount(matchedAcc, onlineIds);
                    groupMembers.push({
                      id: matchedAcc.id,
                      name: buildFullName(matchedAcc.firstName, matchedAcc.lastName),
                      username: `@${matchedAcc.username}`,
                      role: 'member',
                      avatarUrl: matchedAcc.avatarUrl,
                      avatarColor: matchedAcc.avatarColor,
                      online: presence.online,
                      lastSeenAt: presence.lastSeenAt,
                      lastSeenText: presence.lastSeenText,
                    });
                  }
                } else {
                  groupMembers.push({
                    id: `mem-${Date.now()}-${i}`,
                    name: rawName,
                    username: rawName.startsWith('@') ? rawName : `@member_${i + 1}`,
                    role: 'member',
                    avatarColor: '#65AADD',
                    online: false,
                    lastSeenText: 'был(а) недавно',
                  });
                }
              }
            }

            const targetPresence = targetAcc
              ? storage.getPresenceForAccount(targetAcc, onlineIds)
              : null;

            const newChat: ChatThread = {
              id: p.id,
              type: p.type,
              title: targetAcc
                ? buildFullName(targetAcc.firstName, targetAcc.lastName)
                : p.title.trim(),
              username: targetAcc
                ? `@${targetAcc.username}`
                : p.username?.trim() || undefined,
              bio: targetAcc ? targetAcc.bio : p.bio?.trim() || undefined,
              avatarUrl: targetAcc?.avatarUrl,
              avatarColor: targetAcc?.avatarColor || p.avatarColor || '#3390EC',
              ownerId: me.id,
              participantIds,
              online: targetPresence?.online ?? false,
              lastSeenAt: targetPresence?.lastSeenAt,
              lastSeenText: targetPresence?.lastSeenText,
              memberCount:
                p.type === 'group'
                  ? groupMembers?.length ?? 1
                  : p.type === 'channel'
                    ? 1
                    : undefined,
              members: groupMembers,
              pinned: false,
              muted: false,
              archived: false,
              unreadCount: 0,
              canPost: true,
              lastMessageAt: nowIso,
            };

            storage.upsertChat(newChat, []);
            storage.publishClusterEvent({ type: 'chat:upsert', chat: newChat, messages: [] });

            broadcastPersonalizedChatEvent(newChat, (decoratedChat) => ({
              type: 'chat:created',
              payload: { chat: decoratedChat, messages: [] },
            }));
            break;
          }

          case 'typing:set': {
            const chat = storage.getChatById(event.payload.chatId);
            if (!chat) break;
            const senderName = buildFullName(me.firstName, me.lastName);
            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = {
              type: 'typing:update',
              payload: {
                chatId: event.payload.chatId,
                userId: me.id,
                userName: senderName,
                isTyping: event.payload.isTyping,
              },
            };
            if (targets) broadcastToUsers(targets, evt, ws);
            else broadcastAll(evt, ws);

            storage.publishClusterEvent({
              type: 'typing:update',
              chatId: event.payload.chatId,
              userId: me.id,
              userName: senderName,
              isTyping: event.payload.isTyping,
            });
            break;
          }

          case 'profile:update': {
            const p = event.payload;
            const check = validateProfileInput({
              firstName: p.firstName,
              lastName: p.lastName,
              username: p.username,
              bio: p.bio,
            });
            if (!check.valid) break;
            const updated = storage.updateAccountProfile(me.id, {
              ...p,
              firstName: check.normalizedFirstName,
              lastName: check.normalizedLastName,
              username: check.normalizedUsername,
            });
            if (updated) {
              const userProfile = storage.toUserProfile(updated, true);
              const publicSummary = storage.toPublicUserSummary(
                updated,
                getOnlineUserIds(),
              );
              broadcastToUsers(new Set([me.id]), {
                type: 'profile:updated',
                payload: { user: userProfile },
              });
              broadcastAll({
                type: 'user:profile_changed',
                payload: { user: publicSummary },
              });
              broadcastAll({
                type: 'directory:updated',
                payload: { user: publicSummary },
              });
              storage.publishClusterEvent({ type: 'account:upsert', account: updated });
            }
            break;
          }

          case 'settings:update': {
            const prevLastSeen = me.settings?.privacy?.lastSeen;
            const updated = storage.updateAccountSettings(me.id, event.payload);
            if (updated) {
              broadcastToUsers(new Set([me.id]), {
                type: 'settings:updated',
                payload: { settings: updated.settings },
              });
              if (updated.settings?.privacy?.lastSeen !== prevLastSeen) {
                broadcastPresenceForUser(me.id, true);
              }
            }
            break;
          }

          case 'call:start': {
            const { chatId, mode } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat || (chat.type !== 'private' && chat.type !== 'group')) break;

            // Check if a call already exists in this chat
            let existingCall: ActiveCallRoom | undefined;
            for (const c of activeCalls.values()) {
              if (c.chatId === chatId) {
                existingCall = c;
                break;
              }
            }

            const participant: CallParticipant = {
              userId: me.id,
              name: buildFullName(me.firstName, me.lastName),
              username: `@${me.username}`,
              avatarUrl: me.avatarUrl,
              avatarColor: me.avatarColor,
              micMuted: false,
              videoEnabled: mode === 'video',
              screenSharing: false,
              joinedAt: new Date().toISOString(),
            };

            if (existingCall) {
              if (!existingCall.participants.some((p) => p.userId === me.id)) {
                existingCall.participants.push(participant);
              }
              broadcastCallToChat(chat, {
                type: 'call:room_updated',
                payload: { call: existingCall },
              });
              break;
            }

            const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newCall: ActiveCallRoom = {
              callId,
              chatId: chat.id,
              chatTitle: chat.title,
              chatType: chat.type,
              mode,
              initiatorId: me.id,
              initiatorName: participant.name,
              startedAt: new Date().toISOString(),
              participants: [participant],
            };
            activeCalls.set(callId, newCall);

            // Notify caller with room state immediately
            sendWs(ws, {
              type: 'call:room_updated',
              payload: { call: newCall },
            });

            // Notify other chat participants of incoming call
            const targets = getTargetUserIdsForChat(chat);
            if (targets) {
              const others = new Set(Array.from(targets).filter((id) => id !== me.id));
              broadcastToUsers(others, {
                type: 'call:incoming',
                payload: { call: newCall },
              });
              broadcastToUsers(others, {
                type: 'call:room_updated',
                payload: { call: newCall },
              });
            } else {
              broadcastAll(
                { type: 'call:incoming', payload: { call: newCall } },
                ws,
              );
              broadcastAll(
                { type: 'call:room_updated', payload: { call: newCall } },
                ws,
              );
            }
            break;
          }

          case 'call:join': {
            const { callId, mode } = event.payload;
            const call = activeCalls.get(callId);
            if (!call) break;
            const chat = storage.getChatById(call.chatId);
            if (!chat) break;

            const existingIdx = call.participants.findIndex(
              (p) => p.userId === me.id,
            );
            const participant: CallParticipant = {
              userId: me.id,
              name: buildFullName(me.firstName, me.lastName),
              username: `@${me.username}`,
              avatarUrl: me.avatarUrl,
              avatarColor: me.avatarColor,
              micMuted: false,
              videoEnabled: (mode ?? call.mode) === 'video',
              screenSharing: false,
              joinedAt: new Date().toISOString(),
            };

            if (existingIdx >= 0) {
              call.participants[existingIdx] = participant;
            } else {
              call.participants.push(participant);
            }

            broadcastCallToChat(chat, {
              type: 'call:room_updated',
              payload: { call },
            });
            break;
          }

          case 'call:decline': {
            const { callId } = event.payload;
            const call = activeCalls.get(callId);
            if (!call) break;
            if (call.chatType === 'private') {
              activeCalls.delete(callId);
              const chat = storage.getChatById(call.chatId);
              const endEvt: ServerWsEvent = {
                type: 'call:ended',
                payload: {
                  callId: call.callId,
                  chatId: call.chatId,
                  reason: 'Звонок отклонён',
                },
              };
              if (chat) broadcastCallToChat(chat, endEvt);
              else broadcastAll(endEvt);
            }
            break;
          }

          case 'call:leave': {
            removeUserFromCall(event.payload.callId, me.id, 'Звонок завершён');
            break;
          }

          case 'call:signal': {
            const { callId, targetUserId, signal } = event.payload;
            const call = activeCalls.get(callId);
            if (!call) break;
            if (!call.participants.some((p) => p.userId === me.id)) break;
            broadcastToUsers(new Set([targetUserId]), {
              type: 'call:signal',
              payload: {
                callId,
                fromUserId: me.id,
                signal,
              },
            });
            break;
          }

          case 'call:media_state': {
            const { callId, micMuted, videoEnabled, screenSharing } = event.payload;
            const call = activeCalls.get(callId);
            if (!call) break;
            const participant = call.participants.find((p) => p.userId === me.id);
            if (!participant) break;
            participant.micMuted = Boolean(micMuted);
            participant.videoEnabled = Boolean(videoEnabled);
            participant.screenSharing = Boolean(screenSharing);

            const chat = storage.getChatById(call.chatId);
            const updEvt: ServerWsEvent = {
              type: 'call:room_updated',
              payload: { call },
            };
            if (chat) broadcastCallToChat(chat, updEvt);
            else broadcastAll(updEvt);
            break;
          }
        }
      } catch (err) {
        console.warn('Invalid WebSocket payload:', err);
      }
    });

    ws.on('close', () => {
      const closed = activeClients.get(ws);
      activeClients.delete(ws);
      if (closed) {
        removeUserFromAllCalls(closed.userId);
        if (!hasLocalConnectionForUser(closed.userId)) {
          storage.touchAccountLastSeen(closed.userId);
          broadcastPresenceForUser(closed.userId, true);
        }
      }
      broadcastAll({
        type: 'presence:count',
        payload: { onlineClientCount: activeClients.size },
      });
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Тилиграм server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Тилиграм server:', err);
  process.exit(1);
});
