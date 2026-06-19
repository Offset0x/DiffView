const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let saveTimer = null;

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.DiffView.app');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

function loadState() {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.bounds && typeof data.bounds.width === 'number') {
      return data;
    }
  } catch (_) {}
  return { maximized: true, bounds: { width: 1280, height: 820 } };
}

function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const maximized = mainWindow.isMaximized();
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(stateFile, JSON.stringify({ maximized, bounds }));
  } catch (e) {
    console.error('saveState failed:', e);
  }
}

function debouncedSaveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function createWindow() {
  const state = loadState();

  mainWindow = new BrowserWindow({
    width: state.bounds.width,
    height: state.bounds.height,
    x: state.bounds.x,
    y: state.bounds.y,
    show: false,
    backgroundColor: '#1e1e1e',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);
  mainWindow.on('maximize', saveState);
  mainWindow.on('unmaximize', saveState);

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.error('Tray icon empty:', iconPath);
    return;
  }
  tray = new Tray(image);
  tray.setToolTip('DiffView');

  const menu = Menu.buildFromTemplate([
    { label: 'Show DiffView', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Force Quit', click: () => forceQuit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => showWindow());
}

function forceQuit() {
  isQuitting = true;
  saveState();
  app.quit();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  saveState();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});
