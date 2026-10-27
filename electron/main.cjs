const { app, BrowserWindow, ipcMain, Notification, dialog, powerMonitor, nativeTheme, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { AppUpdates } = require('./updates.cjs');
let win;
let normalBounds;
let wasMaximized = false;
let compact = false;
const supportsGlass = process.platform === 'win32' && Number(require('node:os').release().split('.')[2]) >= 22621;
const dataPath = () => path.join(app.getPath('userData'), 'compasso.json');
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
}
function trusted(event) { return win && event.sender === win.webContents; }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    nativeTheme.themeSource = 'system';
    app.setAppUserModelId('br.com.compasso.estudos');
    win = new BrowserWindow({ width: 1260, height: 850, minWidth: 840, minHeight: 620, frame: false,
      backgroundColor: supportsGlass ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#101010' : '#f6f7f9', backgroundMaterial: supportsGlass ? 'acrylic' : 'none',
      icon: path.join(__dirname, '../assets/icon.ico'), title: 'Compasso',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.setMenu(null);
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
      compact = !!value;
      if (compact) {
        wasMaximized = win.isMaximized();
        normalBounds = win.getNormalBounds();
        if (wasMaximized) win.unmaximize();
        win.setMinimumSize(280, 100);
        win.setSize(340, 112);
        win.setAlwaysOnTop(true, 'pop-up-menu');
      } else {
        win.setAlwaysOnTop(false);
        win.setMinimumSize(840, 620);
        if (normalBounds) win.setBounds(normalBounds);
        if (wasMaximized) win.maximize();
      }
    });
    ipcMain.on('window:minimize', e => { if (trusted(e)) win.minimize(); });
    ipcMain.on('window:maximize', e => { if (trusted(e) && !compact) win.isMaximized() ? win.unmaximize() : win.maximize(); });
    ipcMain.on('window:close', e => { if (trusted(e)) win.close(); });
    ipcMain.on('timer:notify', (e, body) => { if (trusted(e) && Notification.isSupported()) new Notification({ title: 'Compasso · Bloco concluído', body: String(body).slice(0, 300), silent: true }).show(); });
    ipcMain.handle('data:export', async e => {
      if (!trusted(e)) return;
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'compasso-backup.json', filters: [{ name: 'Backup JSON', extensions: ['json'] }] });
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
