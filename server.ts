import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { TiligramStorage } from './src/server/storage.ts';
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
import type {
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
}

const activeClients = new Map<WebSocket, AuthedSocket>();

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

function extractBearerUserId(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return storage.verifyToken(token);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '40mb' }));

  // --- Health ---
  app.get('/api/health', async (_req, res) => {
    const supabase = await storage.checkSupabaseHealth();
    res.json({
      ok: true,
      onlineClients: activeClients.size,
      storage: supabase.tablesReady ? 'supabase' : 'local',
      supabase,
    });
  });

  // --- Auth Endpoints ---
  app.get('/api/auth/check-username', (req, res) => {
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

  app.post('/api/auth/register', (req, res) => {
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

    const { account } = storage.registerAccount({
      firstName: check.firstName,
      lastName: check.lastName,
      username: check.username,
      password: String(body.password),
    });

    const token = storage.signToken(account.id);
    res.status(201).json({
      token,
      user: storage.toUserProfile(account, true),
      settings: account.settings,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const rawUsername = String(req.body?.username ?? '');
    const password = String(req.body?.password ?? '');
    const acc = storage.getAccountByUsername(rawUsername);

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

  app.get('/api/auth/me', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Неавторизован' });
      return;
    }
    const acc = storage.getAccountById(userId);
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
  app.get('/api/users/search', (req, res) => {
    const userId = extractBearerUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const q = String(req.query.q ?? '');
    const users = storage.searchAccounts(q, userId);
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

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString()) as ClientWsEvent;

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

          activeClients.set(ws, { ws, userId });

          sendWs(ws, {
            type: 'sync:init',
            payload: {
              currentUser: storage.toUserProfile(acc, true),
              settings: acc.settings,
              chats: storage.getChatsForUser(userId),
              messagesByChat: storage.getMessagesForUser(userId),
              stickerPacks: storage.getStickerPacks(),
              onlineClientCount: activeClients.size,
            },
          });

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
              status: 'read',
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

            const targets = getTargetUserIdsForChat(chat);
            const createdEvt: ServerWsEvent = {
              type: 'message:created',
              payload: { message, chat },
            };
            if (targets) broadcastToUsers(targets, createdEvt);
            else broadcastAll(createdEvt);
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

            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = {
              type: 'message:deleted',
              payload: { chatId, messageId, chat },
            };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
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

            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = { type: 'chat:updated', payload: { chat } };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
            break;
          }

          case 'chat:mark_read': {
            const { chatId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;
            chat.unreadCount = 0;
            storage.upsertChat(chat);
            sendWs(ws, { type: 'chat:updated', payload: { chat } });
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
            sendWs(ws, { type: 'chat:updated', payload: { chat } });
            break;
          }

          case 'chat:clear_history': {
            const { chatId } = event.payload;
            const chat = storage.getChatById(chatId);
            if (!chat) break;
            chat.pinnedMessageId = null;
            chat.unreadCount = 0;
            storage.clearChatMessages(chatId, chat);

            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = {
              type: 'chat:cleared',
              payload: { chatId, chat },
            };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
            break;
          }

          case 'chat:create': {
            const p = event.payload;
            if (p.type === 'private' && p.targetUserId) {
              const existing = storage.findExistingDirectChat(me.id, p.targetUserId);
              if (existing) {
                sendWs(ws, {
                  type: 'chat:created',
                  payload: {
                    chat: existing,
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
              participantIds: targetAcc ? [me.id, targetAcc.id] : [me.id],
              online: p.type === 'private',
              lastSeenText: p.type === 'private' ? 'в сети' : undefined,
              memberCount:
                p.type === 'group'
                  ? 1 + (p.memberNames?.length ?? 0)
                  : p.type === 'channel'
                    ? 1
                    : undefined,
              members:
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
                      },
                      ...(p.memberNames ?? []).map((name, i) => ({
                        id: `mem-${Date.now()}-${i}`,
                        name,
                        username: `@member_${i + 1}`,
                        role: 'member' as const,
                        avatarColor: '#65AADD',
                        online: false,
                      })),
                    ]
                  : undefined,
              pinned: false,
              muted: false,
              archived: false,
              unreadCount: 0,
              canPost: true,
              lastMessageAt: nowIso,
            };

            storage.upsertChat(newChat, []);

            const targets = getTargetUserIdsForChat(newChat);
            const evt: ServerWsEvent = {
              type: 'chat:created',
              payload: { chat: newChat, messages: [] },
            };
            if (targets) broadcastToUsers(targets, evt);
            else broadcastAll(evt);
            break;
          }

          case 'typing:set': {
            const chat = storage.getChatById(event.payload.chatId);
            if (!chat) break;
            const targets = getTargetUserIdsForChat(chat);
            const evt: ServerWsEvent = {
              type: 'typing:update',
              payload: {
                chatId: event.payload.chatId,
                userId: me.id,
                userName: buildFullName(me.firstName, me.lastName),
                isTyping: event.payload.isTyping,
              },
            };
            if (targets) broadcastToUsers(targets, evt, ws);
            else broadcastAll(evt, ws);
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
              broadcastToUsers(new Set([me.id]), {
                type: 'profile:updated',
                payload: { user: userProfile },
              });
            }
            break;
          }

          case 'settings:update': {
            const updated = storage.updateAccountSettings(me.id, event.payload);
            if (updated) {
              broadcastToUsers(new Set([me.id]), {
                type: 'settings:updated',
                payload: { settings: updated.settings },
              });
            }
            break;
          }
        }
      } catch (err) {
        console.warn('Invalid WebSocket payload:', err);
      }
    });

    ws.on('close', () => {
      activeClients.delete(ws);
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
