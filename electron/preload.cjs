const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  compact: (value) => ipcRenderer.invoke('window:compact', value),
  appearance: (theme) => ipcRenderer.invoke('window:appearance', theme),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  notify: (body) => ipcRenderer.send('timer:notify', body),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  startup: {
    status: () => ipcRenderer.invoke('startup:status'),
    set: enabled => ipcRenderer.invoke('startup:set', enabled),
  },
  reminders: { startup: () => ipcRenderer.invoke('reminders:startup') },
  onOpenReminders: callback => {
    const handler = () => callback();
    ipcRenderer.on('reminders:open', handler);
    return () => ipcRenderer.removeListener('reminders:open', handler);
  },
  updates: {
    opened: () => ipcRenderer.invoke('updates:opened'),
    status: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
  },
  onUpdate: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  },
  onSuspend: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('timer:suspend', handler);
    return () => ipcRenderer.removeListener('timer:suspend', handler);
  },
});
