import type { AppSettings, StickerPack } from '../types/telegram.ts';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#3390EC',
  wallpaper: 'pattern',
  fontSize: 'normal',
  bubbleRadius: 'standard',
  sendByEnter: true,
  largeEmoji: true,
  notifications: {
    privateChats: true,
    groups: true,
    channels: true,
    soundEnabled: true,
    showPreview: true,
  },
  privacy: {
    lastSeen: 'everybody',
    profilePhoto: 'everybody',
    birthday: 'contacts',
    groupInvites: 'everybody',
    readReceipts: true,
  },
  storage: {
    autoDownloadPhotos: true,
    autoDownloadFiles: true,
  },
};

export const ACCENT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Классический синий', hex: '#3390EC' },
  { name: 'Изумрудный', hex: '#2EA87E' },
  { name: 'Фиолетовый', hex: '#8B6EF3' },
  { name: 'Коралловый', hex: '#E36B6B' },
  { name: 'Янтарный', hex: '#E59A34' },
  { name: 'Бирюзовый', hex: '#23A8C6' },
];

export const AVATAR_COLORS = [
  '#3390EC',
  '#E17076',
  '#7BC862',
  '#65AADD',
  '#A695E7',
  '#FAA774',
  '#EE7AAE',
  '#2EA87E',
];

export const STATUS_EMOJIS = [
  '',
  '🔥',
  '💻',
  '🚀',
  '🎧',
  '☕',
  '🌙',
  '⚡',
  '✨',
  '🎮',
  '📚',
  '✈️',
];

export const QUICK_REACTIONS = ['❤️', '👍', '🔥', '😂', '🎉', '😮', '🙏', '⚡'];

export const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Эмоции',
    emojis: ['😀', '😄', '😊', '😉', '😍', '🤩', '😂', '😅', '🤔', '😎', '🥳', '😌', '😴', '🤯', '😇', '🤝'],
  },
  {
    label: 'Жесты и символы',
    emojis: ['👍', '👏', '🙌', '🔥', '✨', '🚀', '💡', '⚡', '❤️', '💙', '💚', '🎉', '✅', '📌', '💬', '🎧'],
  },
  {
    label: 'Работа и отдых',
    emojis: ['💻', '📱', '📐', '🎨', '📸', '📝', '☕', '🍵', '🍕', '🌿', '🌙', '☀️', '🛫', '🏔️', '🎵', '🏆'],
  },
];

export function createStarterStickerPacks(): StickerPack[] {
  const createdAt = '2026-01-01T00:00:00.000Z';
  return [
    {
      id: 'pack-tiligram-base',
      slug: 'tiligram_starter',
      title: 'Тилиграм База',
      description: 'Базовый набор стикеров Тилиграм. Создавайте свои паки в студии!',
      authorId: 'system',
      authorName: 'Тилиграм',
      isSystem: true,
      createdAt,
      stickers: [
        {
          id: 'st-base-1',
          packId: 'pack-tiligram-base',
          emoji: '🚀',
          label: 'Погнали!',
          bgColor: '#1B365D',
          accentColor: '#38BDF8',
          createdAt,
        },
        {
          id: 'st-base-2',
          packId: 'pack-tiligram-base',
          emoji: '🔥',
          label: 'Огонь!',
          bgColor: '#3B2014',
          accentColor: '#FB923C',
          createdAt,
        },
        {
          id: 'st-base-3',
          packId: 'pack-tiligram-base',
          emoji: '☕',
          label: 'На кофе',
          bgColor: '#2E2218',
          accentColor: '#F59E0B',
          createdAt,
        },
        {
          id: 'st-base-4',
          packId: 'pack-tiligram-base',
          emoji: '✨',
          label: 'Супер!',
          bgColor: '#291D48',
          accentColor: '#A78BFA',
          createdAt,
        },
        {
          id: 'st-base-5',
          packId: 'pack-tiligram-base',
          emoji: '👍',
          label: 'Принято',
          bgColor: '#123626',
          accentColor: '#34D399',
          createdAt,
        },
        {
          id: 'st-base-6',
          packId: 'pack-tiligram-base',
          emoji: '🌙',
          label: 'Спокойной ночи',
          bgColor: '#15223B',
          accentColor: '#93C5FD',
          createdAt,
        },
      ],
    },
  ];
}
