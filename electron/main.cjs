const { app, BrowserWindow, ipcMain, Notification, dialog, powerMonitor, nativeTheme, nativeImage, net, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { AppUpdates } = require('./updates.cjs');
const { fitCompactBounds } = require('./compact-bounds.cjs');
const { WindowsStartup } = require('./startup.cjs');
const { ReminderNotifications, openRemindersWindow } = require('./reminder-notifications.cjs');
const { APP_ID, DEVELOPMENT_APP_ID, legacyUserData, repairDevelopmentShortcut } = require('./branding.cjs');
if (!process.argv.some(value => value.startsWith('--user-data-dir'))) {
  const profile = legacyUserData(app.getPath('appData'));
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
let win;
let normalBounds;
let wasMaximized = false;
let compact = false;
let compactBounds;
let changingMode = false;
let windowSaveTimer;
let startup;
const supportsGlass = process.platform === 'win32' && Number(require('node:os').release().split('.')[2]) >= 22621;
const dataPath = () => path.join(app.getPath('userData'), 'compasso.json');
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json');
function rememberCompact() {
  if (!compact || changingMode || win.isDestroyed()) return;
  compactBounds = win.getBounds();
  clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(saveWindowState, 350);
}
function saveWindowState() {
  if (!compactBounds) return;
  try {
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(windowStatePath() + '.tmp', JSON.stringify({ compactBounds }));
    fs.renameSync(windowStatePath() + '.tmp', windowStatePath());
  } catch { /* Window position is optional; a save failure must not stop studying. */ }
}
function readData() {
  if (!fs.existsSync(dataPath())) return null;
  try { return JSON.parse(fs.readFileSync(dataPath(), 'utf8')); }
  catch (err) { throw new Error('Não foi possível ler seus dados. O arquivo foi preservado. Restaure um backup antes de continuar.'); }
}
function writeData(data) {
  if (data?.version !== 1 || !Array.isArray(data.plans) || !data.records) throw new Error('Formato de dados inválido.');
  const file = dataPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data), 'utf8');
  fs.renameSync(file + '.tmp', file);
  startup?.sync(data.settings);
}
function trusted(event) { return win && event.sender === win.webContents; }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    try { compactBounds = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')).compactBounds; } catch {}
    nativeTheme.themeSource = 'system';
    const appId = app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID;
    app.setAppUserModelId(appId);
    // Isolated profiles and development runs must never register test executables.
    const isolated = process.argv.some(value => value.startsWith('--user-data-dir'));
    if (process.platform === 'win32' && !isolated) repairDevelopmentShortcut(shell, app.getPath('appData'));
    const installed = ['Uninstall Organon.exe', 'Uninstall Compasso.exe'].some(name => fs.existsSync(path.join(path.dirname(process.execPath), name)));
    startup = new WindowsStartup({ app, path: process.execPath, available: process.platform === 'win32' && app.isPackaged && installed && !isolated && !process.env.PORTABLE_EXECUTABLE_FILE });
    try { startup.sync(readData()?.settings); } catch { /* The renderer reports data errors without replacing the file. */ }
    win = new BrowserWindow({ width: 1260, height: 850, minWidth: 840, minHeight: 620, frame: false,
      backgroundColor: supportsGlass ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#101010' : '#f6f7f9', backgroundMaterial: supportsGlass ? 'acrylic' : 'none',
      icon: nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png')), title: 'Organon',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.setMenu(null);
    if (process.platform === 'win32') {
      // Explorer needs a real filesystem path, rather than an icon inside app.asar.
      win.setAppDetails({ appId, appIconPath: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../assets/icon.ico'), appIconIndex: 0,
        relaunchDisplayName: 'Organon', relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"` });
    }
    const reminderNotifications = new ReminderNotifications({ Notification, available: !isolated, open: () => openRemindersWindow(win) });
    ipcMain.handle('startup:status', e => { if (trusted(e)) return startup.status(); });
    ipcMain.handle('startup:set', (e, enabled) => { if (trusted(e)) return startup.set(enabled); });
    ipcMain.handle('reminders:startup', e => { if (trusted(e)) return reminderNotifications.startup(readData()?.reminders || []); });
    win.on('move', rememberCompact);
    win.on('resize', rememberCompact);
    win.on('close', () => { rememberCompact(); clearTimeout(windowSaveTimer); saveWindowState(); });
    const updater = new AppUpdates({
      version: app.getVersion(), cacheDir: path.join(app.getPath('userData'), 'updates'), fetchImpl: net.fetch.bind(net),
      emit: status => { if (!win.isDestroyed()) win.webContents.send('updates:status', status); },
      launchInstaller: file => new Promise((resolve, reject) => {
        const child = spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true });
        child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
      }),
      onQuit: () => setTimeout(() => app.quit(), 100),
    });
    ipcMain.handle('updates:status', e => { if (trusted(e)) return updater.state; });
    let startupCleanup;
    ipcMain.handle('updates:opened', e => {
      if (!trusted(e) || (!isolated && (!app.isPackaged || !installed))) return;
      if (!startupCleanup) {
        startupCleanup = updater.cleanupInstalled();
        const retry = setTimeout(() => updater.cleanupInstalled(), 30000); retry.unref();
      }
      return startupCleanup;
    });
    ipcMain.handle('updates:check', e => { if (trusted(e)) return updater.check(); });
    ipcMain.handle('updates:download', e => { if (trusted(e)) return updater.download(); });
    ipcMain.handle('updates:install', e => { if (trusted(e)) return updater.install(); });
    powerMonitor.on('suspend', () => { if (!win.isDestroyed()) win.webContents.send('timer:suspend'); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    ipcMain.handle('data:load', (e) => { if (trusted(e)) return readData(); });
    ipcMain.handle('data:save', (e, data) => { if (trusted(e)) writeData(data); });
    ipcMain.handle('window:appearance', (e, theme) => {
      if (!trusted(e)) return;
      nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
      if (!supportsGlass) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#101010' : '#f6f7f9');
      return { glass: supportsGlass };
    });
    nativeTheme.on('updated', () => {
      if (!win.isDestroyed() && !supportsGlass) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#101010' : '#f6f7f9');
    });
    ipcMain.handle('window:compact', (e, value) => {
      if (!trusted(e) || compact === !!value) return;
      changingMode = true;
      if (value) {
        wasMaximized = win.isMaximized();
        normalBounds = win.getNormalBounds();
        if (wasMaximized) win.unmaximize();
        win.setMinimumSize(340, 112);
        win.setMaximumSize(340, 112);
        win.setResizable(false);
        win.setMaximizable(false);
        const primary = screen.getPrimaryDisplay();
        const areas = [primary, ...screen.getAllDisplays().filter(display => display.id !== primary.id)].map(display => display.workArea);
        win.setBounds(fitCompactBounds(compactBounds || { ...normalBounds, width: 340, height: 112 }, areas));
        compact = true;
        win.setAlwaysOnTop(true, 'pop-up-menu');
      } else {
        compactBounds = win.getBounds(); saveWindowState();
        compact = false;
        win.setAlwaysOnTop(false);
        win.setResizable(true);
        win.setMaximizable(true);
        win.setMaximumSize(0, 0);
        win.setMinimumSize(840, 620);
        if (normalBounds) win.setBounds(normalBounds);
        if (wasMaximized) win.maximize();
      }
      changingMode = false;
    });
    ipcMain.on('window:minimize', e => { if (trusted(e)) win.minimize(); });
    ipcMain.on('window:maximize', e => { if (trusted(e) && !compact) win.isMaximized() ? win.unmaximize() : win.maximize(); });
    ipcMain.on('window:close', e => { if (trusted(e)) win.close(); });
    ipcMain.on('timer:notify', (e, body) => { if (trusted(e) && Notification.isSupported()) new Notification({ title: 'Organon · Bloco concluído', body: String(body).slice(0, 300), silent: true }).show(); });
    ipcMain.handle('data:export', async e => {
      if (!trusted(e)) return;
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'organon-backup.json', filters: [{ name: 'Backup JSON', extensions: ['json'] }] });
      if (!canceled && filePath) { fs.copyFileSync(dataPath(), filePath); return true; }
      return false;
    });
    ipcMain.handle('data:import', async e => {
      if (!trusted(e)) return;
      const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Backup JSON', extensions: ['json'] }] });
      if (canceled) return null;
      if (fs.statSync(filePaths[0]).size > 40 * 1024 * 1024) throw new Error('Backup acima do limite de 40 MB.');
      return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    });
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  });
  app.on('window-all-closed', () => app.quit());
}
