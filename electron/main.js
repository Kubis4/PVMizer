'use strict';

const { app, BrowserWindow, Menu, shell, dialog, globalShortcut, ipcMain, net } = require('electron');
const path = require('path');
const fs   = require('fs');

// ─── Single Instance Lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

// ─── Window Creation ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1600,
    height:          900,
    minWidth:        900,
    minHeight:       600,
    backgroundColor: '#0a0e1a',
    show:            false,       // show after ready-to-show to avoid white flash
    title:           'PVMizer 2.0',
    icon:            path.join(__dirname, '..', 'assets', 'app_icon.png'),
    autoHideMenuBar: true,        // hide menu bar (show with Alt)
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
      preload:          path.join(__dirname, 'preload.js'),
    }
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // Show only when fully rendered (no white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Menu (minimal — accessible via Alt key) ──────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (mainWindow) mainWindow.webContents.reload(); }
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            if (mainWindow) {
              const z = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.min(z + 0.1, 3));
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (mainWindow) {
              const z = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.max(z - 0.1, 0.5));
            }
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => { if (mainWindow) mainWindow.webContents.setZoomFactor(1); }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Solar Panel Simulation',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type:    'info',
              title:   'Solar Panel Simulation',
              message: 'Solar Panel Simulation v1.0.0',
              detail:  [
                '3D solar panel energy simulation with real-time sun tracking.',
                '',
                'Features:',
                '• 4 roof types: Flat, Gable, Hip, Pyramid',
                '• Real solar position algorithm (Spencer/NOAA)',
                '• POA irradiance & energy calculations',
                '• Three.js WebGL rendering with bloom & shadows',
                '',
                'Powered by Three.js, Chart.js, and Electron.'
              ].join('\n'),
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();

  // IPC: Fetch PVGIS monthly irradiance data (bypasses renderer CORS restrictions)
  // Uses Electron's net.fetch() which handles redirects and system proxy/certificates.
  // PVGIS-SARAH2 covers Europe/Africa; falls back to PVGIS-ERA5 for global coverage.
  ipcMain.handle('pvgis-fetch', async (event, { lat, lon }) => {
    const base = `https://re.jrc.ec.europa.eu/api/v5_2/MRcalc?lat=${lat}&lon=${lon}&horirrad=1&outputformat=json`;
    for (const db of ['PVGIS-SARAH2', 'PVGIS-ERA5']) {
      const res = await net.fetch(`${base}&raddatabase=${db}`);
      if (res.ok) return res.json();
    }
    throw new Error('PVGIS: location not covered by any available database');
  });

  // IPC: Save PDF file via native Save As dialog
  ipcMain.handle('save-pdf', async (event, { buffer, defaultName }) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF Report',
      defaultPath: defaultName || 'solar-project.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (!filePath) return { success: false };
    try {
      fs.writeFileSync(filePath, Buffer.from(buffer));
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Geocode an address via Nominatim (OpenStreetMap), bypasses renderer CORS
  ipcMain.handle('nominatim-geocode', async (event, { address }) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await net.fetch(url, {
      headers: { 'User-Agent': 'PVMizer/2.0 (solar installation simulator)' }
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  });

  // If a second instance tried to open, focus the existing window
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Prevent navigation away from the app
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    // Only allow file:// navigation (our own app files)
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
