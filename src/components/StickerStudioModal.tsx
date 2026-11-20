import { useRef, useState } from 'react';
import {
  ImagePlus,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { validateStickerPackInput } from '../utils/chatLogic';
import type { CustomSticker, StickerPack } from '../types/telegram';

interface StickerStudioModalProps {
  open: boolean;
  currentUserId: string;
  stickerPacks: StickerPack[];
  hasActiveChat: boolean;
  onClose: () => void;
  onCreatePack: (params: {
    title: string;
    slug: string;
    description: string;
  }) => Promise<{ pack?: StickerPack; error?: string }>;
  onAddSticker: (
    packId: string,
    sticker: {
      emoji: string;
      label: string;
      imageUrl?: string;
      bgColor?: string;
      accentColor?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveSticker: (packId: string, stickerId: string) => Promise<void>;
  onDeletePack: (packId: string) => Promise<void>;
  onSendSticker?: (sticker: CustomSticker) => void;
}

const STICKER_PALETTES = [
  { bg: '#1B365D', accent: '#38BDF8' },
  { bg: '#291D48', accent: '#A78BFA' },
  { bg: '#123626', accent: '#34D399' },
  { bg: '#3B2818', accent: '#F59E0B' },
  { bg: '#43182E', accent: '#F472B6' },
  { bg: '#10353A', accent: '#2DD4BF' },
  { bg: '#3B1822', accent: '#FB7185' },
];

const QUICK_EMOJIS = ['🔥', '❤️', '😎', '🐱', '🚀', '☕', '✨', '🎉', '👀', '💻', '🌙', '⚡'];

async function resizeImageToStickerDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Неподдерживаемый формат изображения'));
      img.onload = () => {
        const size = 280;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas недоступен'));
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function StickerStudioModal({
  open,
  currentUserId,
  stickerPacks,
  hasActiveChat,
  onClose,
  onCreatePack,
  onAddSticker,
  onRemoveSticker,
  onDeletePack,
  onSendSticker,
}: StickerStudioModalProps) {
  const [selectedPackId, setSelectedPackId] = useState<string>(
    stickerPacks[0]?.id ?? '',
  );
  const [creatingPack, setCreatingPack] = useState(false);
  const [packTitle, setPackTitle] = useState('');
  const [packSlug, setPackSlug] = useState('');
  const [packDesc, setPackDesc] = useState('');
  const [packError, setPackError] = useState<string | null>(null);

  // Add sticker form
  const [stickerMode, setStickerMode] = useState<'designer' | 'upload'>('designer');
  const [stEmoji, setStEmoji] = useState('🔥');
  const [stLabel, setStLabel] = useState('');
  const [stPaletteIdx, setStPaletteIdx] = useState(0);
  const [stImageUrl, setStImageUrl] = useState<string | undefined>(undefined);
  const [stError, setStError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const activePack =
    stickerPacks.find((p) => p.id === selectedPackId) ?? stickerPacks[0];
  const isOwner = activePack && !activePack.isSystem && activePack.authorId === currentUserId;
  const palette = STICKER_PALETTES[stPaletteIdx] ?? STICKER_PALETTES[0];

  const handleCreatePackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPackError(null);
    const check = validateStickerPackInput({ title: packTitle, slug: packSlug });
    if (!check.valid) {
      setPackError(check.error ?? 'Проверьте название и адрес пака');
      return;
    }
    const res = await onCreatePack({
      title: check.normalizedTitle,
      slug: check.normalizedSlug,
      description: packDesc.trim(),
    });
    if (res.error || !res.pack) {
      setPackError(res.error ?? 'Не удалось создать стикерпак');
      return;
    }
    setSelectedPackId(res.pack.id);
    setCreatingPack(false);
    setPackTitle('');
    setPackSlug('');
    setPackDesc('');
  };

  const handleUploadStickerImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStError(null);
    try {
      const dataUrl = await resizeImageToStickerDataUrl(file);
      setStImageUrl(dataUrl);
    } catch (err: any) {
      setStError(err?.message || 'Ошибка обработки картинки');
    }
    e.target.value = '';
  };

  const handleAddStickerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePack) return;
    setStError(null);

    if (stickerMode === 'upload' && !stImageUrl) {
      setStError('Выберите изображение для стикера');
      return;
    }
    if (stickerMode === 'designer' && !stLabel.trim()) {
      setStError('Введите короткую подпись для стикера');
      return;
    }

    const res = await onAddSticker(activePack.id, {
      emoji: stEmoji || '✨',
      label: stLabel.trim() || 'Стикер',
      imageUrl: stickerMode === 'upload' ? stImageUrl : undefined,
      bgColor: palette.bg,
      accentColor: palette.accent,
    });
    if (!res.ok) {
      setStError(res.error ?? 'Не удалось добавить стикер');
      return;
    }
    setStLabel('');
    setStImageUrl(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Закрыть стикерпаки"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] cursor-pointer"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-studio-title"
        className="relative z-10 w-full max-w-4xl h-[84vh] max-h-[720px] rounded-2xl bg-white dark:bg-[#17212B] shadow-2xl border border-slate-200/80 dark:border-[#243242] flex flex-col overflow-hidden"
      >
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-[#0E1621] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[var(--tg-accent)]" />
            <h2
              id="sticker-studio-title"
              className="font-display font-bold text-base text-slate-900 dark:text-slate-100"
            >
              Стикерпаки Тилиграм
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть конструктор стикерпаков"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Packs Sidebar */}
          <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200/80 dark:border-[#0E1621] p-3 flex flex-col gap-2 bg-slate-50/70 dark:bg-[#131C26]">
            <button
              type="button"
              onClick={() => {
                setCreatingPack(true);
                setPackError(null);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--tg-accent)] hover:opacity-95 text-white text-xs font-semibold transition-opacity cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Создать стикерпак</span>
            </button>

            <div className="flex-1 overflow-y-auto tg-scroll space-y-1">
              {stickerPacks.map((pack) => {
                const selected = !creatingPack && activePack?.id === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => {
                      setCreatingPack(false);
                      setSelectedPackId(pack.id);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[var(--tg-accent)]/15 text-[var(--tg-accent)] dark:text-[#7CC0FA]'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#1E2A38]'
                    }`}
                  >
                    <div className="font-semibold text-sm truncate">{pack.title}</div>
                    <div className="text-[11.5px] opacity-75 truncate mt-0.5 tabular-nums">
                      @{pack.slug} · {pack.stickers.length} шт.
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 min-w-0 overflow-y-auto tg-scroll p-5">
            {creatingPack ? (
              <form onSubmit={handleCreatePackSubmit} className="max-w-md space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                    Новый стикерпак
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    После создания вы сможете добавлять свои картинки или собирать графические стикеры прямо здесь.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="pack-title-input"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Название стикерпака *
                  </label>
                  <input
                    id="pack-title-input"
                    type="text"
                    value={packTitle}
                    onChange={(e) => {
                      setPackTitle(e.target.value);
                      if (packError) setPackError(null);
                    }}
                    placeholder="Например, Мои коты"
                    className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pack-slug-input"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Короткий адрес на английском *
                  </label>
                  <input
                    id="pack-slug-input"
                    type="text"
                    value={packSlug}
                    onChange={(e) => {
                      setPackSlug(e.target.value);
                      if (packError) setPackError(null);
                    }}
                    placeholder="my_cats_pack"
                    className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pack-desc-input"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Описание (необязательно)
                  </label>
                  <input
                    id="pack-desc-input"
                    type="text"
                    value={packDesc}
                    onChange={(e) => setPackDesc(e.target.value)}
                    placeholder="Стикеры для друзей и рабочих чатов"
                    className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-[#0E1621] text-sm text-slate-900 dark:text-slate-100 border border-transparent focus:border-[var(--tg-accent)] focus:outline-none"
                  />
                </div>

                {packError && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-rose-500 bg-rose-500/10 px-3 py-2 rounded-xl"
                  >
                    {packError}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[var(--tg-accent)] text-white text-sm font-semibold hover:opacity-95 cursor-pointer"
                  >
                    Создать пак
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingPack(false)}
                    className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : activePack ? (
              <div className="space-y-6">
                {/* Pack Header */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-[#243242]">
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                      {activePack.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      @{activePack.slug} · Автор: {activePack.authorName}
                      {activePack.description ? ` · ${activePack.description}` : ''}
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeletePack(activePack.id);
                        setSelectedPackId(stickerPacks[0]?.id ?? '');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить пак</span>
                    </button>
                  )}
                </div>

                {/* Add Sticker Section (for own packs) */}
                {isOwner && (
                  <form
                    onSubmit={handleAddStickerSubmit}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1621] border border-slate-200/80 dark:border-[#243242] space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Добавить стикер в «{activePack.title}»
                      </span>
                      <div className="flex gap-1 p-0.5 rounded-xl bg-slate-200/70 dark:bg-[#17212B]">
                        <button
                          type="button"
                          onClick={() => setStickerMode('designer')}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            stickerMode === 'designer'
                              ? 'bg-white dark:bg-[#243447] text-[var(--tg-accent)]'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Конструктор
                        </button>
                        <button
                          type="button"
                          onClick={() => setStickerMode('upload')}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            stickerMode === 'upload'
                              ? 'bg-white dark:bg-[#243447] text-[var(--tg-accent)]'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Своя картинка
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      {/* Live Preview */}
                      <div
                        className="w-28 h-28 rounded-2xl shrink-0 flex flex-col items-center justify-center p-2 border border-white/10 shadow-sm overflow-hidden"
                        style={{
                          backgroundColor:
                            stickerMode === 'upload' && stImageUrl
                              ? 'transparent'
                              : palette.bg,
                        }}
                      >
                        {stickerMode === 'upload' && stImageUrl ? (
                          <img
                            src={stImageUrl}
                            alt="Превью стикера"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <>
                            <span className="text-4xl leading-none">{stEmoji}</span>
                            <span
                              className="mt-2 text-xs font-display font-bold text-center truncate w-full"
                              style={{ color: palette.accent }}
                            >
                              {stLabel.trim() || 'Подпись'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex-1 w-full space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label
                              htmlFor="sticker-label-input"
                              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
                            >
                              Текст / название стикера
                            </label>
                            <input
                              id="sticker-label-input"
                              type="text"
                              value={stLabel}
                              onChange={(e) => {
                                setStLabel(e.target.value);
                                if (stError) setStError(null);
                              }}
                              placeholder="Например, Погнали!"
                              className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#17212B] text-sm text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#243242] focus:border-[var(--tg-accent)] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="sticker-emoji-input"
                              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
                            >
                              Эмодзи-тег
                            </label>
                            <input
                              id="sticker-emoji-input"
                              type="text"
                              value={stEmoji}
                              onChange={(e) => setStEmoji(e.target.value)}
                              className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#17212B] text-sm text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[#243242] focus:border-[var(--tg-accent)] focus:outline-none"
                            />
                          </div>
                        </div>

                        {stickerMode === 'designer' ? (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {QUICK_EMOJIS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => setStEmoji(em)}
                                  className={`w-7 h-7 rounded-lg text-base flex items-center justify-center cursor-pointer ${
                                    stEmoji === em
                                      ? 'bg-[var(--tg-accent)]/25'
                                      : 'hover:bg-slate-200/70 dark:hover:bg-[#1E2A38]'
                                  }`}
                                >
                                  {em}
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              {STICKER_PALETTES.map((p, i) => (
                                <button
                                  key={p.bg}
                                  type="button"
                                  onClick={() => setStPaletteIdx(i)}
                                  aria-label={`Цвет фона стикера ${i + 1}`}
                                  className={`w-6 h-6 rounded-full cursor-pointer border-2 ${
                                    stPaletteIdx === i
                                      ? 'border-white scale-110'
                                      : 'border-transparent'
                                  }`}
                                  style={{ backgroundColor: p.accent }}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div>
                            <input
                              ref={fileRef}
                              type="file"
                              accept="image/png,image/webp,image/jpeg"
                              onChange={handleUploadStickerImage}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#243242] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[var(--tg-accent)] cursor-pointer"
                            >
                              <ImagePlus className="w-4 h-4 text-[var(--tg-accent)]" />
                              <span>{stImageUrl ? 'Заменить PNG / WebP / JPG' : 'Выбрать картинку'}</span>
                            </button>
                          </div>
                        )}

                        {stError && (
                          <p role="alert" className="text-xs text-rose-500 font-medium">
                            {stError}
                          </p>
                        )}

                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[var(--tg-accent)] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
                        >
                          Добавить стикер
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Stickers Grid */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
                    Стикеры в наборе ({activePack.stickers.length})
                  </div>

                  {activePack.stickers.length === 0 ? (
                    <div className="py-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#243242] text-xs text-slate-500 dark:text-slate-400">
                      В этом паке пока нет стикеров — добавьте первый с помощью формы выше.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {activePack.stickers.map((st) => (
                        <div
                          key={st.id}
                          className="group relative rounded-2xl p-3 flex flex-col items-center justify-center border border-slate-200/80 dark:border-[#243242] bg-slate-50 dark:bg-[#0E1621]"
                        >
                          {st.imageUrl ? (
                            <img
                              src={st.imageUrl}
                              alt={st.label}
                              className="w-24 h-24 object-contain"
                            />
                          ) : (
                            <div
                              className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center p-2"
                              style={{ backgroundColor: st.bgColor || '#1B365D' }}
                            >
                              <span className="text-3xl leading-none">{st.emoji}</span>
                              <span
                                className="mt-1.5 text-[11px] font-display font-bold text-center truncate w-full"
                                style={{ color: st.accentColor || '#38BDF8' }}
                              >
                                {st.label}
                              </span>
                            </div>
                          )}

                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 truncate max-w-full">
                            {st.emoji} {st.label}
                          </div>

                          <div className="mt-2 flex items-center gap-1.5">
                            {hasActiveChat && onSendSticker && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSendSticker(st);
                                  onClose();
                                }}
                                aria-label={`Отправить стикер ${st.label}`}
                                className="px-2.5 py-1 rounded-lg bg-[var(--tg-accent)] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>Отправить</span>
                              </button>
                            )}
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => onRemoveSticker(activePack.id, st.id)}
                                aria-label={`Удалить стикер ${st.label}`}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
