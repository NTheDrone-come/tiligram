import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIdempotentMessageCreate,
  extractSharedItems,
  filterChats,
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
