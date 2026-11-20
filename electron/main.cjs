const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  screen,
  session,
  shell,
} = require('electron');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

const APP_VERSION = app.getVersion();
let mainWindow = null;
const activePopupWindows = [];

function loadDesktopConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // ignore malformed config
  }
  return {};
}

function getStartTarget() {
  const envUrl = (process.env.TILIGRAM_SERVER_URL || '').trim();
  if (envUrl) return { type: 'url', value: envUrl };

  const cfg = loadDesktopConfig();
  if (cfg.serverUrl && String(cfg.serverUrl).trim().startsWith('http')) {
    return { type: 'url', value: String(cfg.serverUrl).trim() };
  }

  if (!app.isPackaged) {
    return { type: 'url', value: 'http://localhost:3000' };
  }

  return { type: 'file', value: path.join(__dirname, '..', 'dist', 'index.html') };
}

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', {
      currentVersion: APP_VERSION,
      ...payload,
    });
  }
}

function configureAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({
      status: 'available',
      updateAvailable: true,
      latestVersion: info?.version,
      releaseName: info?.releaseName || `Тилиграм v${info?.version || ''}`,
      releaseNotes:
        typeof info?.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info?.releaseNotes)
            ? info.releaseNotes.map((n) => n.note || '').join('\n')
            : '',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus({
      status: 'up-to-date',
      updateAvailable: false,
      latestVersion: info?.version || APP_VERSION,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      status: 'downloading',
      updateAvailable: true,
      percent: Math.round(progress?.percent || 0),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({
      status: 'downloaded',
      updateAvailable: true,
      latestVersion: info?.version,
      percent: 100,
    });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus({
      status: 'error',
      updateAvailable: false,
      error: err?.message || 'Ошибка проверки обновлений',
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function repositionPopupWindows() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const popupWidth = 348;
  const popupHeight = 96;
  const margin = 16;
  const gap = 10;

  activePopupWindows.forEach((win, index) => {
    if (win.isDestroyed()) return;
    const x = workArea.x + workArea.width - popupWidth - margin;
    const y =
      workArea.y +
      workArea.height -
      margin -
      (index + 1) * popupHeight -
      index * gap;
    win.setBounds({ x, y, width: popupWidth, height: popupHeight });
  });
}

function focusChatFromNotification(chatId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (chatId) {
      mainWindow.webContents.send('notification:clicked', { chatId });
    }
  }
}

function showTelegramPopupWindow(payload) {
  const popupWidth = 348;
  const popupHeight = 96;
  const workArea = screen.getPrimaryDisplay().workArea;

  const popup = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: workArea.x + workArea.width - popupWidth - 16,
    y: workArea.y + workArea.height - popupHeight - 16,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const title = escapeHtml(payload.title || 'Тилиграм');
  const subtitle = payload.subtitle ? escapeHtml(payload.subtitle) : '';
  const body = escapeHtml(payload.body || 'Новое сообщение');
  const color = /^#[0-9a-fA-F]{3,8}$/.test(String(payload.avatarColor || ''))
    ? payload.avatarColor
    : '#3390EC';
  const initials = escapeHtml(
    String(payload.title || 'Т')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0] || '')
      .join('')
      .toUpperCase() || 'Т',
  );
  const chatIdParam = encodeURIComponent(String(payload.chatId || ''));

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; user-select: none; }
  .card {
    width: 100%; height: 100%;
    background: rgba(23, 33, 43, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #f1f5f9;
    cursor: pointer;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
  }
  .avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: ${color};
    color: #fff; font-weight: 700; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .content { min-width: 0; flex: 1; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11px; color: #6ab3f3; flex-shrink: 0; }
  .sub { font-size: 12px; color: #6ab3f3; font-weight: 600; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .body { font-size: 12.5px; color: #cbd5e1; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
</style>
</head>
<body>
  <div class="card" onclick="window.location.href='tiligram-popup://open?chatId=${chatIdParam}'">
    <div class="avatar">${initials}</div>
    <div class="content">
      <div class="top">
        <div class="title">${title}</div>
        <div class="tag">Тилиграм</div>
      </div>
      ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}
      <div class="body">${body}</div>
    </div>
  </div>
</body>
</html>`;

  popup.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.startsWith('tiligram-popup://open')) {
      focusChatFromNotification(payload.chatId);
      if (!popup.isDestroyed()) popup.close();
    }
  });

  popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  popup.once('ready-to-show', () => {
    if (!popup.isDestroyed()) popup.showInactive();
  });

  activePopupWindows.unshift(popup);
  while (activePopupWindows.length > 3) {
    const oldest = activePopupWindows.pop();
    if (oldest && !oldest.isDestroyed()) oldest.close();
  }
  repositionPopupWindows();

  const autoCloseTimer = setTimeout(() => {
    if (!popup.isDestroyed()) popup.close();
  }, 6000);

  popup.on('closed', () => {
    clearTimeout(autoCloseTimer);
    const idx = activePopupWindows.indexOf(popup);
    if (idx !== -1) activePopupWindows.splice(idx, 1);
    repositionPopupWindows();
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0E1621',
    title: 'Тилиграм',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const target = getStartTarget();
  let appOrigin = '';
  if (target.type === 'url') {
    try {
      appOrigin = new URL(target.value).origin;
    } catch {
      appOrigin = '';
    }
    void mainWindow.loadURL(target.value);
  } else {
    void mainWindow.loadFile(target.value);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url)) {
      if (!appOrigin || !url.startsWith(appOrigin)) {
        void shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('app:getVersion', () => APP_VERSION);

ipcMain.handle('updater:check', async (_event, repoSlug) => {
  if (!autoUpdater || !app.isPackaged) {
    return {
      supported: false,
      currentVersion: APP_VERSION,
      error: 'Автообновление Electron активно в собранном .exe приложении',
    };
  }
  try {
    if (repoSlug && typeof repoSlug === 'string' && repoSlug.includes('/')) {
      const [owner, repo] = repoSlug.trim().split('/');
      if (owner && repo) {
        autoUpdater.setFeedURL({ provider: 'github', owner, repo });
      }
    }
    const result = await autoUpdater.checkForUpdates();
    return {
      supported: true,
      currentVersion: APP_VERSION,
      latestVersion: result?.updateInfo?.version || APP_VERSION,
    };
  } catch (err) {
    return {
      supported: true,
      currentVersion: APP_VERSION,
      error: err?.message || 'Не удалось проверить обновления',
    };
  }
});

ipcMain.handle('updater:download', async () => {
  if (!autoUpdater || !app.isPackaged) return { ok: false };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('updater:install', async () => {
  if (!autoUpdater || !app.isPackaged) return { ok: false };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

ipcMain.handle('notification:show', async (_event, payload) => {
  const style = payload?.style || 'telegram-popup';
  if (style === 'native' && Notification.isSupported()) {
    const notif = new Notification({
      title: payload?.title || 'Тилиграм',
      subtitle: payload?.subtitle || undefined,
      body: payload?.body || 'Новое сообщение',
      silent: Boolean(payload?.silent),
    });
    notif.on('click', () => focusChatFromNotification(payload?.chatId));
    notif.show();
    return { ok: true, mode: 'native' };
  }

  showTelegramPopupWindow(payload || {});
  return { ok: true, mode: 'telegram-popup' };
});

ipcMain.handle('app:setBadgeCount', async (_event, count) => {
  const safe = Math.max(0, Number(count) || 0);
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(safe);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(safe > 0 ? `(${safe}) Тилиграм` : 'Тилиграм');
    }
  } catch {
    // ignore unsupported platform badge error
  }
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.tiligram.desktop');

    // Allow microphone, camera, screen sharing, and notifications for WebRTC calls
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        const allowed = new Set([
          'media',
          'mediaKeySystem',
          'display-capture',
          'notifications',
          'clipboard-read',
          'clipboard-sanitized-write',
        ]);
        callback(allowed.has(permission));
      },
    );

    configureAutoUpdater();
    createMainWindow();

    if (autoUpdater && app.isPackaged) {
      setTimeout(() => {
        void autoUpdater.checkForUpdates().catch(() => {});
      }, 4500);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}
