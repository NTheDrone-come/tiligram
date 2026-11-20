import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createStarterStickerPacks,
  DEFAULT_APP_SETTINGS,
} from '../data/seedData.ts';
import {
  computeFileRetention,
  formatFileSize,
  isFileExpired,
} from '../utils/fileRetention.ts';
import { buildFullName, formatLastSeen } from '../utils/chatLogic.ts';
import type {
  AppSettings,
  ChatMessage,
  ChatThread,
  CustomSticker,
  FileRetentionPolicy,
  PublicUserSummary,
  StickerPack,
  UserProfile,
} from '../types/telegram.ts';

export interface StoredAccount {
  id: string;
  firstName: string;
  lastName: string;
  username: string; // lowercase without @
  passwordHash: string;
  passwordSalt: string;
  bio: string;
  phone: string;
  birthday: string;
  city: string;
  statusEmoji: string;
  avatarUrl?: string;
  avatarColor: string;
  profileAccent: string;
  settings: AppSettings;
  createdAt: string;
  lastSeenAt: string;
}

export interface StoredFileMeta {
  id: string;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  retentionPolicy: FileRetentionPolicy;
  storagePath: string;
  createdAt: string;
  expiresAt: string | null;
}

interface PersistedDatabase {
  tokenSecret: string;
  accounts: StoredAccount[];
  chats: ChatThread[];
  messagesByChat: Record<string, ChatMessage[]>;
  files: StoredFileMeta[];
  stickerPacks: StickerPack[];
}

const DATA_FILE = path.resolve(process.cwd(), '.tiligram-data.json');
const UPLOADS_DIR = path.resolve(process.cwd(), '.tiligram-uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function createEmptyDb(): PersistedDatabase {
  return {
    tokenSecret: crypto.randomBytes(32).toString('hex'),
    accounts: [],
    chats: [],
    messagesByChat: {},
    files: [],
    stickerPacks: createStarterStickerPacks(),
  };
}

function loadLocalDb(): PersistedDatabase {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.chats)) {
        return {
          tokenSecret: parsed.tokenSecret || crypto.randomBytes(32).toString('hex'),
          accounts: parsed.accounts,
          chats: parsed.chats,
          messagesByChat: parsed.messagesByChat ?? {},
          files: Array.isArray(parsed.files) ? parsed.files : [],
          stickerPacks:
            Array.isArray(parsed.stickerPacks) && parsed.stickerPacks.length > 0
              ? parsed.stickerPacks
              : createStarterStickerPacks(),
        };
      }
    }
  } catch (err) {
    console.warn('Could not load local Tiligram DB, starting fresh:', err);
  }
  return createEmptyDb();
}

export type ClusterSyncEvent =
  | { type: 'account:upsert'; account: StoredAccount }
  | { type: 'chat:upsert'; chat: ChatThread; messages?: ChatMessage[] }
  | { type: 'message:upsert'; message: ChatMessage; chat: ChatThread }
  | { type: 'message:delete'; chatId: string; messageId: string; chat: ChatThread }
  | { type: 'chat:clear'; chatId: string; chat: ChatThread }
  | { type: 'messages:read'; chatId: string; messageIds: string[]; readerId: string; readAt: string }
  | { type: 'typing:update'; chatId: string; userId: string; userName: string; isTyping: boolean }
  | { type: 'presence:update'; userId: string; online: boolean; lastSeenAt: string }
  | { type: 'stickers:updated'; stickerPacks: StickerPack[] };

function deriveStableTokenSecret(fallback: string): string {
  const seed = (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  if (!seed) return fallback;
  return crypto
    .createHash('sha256')
    .update(`tiligram-token-secret-v1:${seed}`)
    .digest('hex');
}

export class TiligramStorage {
  private db: PersistedDatabase;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private supabase: SupabaseClient | null = null;
  private clusterChannel: ReturnType<SupabaseClient['channel']> | null = null;
  private readonly instanceId = `inst-${crypto.randomBytes(6).toString('hex')}`;
  private lastAccountsRefreshMs = 0;
  public readonly ready: Promise<void>;

  constructor() {
    this.db = loadLocalDb();
    this.db.tokenSecret = deriveStableTokenSecret(this.db.tokenSecret);

    const stripQuotes = (v?: string) => v?.trim().replace(/^["']|["']$/g, '') ?? '';
    const sbUrl = stripQuotes(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    );
    const sbKey = stripQuotes(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_KEY,
    );
    if (sbUrl && sbKey && sbUrl.startsWith('http') && !sbUrl.includes('YOUR_PROJECT_REF')) {
      this.supabase = createClient(sbUrl, sbKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.ready = this.hydrateFromSupabase();
    } else {
      this.ready = Promise.resolve();
    }
  }

  public startClusterSync(onRemoteEvent: (event: ClusterSyncEvent) => void): void {
    if (!this.supabase || this.clusterChannel) return;
    try {
      const channel = this.supabase.channel('tiligram-cluster-v1', {
        config: { broadcast: { self: false } },
      });
      channel
        .on('broadcast', { event: 'sync' }, (payload: { payload?: { origin?: string; data?: ClusterSyncEvent } }) => {
          const envelope = payload?.payload;
          if (!envelope || envelope.origin === this.instanceId || !envelope.data) return;
          this.applyClusterEventToCache(envelope.data);
          onRemoteEvent(envelope.data);
        })
        .subscribe();
      this.clusterChannel = channel;
    } catch (err) {
      console.warn('Supabase Realtime cluster channel skipped:', err);
    }
  }

  public publishClusterEvent(data: ClusterSyncEvent): void {
    if (!this.clusterChannel) return;
    void this.clusterChannel
      .send({
        type: 'broadcast',
        event: 'sync',
        payload: { origin: this.instanceId, data },
      })
      .catch(() => {
        // non-fatal on single instance
      });
  }

  private applyClusterEventToCache(evt: ClusterSyncEvent): void {
    switch (evt.type) {
      case 'account:upsert': {
        const idx = this.db.accounts.findIndex((a) => a.id === evt.account.id);
        if (idx === -1) this.db.accounts.push(evt.account);
        else this.db.accounts[idx] = evt.account;
        break;
      }
      case 'chat:upsert': {
        const idx = this.db.chats.findIndex((c) => c.id === evt.chat.id);
        if (idx === -1) this.db.chats.unshift(evt.chat);
        else this.db.chats[idx] = evt.chat;
        if (evt.messages) {
          this.db.messagesByChat[evt.chat.id] = evt.messages;
        } else if (!this.db.messagesByChat[evt.chat.id]) {
          this.db.messagesByChat[evt.chat.id] = [];
        }
        break;
      }
      case 'message:upsert': {
        const list = this.db.messagesByChat[evt.message.chatId] ?? [];
        const idx = list.findIndex((m) => m.id === evt.message.id);
        if (idx === -1) list.push(evt.message);
        else list[idx] = evt.message;
        this.db.messagesByChat[evt.message.chatId] = list;
        const cIdx = this.db.chats.findIndex((c) => c.id === evt.chat.id);
        if (cIdx === -1) this.db.chats.unshift(evt.chat);
        else this.db.chats[cIdx] = evt.chat;
        break;
      }
      case 'message:delete': {
        const list = this.db.messagesByChat[evt.chatId] ?? [];
        this.db.messagesByChat[evt.chatId] = list.filter((m) => m.id !== evt.messageId);
        const cIdx = this.db.chats.findIndex((c) => c.id === evt.chat.id);
        if (cIdx !== -1) this.db.chats[cIdx] = evt.chat;
        break;
      }
      case 'chat:clear': {
        this.db.messagesByChat[evt.chatId] = [];
        const cIdx = this.db.chats.findIndex((c) => c.id === evt.chat.id);
        if (cIdx !== -1) this.db.chats[cIdx] = evt.chat;
        break;
      }
      case 'messages:read': {
        const list = this.db.messagesByChat[evt.chatId] ?? [];
        const idSet = new Set(evt.messageIds);
        for (const m of list) {
          if (idSet.has(m.id)) {
            m.status = 'read';
            const readBy = m.readBy ?? [];
            if (!readBy.includes(evt.readerId)) {
              m.readBy = [...readBy, evt.readerId];
            }
          }
        }
        break;
      }
      case 'presence:update': {
        const acc = this.getAccountById(evt.userId);
        if (acc && evt.lastSeenAt) {
          acc.lastSeenAt = evt.lastSeenAt;
        }
        break;
      }
      case 'stickers:updated': {
        this.db.stickerPacks = evt.stickerPacks;
        break;
      }
    }
  }

  public async refreshAccountsFromSupabase(force = false): Promise<void> {
    if (!this.supabase) return;
    const now = Date.now();
    if (!force && now - this.lastAccountsRefreshMs < 1500) return;
    this.lastAccountsRefreshMs = now;
    try {
      const { data, error } = await this.supabase.from('tiligram_accounts').select('*');
      if (!error && Array.isArray(data)) {
        const remoteMap = new Map<string, StoredAccount>();
        for (const r of data as any[]) {
          remoteMap.set(r.id, {
            id: r.id,
            firstName: r.first_name,
            lastName: r.last_name ?? '',
            username: r.username,
            passwordHash: r.password_hash,
            passwordSalt: r.password_salt,
            bio: r.bio ?? '',
            phone: r.phone ?? '',
            birthday: r.birthday ?? '',
            city: r.city ?? '',
            statusEmoji: r.status_emoji ?? '',
            avatarUrl: r.avatar_url ?? undefined,
            avatarColor: r.avatar_color ?? '#3390EC',
            profileAccent: r.profile_accent ?? '#3390EC',
            settings: { ...DEFAULT_APP_SETTINGS, ...(r.settings ?? {}) },
            createdAt: r.created_at,
            lastSeenAt: r.last_seen_at,
          });
        }
        for (const local of this.db.accounts) {
          if (!remoteMap.has(local.id)) remoteMap.set(local.id, local);
        }
        this.db.accounts = Array.from(remoteMap.values());
      }
    } catch {
      // ignore transient network errors
    }
  }

  public isSupabaseConfigured(): boolean {
    return this.supabase !== null;
  }

  public async checkSupabaseHealth(): Promise<{
    configured: boolean;
    connected: boolean;
    tablesReady: boolean;
    accountCount?: number;
    error?: string;
  }> {
    if (!this.supabase) {
      return { configured: false, connected: false, tablesReady: false };
    }
    try {
      const { count, error } = await this.supabase
        .from('tiligram_accounts')
        .select('id', { count: 'exact', head: true });
      if (error) {
        return {
          configured: true,
          connected: true,
          tablesReady: false,
          error: error.message,
        };
      }
      return {
        configured: true,
        connected: true,
        tablesReady: true,
        accountCount: count ?? 0,
      };
    } catch (err) {
      return {
        configured: true,
        connected: false,
        tablesReady: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  private async hydrateFromSupabase(): Promise<void> {
    if (!this.supabase) return;
    try {
      const [accRes, chatRes, msgRes, fileRes, packRes] = await Promise.all([
        this.supabase.from('tiligram_accounts').select('*'),
        this.supabase.from('tiligram_chats').select('*'),
        this.supabase.from('tiligram_messages').select('*').order('created_at', { ascending: true }),
        this.supabase.from('tiligram_files').select('*'),
        this.supabase.from('tiligram_sticker_packs').select('*'),
      ]);

      if (!accRes.error && Array.isArray(accRes.data) && accRes.data.length > 0) {
        this.db.accounts = accRes.data.map((r: any) => ({
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name ?? '',
          username: r.username,
          passwordHash: r.password_hash,
          passwordSalt: r.password_salt,
          bio: r.bio ?? '',
          phone: r.phone ?? '',
          birthday: r.birthday ?? '',
          city: r.city ?? '',
          statusEmoji: r.status_emoji ?? '',
          avatarUrl: r.avatar_url ?? undefined,
          avatarColor: r.avatar_color ?? '#3390EC',
          profileAccent: r.profile_accent ?? '#3390EC',
          settings: { ...DEFAULT_APP_SETTINGS, ...(r.settings ?? {}) },
          createdAt: r.created_at,
          lastSeenAt: r.last_seen_at,
        }));
      }

      if (!chatRes.error && Array.isArray(chatRes.data)) {
        this.db.chats = chatRes.data.map((r: any) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          username: r.username ?? undefined,
          bio: r.bio ?? undefined,
          avatarUrl: r.avatar_url ?? undefined,
          avatarColor: r.avatar_color ?? '#3390EC',
          ownerId: r.owner_id,
          participantIds: Array.isArray(r.participant_ids) ? r.participant_ids : [],
          members: Array.isArray(r.members) ? r.members : undefined,
          pinned: Boolean(r.pinned),
          muted: Boolean(r.muted),
          archived: Boolean(r.archived),
          unreadCount: 0,
          pinnedMessageId: r.pinned_message_id ?? null,
          canPost: r.can_post !== false,
          lastMessageAt: r.last_message_at,
        }));
      }

      if (!msgRes.error && Array.isArray(msgRes.data)) {
        const grouped: Record<string, ChatMessage[]> = {};
        for (const r of msgRes.data as any[]) {
          const msg: ChatMessage = {
            id: r.id,
            chatId: r.chat_id,
            senderId: r.sender_id,
            senderName: r.sender_name,
            senderColor: r.sender_color ?? undefined,
            kind: r.kind,
            text: r.text ?? '',
            createdAt: r.created_at,
            editedAt: r.edited_at ?? undefined,
            status: r.status ?? 'read',
            replyToId: r.reply_to_id ?? undefined,
            forwardedFrom: r.forwarded_from ?? undefined,
            reactions: Array.isArray(r.reactions) ? r.reactions : [],
            attachment: r.attachment ?? undefined,
          };
          if (!grouped[msg.chatId]) grouped[msg.chatId] = [];
          grouped[msg.chatId].push(msg);
        }
        this.db.messagesByChat = grouped;
      }

      if (!fileRes.error && Array.isArray(fileRes.data)) {
        this.db.files = fileRes.data.map((r: any) => ({
          id: r.id,
          uploaderId: r.uploader_id,
          originalName: r.original_name,
          mimeType: r.mime_type,
          sizeBytes: Number(r.size_bytes),
          retentionPolicy: r.retention_policy,
          storagePath: r.storage_path,
          createdAt: r.created_at,
          expiresAt: r.expires_at ?? null,
        }));
      }

      if (!packRes.error && Array.isArray(packRes.data) && packRes.data.length > 0) {
        const remotePacks: StickerPack[] = packRes.data.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          description: r.description ?? '',
          authorId: r.author_id,
          authorName: r.author_name,
          stickers: Array.isArray(r.stickers) ? r.stickers : [],
          createdAt: r.created_at,
        }));
        const starter = createStarterStickerPacks();
        const existingIds = new Set(remotePacks.map((p) => p.id));
        this.db.stickerPacks = [
          ...starter.filter((p) => !existingIds.has(p.id)),
          ...remotePacks,
        ];
      }

      this.scheduleLocalPersist();
    } catch (err) {
      console.warn('Supabase hydration skipped (tables may not be created yet):', err);
    }
  }

  private scheduleLocalPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(this.db, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to persist Tiligram DB:', err);
      }
    }, 120);
  }

  private async syncAccountToSupabase(account: StoredAccount): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.from('tiligram_accounts').upsert({
      id: account.id,
      first_name: account.firstName,
      last_name: account.lastName,
      username: account.username,
      password_hash: account.passwordHash,
      password_salt: account.passwordSalt,
      bio: account.bio,
      phone: account.phone,
      birthday: account.birthday,
      city: account.city,
      status_emoji: account.statusEmoji,
      avatar_url: account.avatarUrl ?? null,
      avatar_color: account.avatarColor,
      profile_accent: account.profileAccent,
      settings: account.settings,
      created_at: account.createdAt,
      last_seen_at: account.lastSeenAt,
    });
  }

  private async syncChatToSupabase(chat: ChatThread): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.from('tiligram_chats').upsert({
      id: chat.id,
      type: chat.type,
      title: chat.title,
      username: chat.username ?? null,
      bio: chat.bio ?? null,
      avatar_url: chat.avatarUrl ?? null,
      avatar_color: chat.avatarColor,
      owner_id: chat.ownerId ?? '',
      participant_ids: chat.participantIds ?? [],
      members: chat.members ?? [],
      pinned: chat.pinned,
      muted: chat.muted,
      archived: chat.archived,
      pinned_message_id: chat.pinnedMessageId ?? null,
      can_post: chat.canPost !== false,
      last_message_at: chat.lastMessageAt,
    });
  }

  private async syncMessageToSupabase(msg: ChatMessage): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.from('tiligram_messages').upsert({
      id: msg.id,
      chat_id: msg.chatId,
      sender_id: msg.senderId,
      sender_name: msg.senderName,
      sender_color: msg.senderColor ?? null,
      kind: msg.kind,
      text: msg.text,
      created_at: msg.createdAt,
      edited_at: msg.editedAt ?? null,
      status: msg.status,
      reply_to_id: msg.replyToId ?? null,
      forwarded_from: msg.forwardedFrom ?? null,
      reactions: msg.reactions,
      attachment: msg.attachment ?? null,
    });
  }

  private async syncPackToSupabase(pack: StickerPack): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.from('tiligram_sticker_packs').upsert({
      id: pack.id,
      slug: pack.slug,
      title: pack.title,
      description: pack.description,
      author_id: pack.authorId,
      author_name: pack.authorName,
      stickers: pack.stickers,
      created_at: pack.createdAt,
    });
  }

  // --- Password & Token Helpers ---
  public hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const finalSalt = salt || crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, finalSalt, 64).toString('hex');
    return { hash: derived, salt: finalSalt };
  }

  public verifyPassword(password: string, storedHash: string, salt: string): boolean {
    const candidate = crypto.scryptSync(password, salt, 64);
    const existing = Buffer.from(storedHash, 'hex');
    if (candidate.length !== existing.length) return false;
    return crypto.timingSafeEqual(candidate, existing);
  }

  public signToken(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ uid: userId, iat: Date.now() }),
      'utf-8',
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.db.tokenSecret)
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  }

  public verifyToken(token: string | undefined): string | null {
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto
      .createHmac('sha256', this.db.tokenSecret)
      .update(payload)
      .digest('base64url');
    if (sig.length !== expected.length) return null;
    const valid = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!valid) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
        uid?: string;
      };
      return parsed.uid ?? null;
    } catch {
      return null;
    }
  }

  // --- Account Operations ---
  public isLastSeenHidden(acc: StoredAccount): boolean {
    return acc.settings?.privacy?.lastSeen === 'nobody';
  }

  public getPresenceForAccount(
    acc: StoredAccount,
    onlineUserIds: Set<string>,
  ): { online: boolean; lastSeenAt?: string; lastSeenText: string } {
    const hidden = this.isLastSeenHidden(acc);
    if (hidden) {
      return { online: false, lastSeenAt: undefined, lastSeenText: 'был(а) недавно' };
    }
    const isOnline = onlineUserIds.has(acc.id);
    return {
      online: isOnline,
      lastSeenAt: acc.lastSeenAt,
      lastSeenText: formatLastSeen(acc.lastSeenAt, isOnline, false),
    };
  }

  public toUserProfile(acc: StoredAccount, isOnline = true): UserProfile {
    return {
      id: acc.id,
      firstName: acc.firstName,
      lastName: acc.lastName,
      name: buildFullName(acc.firstName, acc.lastName),
      username: `@${acc.username}`,
      bio: acc.bio,
      phone: acc.phone,
      birthday: acc.birthday,
      city: acc.city,
      statusEmoji: acc.statusEmoji,
      avatarUrl: acc.avatarUrl,
      avatarColor: acc.avatarColor,
      profileAccent: acc.profileAccent,
      online: isOnline,
      lastSeen: formatLastSeen(acc.lastSeenAt, isOnline, false),
      createdAt: acc.createdAt,
    };
  }

  public toPublicUserSummary(
    acc: StoredAccount,
    onlineUserIds: Set<string> = new Set(),
  ): PublicUserSummary {
    const presence = this.getPresenceForAccount(acc, onlineUserIds);
    const hideBirthday = acc.settings?.privacy?.birthday === 'nobody';
    return {
      id: acc.id,
      firstName: acc.firstName,
      lastName: acc.lastName,
      name: buildFullName(acc.firstName, acc.lastName),
      username: `@${acc.username}`,
      bio: acc.bio,
      phone: acc.phone,
      birthday: hideBirthday ? '' : acc.birthday,
      city: acc.city,
      avatarUrl: acc.avatarUrl,
      avatarColor: acc.avatarColor,
      profileAccent: acc.profileAccent,
      statusEmoji: acc.statusEmoji,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt,
      lastSeenText: presence.lastSeenText,
      createdAt: acc.createdAt,
    };
  }

  public touchAccountLastSeen(userId: string): StoredAccount | null {
    const acc = this.getAccountById(userId);
    if (!acc) return null;
    acc.lastSeenAt = new Date().toISOString();
    this.scheduleLocalPersist();
    void this.syncAccountToSupabase(acc);
    return acc;
  }

  public isUsernameAvailable(username: string, excludeUserId?: string): boolean {
    const lower = username.trim().replace(/^@+/, '').toLowerCase();
    return !this.db.accounts.some(
      (a) => a.username.toLowerCase() === lower && a.id !== excludeUserId,
    );
  }

  public getAccountById(id: string): StoredAccount | undefined {
    return this.db.accounts.find((a) => a.id === id);
  }

  public getAccountByUsername(username: string): StoredAccount | undefined {
    const lower = username.trim().replace(/^@+/, '').toLowerCase();
    return this.db.accounts.find((a) => a.username.toLowerCase() === lower);
  }

  public searchAccounts(
    query: string,
    excludeUserId: string,
    onlineUserIds: Set<string> = new Set(),
  ): PublicUserSummary[] {
    const q = query.trim().replace(/^@+/, '').toLowerCase();
    return this.db.accounts
      .filter((a) => {
        if (a.id === excludeUserId) return false;
        if (!q) return true;
        const fullName = buildFullName(a.firstName, a.lastName).toLowerCase();
        return a.username.toLowerCase().includes(q) || fullName.includes(q);
      })
      .slice(0, 30)
      .map((a) => this.toPublicUserSummary(a, onlineUserIds));
  }

  public registerAccount(params: {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
  }): { account: StoredAccount; savedChat: ChatThread } {
    const nowIso = new Date().toISOString();
    const id = `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const { hash, salt } = this.hashPassword(params.password);
    const cleanUsername = params.username.trim().replace(/^@+/, '').toLowerCase();

    const account: StoredAccount = {
      id,
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      username: cleanUsername,
      passwordHash: hash,
      passwordSalt: salt,
      bio: '',
      phone: '',
      birthday: '',
      city: '',
      statusEmoji: '',
      avatarColor: '#3390EC',
      profileAccent: '#3390EC',
      settings: structuredClone(DEFAULT_APP_SETTINGS),
      createdAt: nowIso,
      lastSeenAt: nowIso,
    };

    const savedChat: ChatThread = {
      id: `saved-${id}`,
      type: 'saved',
      title: 'Избранное',
      bio: 'Личное облачное хранилище заметок, файлов и пересланных сообщений',
      avatarColor: '#3390EC',
      ownerId: id,
      participantIds: [id],
      pinned: true,
      muted: false,
      archived: false,
      unreadCount: 0,
      canPost: true,
      lastMessageAt: nowIso,
    };

    this.db.accounts.push(account);
    this.db.chats.push(savedChat);
    this.db.messagesByChat[savedChat.id] = [];

    this.scheduleLocalPersist();
    void this.syncAccountToSupabase(account);
    void this.syncChatToSupabase(savedChat);

    return { account, savedChat };
  }

  public updateAccountProfile(
    userId: string,
    patch: {
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
    },
  ): StoredAccount | null {
    const acc = this.getAccountById(userId);
    if (!acc) return null;
    const cleanUsername = patch.username.trim().replace(/^@+/, '').toLowerCase();
    if (!this.isUsernameAvailable(cleanUsername, userId)) return null;

    acc.firstName = patch.firstName.trim();
    acc.lastName = patch.lastName.trim();
    acc.username = cleanUsername;
    acc.bio = patch.bio.trim();
    acc.phone = patch.phone.trim();
    acc.birthday = patch.birthday.trim();
    acc.city = patch.city.trim();
    acc.statusEmoji = patch.statusEmoji;
    acc.avatarUrl = patch.avatarUrl;
    acc.avatarColor = patch.avatarColor;
    acc.profileAccent = patch.profileAccent;
    acc.lastSeenAt = new Date().toISOString();

    this.scheduleLocalPersist();
    void this.syncAccountToSupabase(acc);
    return acc;
  }

  public updateAccountPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): { ok: boolean; error?: string } {
    const acc = this.getAccountById(userId);
    if (!acc) return { ok: false, error: 'Аккаунт не найден' };
    if (!this.verifyPassword(currentPassword, acc.passwordHash, acc.passwordSalt)) {
      return { ok: false, error: 'Текущий пароль указан неверно' };
    }
    const { hash, salt } = this.hashPassword(newPassword);
    acc.passwordHash = hash;
    acc.passwordSalt = salt;
    this.scheduleLocalPersist();
    void this.syncAccountToSupabase(acc);
    return { ok: true };
  }

  public updateAccountSettings(userId: string, settings: AppSettings): StoredAccount | null {
    const acc = this.getAccountById(userId);
    if (!acc) return null;
    acc.settings = settings;
    this.scheduleLocalPersist();
    void this.syncAccountToSupabase(acc);
    return acc;
  }

  // --- Chats & Messages ---
  public computeUnreadCountForUser(chat: ChatThread, userId: string): number {
    if (chat.type === 'saved') return 0;
    const msgs = this.db.messagesByChat[chat.id] ?? [];
    let count = 0;
    for (const m of msgs) {
      if (m.senderId === userId) continue;
      if (m.status === 'read' || m.readBy?.includes(userId)) continue;
      count += 1;
    }
    return count;
  }

  public decorateChatForUser(
    chat: ChatThread,
    userId: string,
    onlineUserIds: Set<string> = new Set(),
  ): ChatThread {
    const unreadCount = this.computeUnreadCountForUser(chat, userId);

    // For 1-on-1 chats between two real accounts, dynamically display the other user's live profile & presence
    if (
      chat.type === 'private' &&
      chat.participantIds &&
      chat.participantIds.length === 2
    ) {
      const otherId = chat.participantIds.find((id) => id !== userId);
      const other = otherId ? this.getAccountById(otherId) : undefined;
      if (other) {
        const presence = this.getPresenceForAccount(other, onlineUserIds);
        const hideBirthday = other.settings?.privacy?.birthday === 'nobody';
        return {
          ...chat,
          title: buildFullName(other.firstName, other.lastName),
          username: `@${other.username}`,
          bio: other.bio,
          phone: other.phone,
          birthday: hideBirthday ? '' : other.birthday,
          city: other.city,
          statusEmoji: other.statusEmoji,
          avatarUrl: other.avatarUrl,
          avatarColor: other.avatarColor,
          profileAccent: other.profileAccent,
          peerUserId: other.id,
          createdAt: other.createdAt,
          online: presence.online,
          lastSeenAt: presence.lastSeenAt,
          lastSeenText: presence.lastSeenText,
          unreadCount,
        };
      }
    }

    if (chat.type === 'saved') {
      const owner = this.getAccountById(userId);
      if (owner) {
        return {
          ...chat,
          username: `@${owner.username}`,
          phone: owner.phone,
          birthday: owner.birthday,
          city: owner.city,
          statusEmoji: owner.statusEmoji,
          profileAccent: owner.profileAccent,
          createdAt: owner.createdAt,
          unreadCount,
        };
      }
    }

    if (chat.type === 'group' && chat.members && chat.members.length > 0) {
      const members = chat.members.map((mem) => {
        const acc = this.getAccountById(mem.id);
        if (!acc) return mem;
        const presence = this.getPresenceForAccount(acc, onlineUserIds);
        const hideBirthday = acc.settings?.privacy?.birthday === 'nobody';
        return {
          ...mem,
          name: buildFullName(acc.firstName, acc.lastName),
          username: `@${acc.username}`,
          bio: acc.bio,
          phone: acc.phone,
          birthday: hideBirthday ? '' : acc.birthday,
          city: acc.city,
          statusEmoji: acc.statusEmoji,
          avatarUrl: acc.avatarUrl,
          avatarColor: acc.avatarColor,
          profileAccent: acc.profileAccent,
          online: presence.online,
          lastSeenAt: presence.lastSeenAt,
          lastSeenText: presence.lastSeenText,
          createdAt: acc.createdAt,
        };
      });
      return {
        ...chat,
        members,
        memberCount: members.length,
        unreadCount,
      };
    }

    return {
      ...chat,
      unreadCount,
    };
  }

  public getChatsForUser(
    userId: string,
    onlineUserIds: Set<string> = new Set(),
  ): ChatThread[] {
    return this.db.chats
      .filter((c) => {
        if (c.ownerId === userId) return true;
        if (c.participantIds?.includes(userId)) return true;
        return false;
      })
      .map((chat) => this.decorateChatForUser(chat, userId, onlineUserIds));
  }

  public markChatMessagesRead(
    chatId: string,
    readerId: string,
    emitReadReceipt = true,
  ): { changedMessageIds: string[]; readAt: string } {
    const readAt = new Date().toISOString();
    const list = this.db.messagesByChat[chatId] ?? [];
    const changedMessageIds: string[] = [];

    for (const msg of list) {
      if (msg.senderId === readerId) continue;
      const alreadyReadByUser = msg.readBy?.includes(readerId) ?? false;
      if (msg.status !== 'read' || !alreadyReadByUser) {
        const nextReadBy = alreadyReadByUser
          ? msg.readBy ?? [readerId]
          : [...(msg.readBy ?? []), readerId];
        msg.readBy = nextReadBy;
        if (emitReadReceipt && msg.status !== 'read') {
          msg.status = 'read';
          changedMessageIds.push(msg.id);
        }
      }
    }

    if (changedMessageIds.length > 0) {
      this.scheduleLocalPersist();
      if (this.supabase) {
        void this.supabase
          .from('tiligram_messages')
          .update({ status: 'read' })
          .in('id', changedMessageIds);
      }
    }

    return { changedMessageIds, readAt };
  }

  public getMessagesForUser(userId: string): Record<string, ChatMessage[]> {
    const userChats = this.getChatsForUser(userId);
    const out: Record<string, ChatMessage[]> = {};
    for (const chat of userChats) {
      out[chat.id] = this.db.messagesByChat[chat.id] ?? [];
    }
    return out;
  }

  public getChatById(chatId: string): ChatThread | undefined {
    return this.db.chats.find((c) => c.id === chatId);
  }

  public getChatMessages(chatId: string): ChatMessage[] {
    return this.db.messagesByChat[chatId] ?? [];
  }

  public setChatMessages(chatId: string, msgs: ChatMessage[]): void {
    this.db.messagesByChat[chatId] = msgs;
    this.scheduleLocalPersist();
  }

  public upsertChat(chat: ChatThread, initialMessages?: ChatMessage[]): void {
    const idx = this.db.chats.findIndex((c) => c.id === chat.id);
    if (idx === -1) {
      this.db.chats.unshift(chat);
    } else {
      this.db.chats[idx] = chat;
    }
    if (initialMessages) {
      this.db.messagesByChat[chat.id] = initialMessages;
    } else if (!this.db.messagesByChat[chat.id]) {
      this.db.messagesByChat[chat.id] = [];
    }
    this.scheduleLocalPersist();
    void this.syncChatToSupabase(chat);
    if (initialMessages) {
      for (const m of initialMessages) void this.syncMessageToSupabase(m);
    }
  }

  public saveMessage(msg: ChatMessage, chat: ChatThread): void {
    const list = this.db.messagesByChat[msg.chatId] ?? [];
    const idx = list.findIndex((m) => m.id === msg.id);
    if (idx === -1) {
      list.push(msg);
    } else {
      list[idx] = msg;
    }
    this.db.messagesByChat[msg.chatId] = list;
    this.scheduleLocalPersist();
    void this.syncMessageToSupabase(msg);
    void this.syncChatToSupabase(chat);
  }

  public deleteMessage(chatId: string, messageId: string, chat: ChatThread): void {
    const list = this.db.messagesByChat[chatId] ?? [];
    this.db.messagesByChat[chatId] = list.filter((m) => m.id !== messageId);
    this.scheduleLocalPersist();
    void this.syncChatToSupabase(chat);
    if (this.supabase) {
      void this.supabase.from('tiligram_messages').delete().eq('id', messageId);
    }
  }

  public clearChatMessages(chatId: string, chat: ChatThread): void {
    this.db.messagesByChat[chatId] = [];
    this.scheduleLocalPersist();
    void this.syncChatToSupabase(chat);
    if (this.supabase) {
      void this.supabase.from('tiligram_messages').delete().eq('chat_id', chatId);
    }
  }

  public findExistingDirectChat(userA: string, userB: string): ChatThread | undefined {
    return this.db.chats.find(
      (c) =>
        c.type === 'private' &&
        c.participantIds &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(userA) &&
        c.participantIds.includes(userB),
    );
  }

  // --- File Upload & Retention TTL ---
  public saveUploadedFile(params: {
    uploaderId: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }): { meta: StoredFileMeta; sizeLabel: string } {
    const nowMs = Date.now();
    const id = `file-${nowMs}-${crypto.randomBytes(5).toString('hex')}`;
    const ext = path.extname(params.originalName).slice(0, 12);
    const filename = `${id}${ext}`;
    const storagePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(storagePath, params.buffer);

    const retention = computeFileRetention(params.buffer.length, nowMs);
    const meta: StoredFileMeta = {
      id,
      uploaderId: params.uploaderId,
      originalName: params.originalName,
      mimeType: params.mimeType || 'application/octet-stream',
      sizeBytes: params.buffer.length,
      retentionPolicy: retention.policy,
      storagePath,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: retention.expiresAt,
    };

    this.db.files.push(meta);
    this.scheduleLocalPersist();

    if (this.supabase) {
      void this.supabase.from('tiligram_files').upsert({
        id: meta.id,
        uploader_id: meta.uploaderId,
        original_name: meta.originalName,
        mime_type: meta.mimeType,
        size_bytes: meta.sizeBytes,
        retention_policy: meta.retentionPolicy,
        storage_path: meta.storagePath,
        created_at: meta.createdAt,
        expires_at: meta.expiresAt,
      });
    }

    return { meta, sizeLabel: formatFileSize(meta.sizeBytes) };
  }

  public getFileById(id: string): { meta?: StoredFileMeta; expired: boolean } {
    const meta = this.db.files.find((f) => f.id === id);
    if (!meta) return { expired: false };
    if (isFileExpired(meta.expiresAt)) {
      this.purgeFile(meta.id);
      return { expired: true };
    }
    return { meta, expired: false };
  }

  public purgeFile(id: string): void {
    const meta = this.db.files.find((f) => f.id === id);
    if (meta && fs.existsSync(meta.storagePath)) {
      try {
        fs.unlinkSync(meta.storagePath);
      } catch (err) {
        console.warn('Failed to unlink expired file:', err);
      }
    }
    this.db.files = this.db.files.filter((f) => f.id !== id);
    this.scheduleLocalPersist();
    if (this.supabase) {
      void this.supabase.from('tiligram_files').delete().eq('id', id);
    }
  }

  public sweepExpiredFiles(): number {
    const now = Date.now();
    const expired = this.db.files.filter((f) => isFileExpired(f.expiresAt, now));
    for (const file of expired) {
      this.purgeFile(file.id);
    }
    return expired.length;
  }

  // --- Sticker Packs ---
  public getStickerPacks(): StickerPack[] {
    return this.db.stickerPacks;
  }

  public createStickerPack(params: {
    title: string;
    slug: string;
    description: string;
    authorId: string;
    authorName: string;
  }): { pack?: StickerPack; error?: string } {
    const lowerSlug = params.slug.trim().toLowerCase();
    if (this.db.stickerPacks.some((p) => p.slug.toLowerCase() === lowerSlug)) {
      return { error: 'Стикерпак с таким адресом уже существует' };
    }
    const pack: StickerPack = {
      id: `pack-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      slug: lowerSlug,
      title: params.title.trim(),
      description: params.description.trim(),
      authorId: params.authorId,
      authorName: params.authorName,
      stickers: [],
      createdAt: new Date().toISOString(),
    };
    this.db.stickerPacks.push(pack);
    this.scheduleLocalPersist();
    void this.syncPackToSupabase(pack);
    return { pack };
  }

  public addStickerToPack(
    packId: string,
    authorId: string,
    stickerInput: {
      emoji: string;
      label: string;
      imageUrl?: string;
      bgColor?: string;
      accentColor?: string;
    },
  ): { sticker?: CustomSticker; error?: string } {
    const pack = this.db.stickerPacks.find((p) => p.id === packId);
    if (!pack) return { error: 'Стикерпак не найден' };
    if (pack.isSystem || pack.authorId !== authorId) {
      return { error: 'Редактировать можно только собственные стикерпаки' };
    }
    if (pack.stickers.length >= 40) {
      return { error: 'В одном стикерпаке может быть не более 40 стикеров' };
    }
    const sticker: CustomSticker = {
      id: `st-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      packId,
      emoji: stickerInput.emoji.trim() || '✨',
      label: stickerInput.label.trim() || 'Стикер',
      imageUrl: stickerInput.imageUrl,
      bgColor: stickerInput.bgColor || '#1D3557',
      accentColor: stickerInput.accentColor || '#38BDF8',
      createdAt: new Date().toISOString(),
    };
    pack.stickers.push(sticker);
    this.scheduleLocalPersist();
    void this.syncPackToSupabase(pack);
    return { sticker };
  }

  public removeStickerFromPack(
    packId: string,
    stickerId: string,
    authorId: string,
  ): { ok: boolean; error?: string } {
    const pack = this.db.stickerPacks.find((p) => p.id === packId);
    if (!pack) return { ok: false, error: 'Стикерпак не найден' };
    if (pack.isSystem || pack.authorId !== authorId) {
      return { ok: false, error: 'Нет прав для удаления стикера' };
    }
    pack.stickers = pack.stickers.filter((s) => s.id !== stickerId);
    this.scheduleLocalPersist();
    void this.syncPackToSupabase(pack);
    return { ok: true };
  }

  public deleteStickerPack(packId: string, authorId: string): { ok: boolean; error?: string } {
    const pack = this.db.stickerPacks.find((p) => p.id === packId);
    if (!pack) return { ok: false, error: 'Стикерпак не найден' };
    if (pack.isSystem || pack.authorId !== authorId) {
      return { ok: false, error: 'Удалить можно только свой стикерпак' };
    }
    this.db.stickerPacks = this.db.stickerPacks.filter((p) => p.id !== packId);
    this.scheduleLocalPersist();
    if (this.supabase) {
      void this.supabase.from('tiligram_sticker_packs').delete().eq('id', packId);
    }
    return { ok: true };
  }
}
