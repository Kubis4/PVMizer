const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  savePDF: (buffer, defaultName) =>
    ipcRenderer.invoke('save-pdf', { buffer, defaultName }),

  fetchPVGIS: (lat, lon) =>
    ipcRenderer.invoke('pvgis-fetch', { lat, lon }),

  geocodeAddress: (address) =>
    ipcRenderer.invoke('nominatim-geocode', { address }),

  saveProject: (jsonString, defaultName) =>
    ipcRenderer.invoke('save-project', { jsonString, defaultName }),

  openProject: () =>
    ipcRenderer.invoke('open-project'),
});
