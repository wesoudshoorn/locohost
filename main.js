import { app, Notification, nativeImage, ipcMain, shell } from 'electron';
import { menubar } from 'menubar';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAPIServer, listen } from './lib/api.js';
import * as monitor from './lib/health/monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.CONDUCTOR_PORT || process.env.PORT || 3847;

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('Locohost unhandled rejection:', err);
});

// Create tray icons
function createIcon(name) {
  const iconPath = path.join(__dirname, 'ui', 'icons', name);
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  return icon;
}

let mb;

// Send macOS notification via Electron
function sendNotification(summary) {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: summary.title,
    body: summary.body,
    silent: false
  });

  notification.on('click', () => {
    if (mb) mb.showWindow();
  });

  notification.show();
  updateTrayIcon(summary.severity);
}

// Update the tray icon to reflect health status
function updateTrayIcon(severity) {
  if (!mb || !mb.tray) return;

  try {
    if (severity === 'critical') {
      mb.tray.setImage(createIcon('tray-critical.png'));
    } else if (severity === 'warning') {
      mb.tray.setImage(createIcon('tray-warning.png'));
    } else {
      mb.tray.setImage(createIcon('tray-default.png'));
    }
  } catch (e) {
    // Fallback: icons might not exist yet
  }
}

app.whenReady().then(async () => {
  // Start API server (no static serving — Electron loads files directly)
  const server = createAPIServer({ port: PORT });
  await listen(server, PORT);
  console.log(`Locohost API running at http://localhost:${PORT}`);

  // Start health monitoring
  monitor.setNotifier(sendNotification);
  monitor.start();

  // Create menubar
  mb = menubar({
    index: `file://${path.join(__dirname, 'ui', 'index.html')}`,
    icon: path.join(__dirname, 'ui', 'icons', 'tray-default.png'),
    browserWindow: {
      width: 420,
      height: 200,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        additionalArguments: [`--locohost-port=${PORT}`]
      }
    },
    preloadWindow: true,
    showDockIcon: false,
    showOnAllWorkspaces: false,
    tooltip: 'Locohost'
  });

  mb.on('ready', () => {
    console.log('Locohost menubar ready');

    // Set as template image for proper macOS appearance
    if (mb.tray) {
      const img = nativeImage.createFromPath(
        path.join(__dirname, 'ui', 'icons', 'tray-default.png')
      );
      img.setTemplateImage(true);
      mb.tray.setImage(img);
    }
  });

  // Open URLs in the system default browser
  ipcMain.on('open-external', (event, url) => {
    if (typeof url === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
      shell.openExternal(url);
    }
  });

  // Dynamic window resize based on content height
  ipcMain.on('resize', (event, contentHeight) => {
    const win = mb?.window;
    if (!win || win.isDestroyed()) return;
    const newHeight = Math.min(700, Math.max(80, Math.ceil(contentHeight) + 2));
    const bounds = win.getBounds();
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: newHeight });
  });

  // Periodically update tray icon based on health status
  setInterval(() => {
    const summary = monitor.getLatestSummary();
    if (summary) {
      updateTrayIcon(summary.severity);
    } else {
      updateTrayIcon('ok');
    }
  }, 60000);
});

// macOS: hide dock icon
app.dock?.hide();

// Don't quit when window closes — we're a menubar app
app.on('window-all-closed', () => {});
