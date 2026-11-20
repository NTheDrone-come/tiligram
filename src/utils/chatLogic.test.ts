import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIdempotentMessageCreate,
  computeChatProfileStats,
  extractSharedItems,
  filterChats,
  findCommonGroups,
  formatBirthdayWithAge,
  formatMemberSince,
  getUnreadCountByFolder,
  searchMessagesGlobally,
  searchMessagesInChat,
  sortChats,
  toggleReactionOnList,
  validateCreateChatInput,
  validateProfileInput,
  validateRegistrationInput,
  validateStickerPackInput,
  validateUsername,
} from './chatLogic.ts';
import type { ChatMessage, ChatThread } from '../types/telegram.ts';

const baseChats: ChatThread[] = [
  {
    id: 'c1',
    type: 'private',
    title: 'Анна Ковалёва',
    username: '@anna_k',
    avatarColor: '#E17076',
    pinned: false,
    muted: false,
    archived: false,
    unreadCount: 2,
    lastMessageAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'c2',
    type: 'group',
    title: 'Команда',
    username: '@team_core',
    avatarColor: '#3390EC',
    pinned: true,
    muted: false,
    archived: false,
    unreadCount: 5,
    lastMessageAt: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'c3',
    type: 'channel',
    title: 'Новости',
    username: '@news_ru',
    avatarColor: '#7BC862',
    pinned: false,
    muted: false,
    archived: true,
    unreadCount: 9,
    lastMessageAt: '2026-06-01T11:00:00.000Z',
  },
];

test('validateUsername enforces English letters, digits, underscore and length 4..32', () => {
  assert.equal(validateUsername('ivan_dev').valid, true);
  assert.equal(validateUsername('@Alex_2026').normalized, 'alex_2026');
  assert.equal(validateUsername('abc').valid, false);
  assert.equal(validateUsername('123user').valid, false);
  assert.equal(validateUsername('иван_тест').valid, false);
});

test('validateRegistrationInput allows optional lastName and checks required fields', () => {
  const okWithoutSurname = validateRegistrationInput({
    firstName: 'Иван',
    lastName: '',
    username: 'ivan_dev',
    password: 'password123',
    confirmPassword: 'password123',
  });
  assert.equal(okWithoutSurname.valid, true);
  assert.equal(okWithoutSurname.lastName, '');

  const badMismatch = validateRegistrationInput({
    firstName: 'Иван',
    username: 'ivan_dev',
    password: 'password123',
    confirmPassword: 'otherpassword',
  });
  assert.equal(badMismatch.valid, false);
});

test('validateStickerPackInput checks title and English slug', () => {
  assert.equal(
    validateStickerPackInput({ title: 'Мои коты', slug: 'my_cats' }).valid,
    true,
  );
  assert.equal(
    validateStickerPackInput({ title: 'А', slug: 'my_cats' }).valid,
    false,
  );
  assert.equal(
    validateStickerPackInput({ title: 'Коты', slug: 'коты' }).valid,
    false,
  );
});

test('sortChats places pinned chats first and sorts remaining by latest timestamp', () => {
  const sorted = sortChats(baseChats);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['c2', 'c3', 'c1'],
  );
});

test('filterChats filters by folder, search query, and archive flag', () => {
  const activeAll = filterChats(baseChats, 'all', '', false);
  assert.deepEqual(
    activeAll.map((c) => c.id),
    ['c2', 'c1'],
  );

  const archived = filterChats(baseChats, 'all', '', true);
  assert.deepEqual(
    archived.map((c) => c.id),
    ['c3'],
  );

  const searched = filterChats(baseChats, 'groups', 'анна', false);
  assert.deepEqual(
    searched.map((c) => c.id),
    ['c1'],
  );
});

test('getUnreadCountByFolder excludes archived chats and aggregates accurately', () => {
  const counts = getUnreadCountByFolder(baseChats);
  assert.equal(counts.all, 7);
  assert.equal(counts.private, 2);
  assert.equal(counts.groups, 5);
  assert.equal(counts.channels, 0);
});

test('applyIdempotentMessageCreate avoids duplicates', () => {
  const msg: ChatMessage = {
    id: 'm1',
    chatId: 'c1',
    senderId: 'u1',
    senderName: 'Иван',
    kind: 'text',
    text: 'Привет',
    createdAt: '2026-06-01T10:00:00.000Z',
    status: 'sent',
    reactions: [],
  };
  const first = applyIdempotentMessageCreate([], msg);
  const second = applyIdempotentMessageCreate(first, { ...msg, status: 'read' });
  assert.equal(second.length, 1);
  assert.equal(second[0].status, 'read');
});

test('toggleReactionOnList toggles reactions cleanly', () => {
  const added = toggleReactionOnList([], '🔥', 'u1');
  assert.equal(added.length, 1);
  assert.deepEqual(added[0].userIds, ['u1']);

  const added2 = toggleReactionOnList(added, '🔥', 'u2');
  assert.deepEqual(added2[0].userIds, ['u1', 'u2']);

  const removed = toggleReactionOnList(added2, '🔥', 'u1');
  assert.deepEqual(removed[0].userIds, ['u2']);

  const empty = toggleReactionOnList(removed, '🔥', 'u2');
  assert.equal(empty.length, 0);
});

test('validateCreateChatInput and validateProfileInput validate fields properly', () => {
  assert.equal(validateCreateChatInput({ title: 'А', type: 'group' }).valid, false);
  assert.equal(
    validateCreateChatInput({ title: 'Проект', type: 'group', username: 'my_proj' })
      .normalizedUsername,
    '@my_proj',
  );

  assert.equal(
    validateProfileInput({ firstName: 'Иван', lastName: 'Петров', username: 'ivan_dev', bio: 'Ок' })
      .valid,
    true,
  );
  assert.equal(
    validateProfileInput({ firstName: 'И', username: 'ivan_dev', bio: '' }).valid,
    false,
  );
});

test('search and shared items extraction work accurately', () => {
  const msgs: ChatMessage[] = [
    {
      id: 'm1',
      chatId: 'c1',
      senderId: 'u1',
      senderName: 'Анна',
      kind: 'text',
      text: 'Смотри ссылку https://tiligram.app/docs',
      createdAt: '2026-06-01T10:00:00.000Z',
      status: 'read',
      reactions: [],
    },
    {
      id: 'm2',
      chatId: 'c1',
      senderId: 'u1',
      senderName: 'Анна',
      kind: 'file',
      text: '',
      createdAt: '2026-06-01T10:05:00.000Z',
      status: 'read',
      reactions: [],
      attachment: { url: '/api/files/f1', name: 'spec.pdf', sizeLabel: '2.1 МБ' },
    },
  ];

  assert.equal(searchMessagesInChat(msgs, 'spec').length, 1);
  assert.equal(searchMessagesGlobally(baseChats, { c1: msgs }, 'tiligram').length, 1);
  const shared = extractSharedItems(msgs);
  assert.equal(shared.files.length, 1);
  assert.equal(shared.links.length, 1);
});

test('formatBirthdayWithAge formats ISO and RU dates with proper Russian age pluralization', () => {
  const refNow = new Date(2026, 10, 20); // 20 Nov 2026
  const iso = formatBirthdayWithAge('1999-05-15', refNow);
  assert.ok(iso && iso.includes('27 лет'), `Unexpected: ${iso}`);

  const ru = formatBirthdayWithAge('01.02.2005', refNow);
  assert.ok(ru && ru.includes('21 год'), `Unexpected: ${ru}`);

  const age24 = formatBirthdayWithAge('2002-01-10', refNow);
  assert.ok(age24 && age24.includes('24 года'), `Unexpected: ${age24}`);

  assert.equal(formatBirthdayWithAge(''), null);
  assert.equal(formatBirthdayWithAge('Весна'), 'Весна');
});

test('formatMemberSince formats valid ISO dates and returns null on invalid input', () => {
  const formatted = formatMemberSince('2026-11-20T10:00:00.000Z');
  assert.ok(formatted && formatted.includes('2026'));
  assert.equal(formatMemberSince('not-a-date'), null);
  assert.equal(formatMemberSince(undefined), null);
});

test('computeChatProfileStats aggregates own/peer counts, media, files, voice, stickers, links', () => {
  const msgs: ChatMessage[] = [
    {
      id: 'm1',
      chatId: 'c1',
      senderId: 'me',
      senderName: 'Я',
      kind: 'text',
      text: 'Привет https://example.com',
      createdAt: '2026-11-01T10:00:00.000Z',
      status: 'read',
      reactions: [],
    },
    {
      id: 'm2',
      chatId: 'c1',
      senderId: 'peer',
      senderName: 'Собеседник',
      kind: 'voice',
      text: '',
      createdAt: '2026-11-02T10:00:00.000Z',
      status: 'read',
      reactions: [],
      attachment: { url: '', name: 'Голосовое', durationSec: 12 },
    },
    {
      id: 'm3',
      chatId: 'c1',
      senderId: 'me',
      senderName: 'Я',
      kind: 'sticker',
      text: '',
      createdAt: '2026-11-03T10:00:00.000Z',
      status: 'read',
      reactions: [],
    },
  ];
  const stats = computeChatProfileStats(msgs, 'me');
  assert.equal(stats.totalMessages, 3);
  assert.equal(stats.ownMessages, 2);
  assert.equal(stats.peerMessages, 1);
  assert.equal(stats.voiceCount, 1);
  assert.equal(stats.stickersCount, 1);
  assert.equal(stats.linksCount, 1);
  assert.equal(stats.firstMessageAt, '2026-11-01T10:00:00.000Z');
  assert.equal(stats.lastMessageAt, '2026-11-03T10:00:00.000Z');
});

test('findCommonGroups returns only group chats containing the peer user', () => {
  const chatsWithMembers: ChatThread[] = [
    ...baseChats,
    {
      id: 'g-shared',
      type: 'group',
      title: 'Общая группа',
      avatarColor: '#3390EC',
      pinned: false,
      muted: false,
      archived: false,
      unreadCount: 0,
      participantIds: ['me', 'u-peer'],
      lastMessageAt: '2026-06-01T12:00:00.000Z',
    },
  ];
  const found = findCommonGroups(chatsWithMembers, 'u-peer');
  assert.deepEqual(
    found.map((g) => g.id),
    ['g-shared'],
  );
  assert.equal(findCommonGroups(chatsWithMembers, undefined).length, 0);
});
