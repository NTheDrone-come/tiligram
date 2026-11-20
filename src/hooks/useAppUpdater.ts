import { useCallback, useEffect, useState } from 'react';
import type { AppUpdateInfo } from '../types/telegram';

const LOCAL_REPO_KEY = 'tiligram-github-repo-v1';

export interface AppUpdaterController {
  isElectron: boolean;
  updateInfo: AppUpdateInfo;
  bannerDismissed: boolean;
  savedRepo: string;
  setSavedRepo: (repo: string) => void;
  checkForUpdates: (repoOverride?: string) => Promise<AppUpdateInfo>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissBanner: () => void;
}

export function useAppUpdater(
  configuredRepo?: string,
  autoCheckEnabled = true,
): AppUpdaterController {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.tiligramDesktop?.isElectron);

  const [savedRepo, setSavedRepoState] = useState<string>(() => {
    if (configuredRepo) return configuredRepo;
    try {
      return localStorage.getItem(LOCAL_REPO_KEY) || '';
    } catch {
      return '';
    }
  });

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo>({
    status: 'idle',
    currentVersion: '1.0.0',
    updateAvailable: false,
    repo: savedRepo,
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (configuredRepo && configuredRepo !== savedRepo) {
      setSavedRepoState(configuredRepo);
    }
  }, [configuredRepo]);

  const setSavedRepo = useCallback((repo: string) => {
    setSavedRepoState(repo);
    try {
      localStorage.setItem(LOCAL_REPO_KEY, repo);
    } catch {
      // ignore
    }
  }, []);

  // Subscribe to native Electron electron-updater events
  useEffect(() => {
    if (!isElectron || !window.tiligramDesktop) return;
    window.tiligramDesktop
      .getVersion()
      .then((ver) => {
        setUpdateInfo((prev) => ({ ...prev, currentVersion: ver || '1.0.0' }));
      })
      .catch(() => {});

    const unsub = window.tiligramDesktop.onUpdateStatus((status) => {
      setUpdateInfo((prev) => ({
        ...prev,
        ...status,
        updateAvailable:
          status.status === 'available' ||
          status.status === 'downloading' ||
          status.status === 'downloaded',
      }));
      if (status.status === 'available' || status.status === 'downloaded') {
        setBannerDismissed(false);
      }
    });
    return unsub;
  }, [isElectron]);

  const checkForUpdates = useCallback(
    async (repoOverride?: string): Promise<AppUpdateInfo> => {
      const targetRepo = (repoOverride ?? savedRepo).trim();
      setUpdateInfo((prev) => ({
        ...prev,
        status: 'checking',
        error: undefined,
      }));

      // In Electron desktop app, also trigger native electron-updater check
      if (isElectron && window.tiligramDesktop) {
        try {
          const nativeRes = await window.tiligramDesktop.checkForUpdates(
            targetRepo || undefined,
          );
          if (nativeRes.supported && !nativeRes.error) {
            const next: AppUpdateInfo = {
              status:
                nativeRes.latestVersion &&
                nativeRes.latestVersion !== nativeRes.currentVersion
                  ? 'available'
                  : 'up-to-date',
              currentVersion: nativeRes.currentVersion,
              latestVersion: nativeRes.latestVersion,
              updateAvailable: Boolean(
                nativeRes.latestVersion &&
                  nativeRes.latestVersion !== nativeRes.currentVersion,
              ),
              repo: targetRepo,
            };
            setUpdateInfo(next);
            return next;
          }
        } catch {
          // Fall back to GitHub API check below
        }
      }

      try {
        const query = targetRepo
          ? `?repo=${encodeURIComponent(targetRepo)}`
          : '';
        const res = await fetch(`/api/updates/check${query}`);
        const data = (await res.json()) as AppUpdateInfo;
        setUpdateInfo(data);
        if (data.repo && !savedRepo) {
          setSavedRepo(data.repo);
        }
        if (data.updateAvailable) {
          setBannerDismissed(false);
        }
        return data;
      } catch {
        const fallback: AppUpdateInfo = {
          status: 'error',
          currentVersion: updateInfo.currentVersion,
          updateAvailable: false,
          error: 'Не удалось проверить обновления на GitHub',
        };
        setUpdateInfo(fallback);
        return fallback;
      }
    },
    [isElectron, savedRepo, setSavedRepo, updateInfo.currentVersion],
  );

  // Auto-check once on startup when enabled and repo or env var might be set
  useEffect(() => {
    if (!autoCheckEnabled) return;
    const timer = setTimeout(() => {
      void checkForUpdates();
    }, 3500);
    return () => clearTimeout(timer);
    // Intentionally run once on mount / setting flip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckEnabled]);

  const downloadUpdate = useCallback(async () => {
    if (isElectron && window.tiligramDesktop) {
      setUpdateInfo((prev) => ({ ...prev, status: 'downloading', percent: 0 }));
      await window.tiligramDesktop.downloadUpdate();
      return;
    }
    if (updateInfo.releaseUrl) {
      window.location.href = updateInfo.releaseUrl;
    }
  }, [isElectron, updateInfo.releaseUrl]);

  const installUpdate = useCallback(async () => {
    if (isElectron && window.tiligramDesktop) {
      await window.tiligramDesktop.installUpdate();
    }
  }, [isElectron]);

  return {
    isElectron,
    updateInfo,
    bannerDismissed,
    savedRepo,
    setSavedRepo,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissBanner: () => setBannerDismissed(true),
  };
}
