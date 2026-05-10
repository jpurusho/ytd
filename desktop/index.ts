import { app, BrowserWindow, nativeTheme, Menu, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { registerIpcHandlers } from './ipc-handlers';
import { initDatabase } from './services/database';

config({ path: path.join(__dirname, '../../.env') });

app.setName('ytd');

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  nativeTheme.themeSource = 'dark';

  mainWindow = new BrowserWindow({
    title: 'ytd',
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, '../resources/icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0f0f23',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isMac ? [{
          label: 'Exit Full Screen' as string,
          accelerator: 'Escape' as string,
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win?.isFullScreen()) win.setFullScreen(false);
          },
        }] : []),
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('app:fullscreenChange', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('app:fullscreenChange', false);
  });

  // Remove "Electron/x.x.x" from the UA — YouTube blocks iframe embeds when it detects Electron
  const ua = mainWindow.webContents.getUserAgent().replace(/\s*Electron\/\S+/, '');
  mainWindow.webContents.setUserAgent(ua);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol to serve local media files securely
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  // Handle local-media:// protocol with range request support for seeking
  protocol.handle('local-media', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-media://', ''));

    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = request.headers.get('range');

    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
    };
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    function createFileStream(filePath: string, opts?: { start?: number; end?: number }): ReadableStream {
      const fileStream = fs.createReadStream(filePath, opts);
      let closed = false;

      return new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => {
            if (!closed) {
              try { controller.enqueue(chunk); } catch { closed = true; }
            }
          });
          fileStream.on('end', () => {
            if (!closed) {
              closed = true;
              try { controller.close(); } catch {}
            }
          });
          fileStream.on('error', () => {
            if (!closed) {
              closed = true;
              try { controller.close(); } catch {}
            }
          });
        },
        cancel() {
          closed = true;
          fileStream.destroy();
        },
      });
    }

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        return new Response(createFileStream(filePath, { start, end }) as any, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }

    return new Response(createFileStream(filePath) as any, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    });
  });

  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '../resources/icon.png');
    try { app.dock.setIcon(iconPath); } catch {}
  }

  initDatabase();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
