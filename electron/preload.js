const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  savePDF: (buffer, defaultName) =>
    ipcRenderer.invoke('save-pdf', { buffer, defaultName }),
});
