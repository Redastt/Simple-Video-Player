const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);

app.setName('Redast');

let mainWindow = null;

function extractVideoPathFromArgv(argv) {
  try {
    if (!Array.isArray(argv)) return null;
    for (const a of argv) {
      if (!a || typeof a !== 'string') continue;
      const trimmed = a.replace(/^"|"$/g, '');
      if (!trimmed) continue;
      if (!path.isAbsolute(trimmed)) continue;
      const ext = path.extname(trimmed).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(ext)) continue;
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    icon: path.join(__dirname, 'app_logo.ico'),
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = true;

  mainWindow = win;

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    const fileToOpen = extractVideoPathFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (fileToOpen) mainWindow.webContents.send('app:openFile', fileToOpen);
    }
  });

  createWindow();

  const initialFile = extractVideoPathFromArgv(process.argv);
  if (initialFile) {
    const send = () => {
      if (!mainWindow) return;
      mainWindow.webContents.send('app:openFile', initialFile);
    };

    if (mainWindow && mainWindow.webContents && mainWindow.webContents.isLoadingMainFrame()) {
      mainWindow.webContents.once('did-finish-load', send);
    } else {
      setTimeout(send, 300);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openVideo', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Video Seç',
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('video:getNeighbors', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return { prev: null, next: null };

    const dir = path.dirname(filePath);
    const base = path.basename(filePath);

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const baseLower = base.toLowerCase();
    const idx = files.findIndex((n) => n.toLowerCase() === baseLower);
    if (idx === -1) return { prev: null, next: null };

    const prev = idx > 0 ? path.join(dir, files[idx - 1]) : null;
    const next = idx < files.length - 1 ? path.join(dir, files[idx + 1]) : null;
    return { prev, next };
  } catch {
    return { prev: null, next: null };
  }
});

ipcMain.handle('shell:showItemInFolder', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    shell.showItemInFolder(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.on('menu:showVideoContext', async (event, state) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const currentFilePath = state && typeof state.currentFilePath === 'string' ? state.currentFilePath : null;
    const prevPath = state && typeof state.prevPath === 'string' ? state.prevPath : null;
    const nextPath = state && typeof state.nextPath === 'string' ? state.nextPath : null;
    const x = state && Number.isFinite(state.x) ? Math.round(state.x) : undefined;
    const y = state && Number.isFinite(state.y) ? Math.round(state.y) : undefined;

    const template = [
      {
        label: 'Open',
        click: async () => {
          const result = await dialog.showOpenDialog(win, {
            title: 'Video Seç',
            properties: ['openFile'],
            filters: [
              { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });

          if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
          event.sender.send('menu:command', { cmd: 'openPath', path: result.filePaths[0] });
        }
      },
      { type: 'separator' },
      {
        label: 'Previous',
        enabled: Boolean(prevPath),
        click: () => {
          if (!prevPath) return;
          event.sender.send('menu:command', { cmd: 'openPathNoResume', path: prevPath });
        }
      },
      {
        label: 'Next',
        enabled: Boolean(nextPath),
        click: () => {
          if (!nextPath) return;
          event.sender.send('menu:command', { cmd: 'openPathNoResume', path: nextPath });
        }
      },
      { type: 'separator' },
      {
        label: 'Fullscreen',
        click: () => {
          event.sender.send('menu:command', { cmd: 'toggleFullscreen' });
        }
      },
      {
        label: 'Picture in Picture',
        click: () => {
          event.sender.send('menu:command', { cmd: 'togglePip' });
        }
      },
      { type: 'separator' },
      {
        label: 'Open file location',
        enabled: Boolean(currentFilePath),
        click: () => {
          if (!currentFilePath) return;
          shell.showItemInFolder(currentFilePath);
        }
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win, x, y });
  } catch {
  }
});

ipcMain.handle('app:command', async (event, cmd) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;

    switch (cmd) {
      case 'reload':
        win.webContents.reload();
        return true;
      case 'toggleDevTools':
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: 'detach' });
        return true;
      case 'minimize':
        win.minimize();
        return true;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return true;
      case 'close':
        win.close();
        return true;
      case 'quit':
        app.quit();
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
});
