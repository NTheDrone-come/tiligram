import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Send,
  XCircle,
} from 'lucide-react';
import {
  validateRegistrationInput,
  validateUsername,
} from '../utils/chatLogic';
import type { AppSettings, UserProfile } from '../types/telegram';

interface AuthScreenProps {
  onAuthenticated: (payload: {
    token: string;
    user: UserProfile;
    settings: AppSettings;
  }) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameHint, setUsernameHint] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live debounced English username availability check on registration
  useEffect(() => {
    if (mode !== 'register') {
      setUsernameStatus('idle');
      setUsernameHint('');
      return;
    }

    const raw = username.trim();
    if (!raw) {
      setUsernameStatus('idle');
      setUsernameHint('');
      return;
    }

    const localCheck = validateUsername(raw);
    if (!localCheck.valid) {
      setUsernameStatus('invalid');
      setUsernameHint(localCheck.error ?? 'Некорректный формат');
      return;
    }

    let cancelled = false;
    setUsernameStatus('checking');
    setUsernameHint('Проверяем доступность...');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(localCheck.normalized)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.valid && data.available) {
          setUsernameStatus('available');
          setUsernameHint(`@${data.normalized} свободен`);
        } else {
          setUsernameStatus('taken');
          setUsernameHint(data.error || 'Этот юзернейм уже занят');
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus('idle');
          setUsernameHint('');
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      const check = validateRegistrationInput({
        firstName,
        lastName,
        username,
        password,
        confirmPassword,
      });
      if (!check.valid) {
        setError(check.error ?? 'Проверьте заполнение полей');
        return;
      }
      if (usernameStatus === 'taken') {
        setError('Этот юзернейм уже занят, выберите другой');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: check.firstName,
            lastName: check.lastName,
            username: check.username,
            password,
            confirmPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Не удалось создать аккаунт');
          return;
        }
        onAuthenticated({
          token: data.token,
          user: data.user,
          settings: data.settings,
        });
      } catch {
        setError('Не удалось подключиться к серверу Тилиграм');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Login flow
    if (!username.trim() || !password) {
      setError('Введите юзернейм и пароль');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Неверный юзернейм или пароль');
        return;
      }
      onAuthenticated({
        token: data.token,
        user: data.user,
        settings: data.settings,
      });
    } catch {
      setError('Не удалось подключиться к серверу Тилиграм');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[#0E1621] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[430px] rounded-3xl bg-[#17212B] border border-[#243242] shadow-2xl p-6 sm:p-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#3390EC] flex items-center justify-center shadow-lg shadow-[#3390EC]/25">
            <Send className="w-8 h-8 text-white -translate-x-0.5 translate-y-0.5" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white mt-4">
            Тилиграм
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-xs">
            {mode === 'register'
              ? 'Создайте аккаунт, чтобы начать общение, делиться файлами и создавать стикерпаки'
              : 'Войдите по своему английскому юзернейму и паролю'}
          </p>
        </div>

        {/* Mode Switch */}
        <div
          role="tablist"
          aria-label="Регистрация или вход"
          className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#0E1621] mt-6"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-[#243447] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Регистрация
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-[#243447] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Вход
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="auth-first-name"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Имя *
                </label>
                <input
                  id="auth-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Алексей"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0E1621] text-sm text-white placeholder:text-slate-500 border border-[#243242] focus:border-[#3390EC] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-last-name"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Фамилия (необяз.)
                </label>
                <input
                  id="auth-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Морозов"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0E1621] text-sm text-white placeholder:text-slate-500 border border-[#243242] focus:border-[#3390EC] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Username */}
          <div>
            <label
              htmlFor="auth-username"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Юзернейм (на английском) *
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm select-none"
              >
                @
              </span>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/^@+/, ''));
                  if (error) setError(null);
                }}
                placeholder="alex_dev"
                className="w-full h-11 pl-8 pr-10 rounded-xl bg-[#0E1621] text-sm text-white placeholder:text-slate-500 border border-[#243242] focus:border-[#3390EC] focus:outline-none"
              />
              {mode === 'register' && usernameStatus !== 'idle' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              )}
            </div>
            {mode === 'register' && usernameHint && (
              <p
                className={`text-xs mt-1.5 ${
                  usernameStatus === 'available'
                    ? 'text-emerald-400'
                    : usernameStatus === 'checking'
                      ? 'text-slate-400'
                      : 'text-rose-400'
                }`}
              >
                {usernameHint}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Пароль *
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Минимум 6 символов"
                className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#0E1621] text-sm text-white placeholder:text-slate-500 border border-[#243242] focus:border-[#3390EC] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                Повторите пароль *
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Введите пароль ещё раз"
                className="w-full h-11 px-3.5 rounded-xl bg-[#0E1621] text-sm text-white placeholder:text-slate-500 border border-[#243242] focus:border-[#3390EC] focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl bg-[#3390EC] hover:bg-[#2A81D8] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{mode === 'register' ? 'Создать аккаунт' : 'Войти в Тилиграм'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
