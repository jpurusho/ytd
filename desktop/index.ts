import { app, BrowserWindow, nativeTheme, Menu, protocol, session, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { config } from 'dotenv';
import { registerIpcHandlers } from './ipc-handlers';
import { initDatabase } from './services/database';

config({ path: path.join(__dirname, '../../.env') });

app.setName('ytd');

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let prodServer: http.Server | null = null;
let prodServerPort = 0;

function createWindow(): void {
  nativeTheme.themeSource = 'dark';

  // Fix YouTube embed Error 153: YouTube blocks Electron user agents.
  // We must strip "Electron/x.x.x" from the UA BEFORE any content loads,
  // and use onBeforeSendHeaders to ensure cross-origin iframes (YouTube embed)
  // also get the cleaned UA. Setting session UA alone is insufficient for iframes.
  const defaultSession = session.defaultSession;
  const defaultUA = app.userAgentFallback;
  const cleanUA = defaultUA
    .replace(/\s*Electron\/\S+/, '')
    .replace(/\s*ytd\/\S+/, '');
  app.userAgentFallback = cleanUA;
  defaultSession.setUserAgent(cleanUA);

  // Intercept outgoing requests to YouTube and override the User-Agent header.
  // This is essential because YouTube checks the UA header (not the session UA)
  // for cross-origin iframe requests and will block embeds that look like Electron.
  defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = cleanUA;
      // YouTube also checks the Referer/Origin for embed permissions
      if (!details.requestHeaders['Referer']) {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Serve production build via local HTTP server — YouTube embeds require
    // http:// or https:// parent origin. Custom protocols (app://, file://)
    // are rejected with Error 152.
    mainWindow.loadURL(`http://localhost:${prodServerPort}/index.html`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocols before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      // NOTE: standard:true breaks video loading in Electron 45
      // Seeking doesn't work without it, but at least videos play
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true
    }
  },
]);

function startProductionServer(): Promise<number> {
  return new Promise((resolve) => {
    const rendererDir = path.join(__dirname, '../renderer');
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
      '.ico': 'image/x-icon',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    };

    prodServer = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      // Video streaming endpoint
      if (url.pathname === '/video') {
        const videoPath = url.searchParams.get('path');
        if (!videoPath || !fs.existsSync(videoPath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const ext = path.extname(videoPath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = (end - start) + 1;

          const stream = fs.createReadStream(videoPath, { start, end });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
          });
          stream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
          });
          fs.createReadStream(videoPath).pipe(res);
        }
        return;
      }

      // Static file serving for renderer
      let pathname = url.pathname;
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.join(rendererDir, pathname);

      if (!filePath.startsWith(rendererDir)) {
        res.writeHead(403);
        res.end();
        return;
      }

      if (!fs.existsSync(filePath)) {
        const indexPath = path.join(rendererDir, 'index.html');
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });

    prodServer.listen(0, '127.0.0.1', () => {
      const addr = prodServer!.address() as { port: number };
      resolve(addr.port);
    });
  });
}

app.whenReady().then(async () => {
  // Always start HTTP server for video streaming (both dev and prod)
  prodServerPort = await startProductionServer();

  // NOTE: Removed custom protocol handler - now using HTTP server for video streaming
  // Custom protocols had security conflicts with Electron 45 (seekable: 0-0 issue)
  // HTTP-based serving is more reliable and follows web standards

  /*
  // OLD: protocol.handle('local-media', (request) => {
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
  */

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '../resources/icon.png');
    try {
      app.dock.setIcon(iconPath);
    } catch (error) {
      // Failed to set dock icon, not critical
      console.warn('Failed to set dock icon:', error);
    }
  }

  initDatabase();

  // Initialize logger after database is ready
  const { logger } = require('./services/logger');
  logger.init();

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

app.on('will-quit', () => {
  if (prodServer) {
    prodServer.close();
    prodServer = null;
  }
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
export function getProdServerPort(): number { return prodServerPort; }
