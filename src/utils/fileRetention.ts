import type { FileRetentionPolicy } from '../types/telegram.ts';

export const ONE_MB = 1024 * 1024;
export const TEN_MB = 10 * ONE_MB;
export const MAX_UPLOAD_BYTES = 25 * ONE_MB;

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const FIVE_DAYS_MS = 5 * ONE_DAY_MS;

export interface FileRetentionDecision {
  policy: FileRetentionPolicy;
  expiresAt: string | null;
  humanLabel: string;
}

/**
 * Tiligram file retention rules:
 * - >= 10 MB: stored for 1 day (24 hours), then auto-deleted
 * - 1 MB to < 10 MB: stored for 5 days (120 hours), then auto-deleted
 * - < 1 MB: stored indefinitely
 */
export function computeFileRetention(
  sizeBytes: number,
  nowMs: number = Date.now(),
): FileRetentionDecision {
  const safeSize = Math.max(0, sizeBytes);

  if (safeSize >= TEN_MB) {
    return {
      policy: '1_day',
      expiresAt: new Date(nowMs + ONE_DAY_MS).toISOString(),
      humanLabel: 'Хранится 1 день',
    };
  }

  if (safeSize >= ONE_MB) {
    return {
      policy: '5_days',
      expiresAt: new Date(nowMs + FIVE_DAYS_MS).toISOString(),
      humanLabel: 'Хранится 5 дней',
    };
  }

  return {
    policy: 'permanent',
    expiresAt: null,
    humanLabel: 'Бессрочно',
  };
}

export function isFileExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return false;
  return nowMs >= expiryMs;
}

export function formatFileSize(sizeBytes: number): string {
  const safe = Math.max(0, sizeBytes);
  if (safe < 1024) return `${safe} Б`;
  if (safe < ONE_MB) return `${Math.max(1, Math.round(safe / 1024))} КБ`;
  return `${(safe / ONE_MB).toFixed(1)} МБ`;
}

export function formatRemainingRetention(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return null;
  const remainingMs = expiryMs - nowMs;
  if (remainingMs <= 0) return 'Срок хранения истёк (удалён с сервера)';

  const totalHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (totalHours < 24) {
    return `Удалится через ${totalHours} ч`;
  }
  const days = Math.ceil(totalHours / 24);
  if (days === 1) return 'Удалится через 1 день';
  if (days >= 2 && days <= 4) return `Удалится через ${days} дня`;
  return `Удалится через ${days} дней`;
}
