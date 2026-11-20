/**
 * Pure utility functions for WebRTC P2P/Group calls and GitHub Release auto-updates.
 */

export function shouldInitiateOffer(localUserId: string, remoteUserId: string): boolean {
  // Deterministic lexicographical ordering prevents WebRTC offer glare in mesh group calls
  return localUserId.localeCompare(remoteUserId) < 0;
}

export function normalizeGitHubRepoSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Support pasting full GitHub URLs like https://github.com/owner/repo or git@github.com:owner/repo.git
  let cleaned = raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');

  const parts = cleaned.split('/');
  if (parts.length < 2) return null;
  cleaned = `${parts[0]}/${parts[1]}`;

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => {
        const num = Number.parseInt(n, 10);
        return Number.isFinite(num) ? num : 0;
      });

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0;
}

export function formatCallElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
