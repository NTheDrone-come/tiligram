import { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'drawer' | 'card' | 'compact';
  onAfterClick?: () => void;
}

export function PWAInstallButton({
  variant = 'drawer',
  onAfterClick,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      onAfterClick?.();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      {variant === 'drawer' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="w-full flex items-center gap-3.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-[14.5px] font-medium text-[#3390EC] dark:text-[#6AB3F3] hover:bg-[#3390EC]/10 transition-colors cursor-pointer"
        >
          <Smartphone className="w-5 h-5 shrink-0" />
          <span className="truncate">
            {isInstallable ? 'Установить на телефон' : 'На экран телефона (PWA)'}
          </span>
        </button>
      ) : variant === 'compact' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          aria-label="Установить Тилиграм как приложение"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#3390EC] hover:bg-[#2B82D8] text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Установить</span>
        </button>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#131C26] border border-slate-200/80 dark:border-[#243242] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#3390EC] shrink-0" />
              <span>Тилиграм на телефоне (Android / iOS)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Установите мессенджер на главный экран телефона — откроется без адресной строки, как нативное приложение.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClick()}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--tg-accent)' }}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{isInstallable ? 'Установить' : 'Как установить'}</span>
          </button>
        </div>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Закрыть инструкцию установки"
            onClick={() => setShowGuide(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] cursor-pointer"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-guide-title"
            className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200/80 dark:border-[#243242] shadow-2xl p-6 pb-safe"
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="pwa-install-guide-title"
                  className="font-display font-bold text-base text-slate-900 dark:text-slate-100"
                >
                  Установка на телефон
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Работает на iPhone (Safari) и Android (Chrome)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Закрыть"
                className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232E3C] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13.5px] text-slate-700 dark:text-slate-200 leading-relaxed">
              {isIOS ? (
                <ol className="space-y-2.5 list-decimal list-inside">
                  <li>
                    Нажмите кнопку{' '}
                    <span className="inline-flex items-center gap-1 font-semibold text-[#3390EC] dark:text-[#6AB3F3]">
                      <Share className="w-3.5 h-3.5" />
                      Поделиться
                    </span>{' '}
                    внизу экрана Safari.
                  </li>
                  <li>
                    Прокрутите меню вниз и выберите{' '}
                    <strong>«На экран „Домой“»</strong>.
                  </li>
                  <li>
                    Нажмите <strong>«Добавить»</strong> — иконка Тилиграм появится на рабочем столе.
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2.5 list-decimal list-inside">
                  <li>
                    Откройте меню браузера (<strong>⋮</strong> в правом верхнем углу Chrome или <strong>Поделиться</strong> в Safari).
                  </li>
                  <li>
                    Нажмите <strong>«Установить приложение»</strong> или{' '}
                    <strong>«Добавить на главный экран»</strong>.
                  </li>
                  <li>
                    Запускайте Тилиграм с иконки на экране — интерфейс откроется на весь экран без панели браузера.
                  </li>
                </ol>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl font-semibold text-sm text-white cursor-pointer"
              style={{ backgroundColor: 'var(--tg-accent)' }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[75] px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold shadow-xl flex items-center gap-2 whitespace-nowrap"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Нет сети — сообщения отправятся при подключении</span>
    </div>
  );
}
