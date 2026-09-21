// Desktop wrapper for the razerqdhid web app.
//
// Serves the built site (dist-desktop/) from a loopback HTTP server, because the
// app relies on a service worker (sync-message channel for Pyodide) and service
// workers need a secure context. http://127.0.0.1 counts as secure; file:// does not.
//
// WebHID: Chromium's device picker does not exist in Electron, so the
// 'select-hid-device' handler picks the Razer interface that carries a feature
// report (the vendor control interface) automatically.
//
// Per-app profiles: on Hyprland the main process follows the compositor's event
// socket and forwards 'activewindow' changes to the page, which writes the
// matching bindings into the mouse's direct profile. Closing the window hides it
// to the tray so that keeps working; Quit is in the tray menu and the footer.
'use strict';
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const { app, BrowserWindow, session, ipcMain, Tray, Menu, nativeImage } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');

const RAZER_VID = 0x1532;
const DIST = path.join(__dirname, '..', 'dist-desktop');
const ICON = path.join(__dirname, 'icon.png');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.py': 'text/x-python',
  '.zip': 'application/zip', '.ts': 'text/plain', '.map': 'application/json',
};

let win = null;
let tray = null;
let quitting = false;

// ---- single instance: a second launch just shows the existing window ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

function serveDist() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      reject(new Error(`No build found at ${DIST}. Run: npm run build:desktop`));
      return;
    }
    const server = http.createServer((req, res) => {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) { pathname += 'index.html'; }
      const file = path.normalize(path.join(DIST, pathname));
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function setupHid(ses) {
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'hid');
  ses.setDevicePermissionHandler((details) =>
    details.deviceType === 'hid' && details.device.vendorId === RAZER_VID);
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const razer = details.deviceList.filter((d) => d.vendorId === RAZER_VID);
    const control = razer.find((d) =>
      (d.collections || []).some((c) => (c.featureReports || []).length > 0));
    const pick = control || razer[0];
    callback(pick ? pick.deviceId : undefined);
  });
}

// ---- persistent store (rules + saved profiles) ----
const storePath = () => path.join(app.getPath('userData'), 'app-profiles.json');
ipcMain.handle('store:load', () => {
  try { return JSON.parse(fs.readFileSync(storePath(), 'utf8')); } catch { return null; }
});
ipcMain.handle('store:save', (_e, data) => {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
  return true;
});
ipcMain.handle('quit', () => { quitting = true; app.quit(); });

// ---- Hyprland: focused window + window list ----
// Launchers do not always pass HYPRLAND_INSTANCE_SIGNATURE along, so find the
// running instance ourselves: newest directory under $XDG_RUNTIME_DIR/hypr that
// has an event socket.
function hyprInstance() {
  const runtime = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
  const base = path.join(runtime, 'hypr');
  let sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!sig || !fs.existsSync(path.join(base, sig, '.socket2.sock'))) {
    try {
      const dirs = fs.readdirSync(base)
        .filter((d) => fs.existsSync(path.join(base, d, '.socket2.sock')))
        .map((d) => ({ d, t: fs.statSync(path.join(base, d)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      sig = dirs.length ? dirs[0].d : null;
    } catch { sig = null; }
  }
  return sig ? { runtime, sig, socket: path.join(base, sig, '.socket2.sock') } : null;
}
const HYPR = hyprInstance();

function hyprctl(args) {
  return new Promise((resolve) => {
    if (!HYPR) { resolve(null); return; }
    const env = { ...process.env, XDG_RUNTIME_DIR: HYPR.runtime, HYPRLAND_INSTANCE_SIGNATURE: HYPR.sig };
    execFile('hyprctl', [...args, '-j'], { timeout: 3000, env }, (err, stdout) => {
      if (err) { resolve(null); return; }
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}
ipcMain.handle('active-window', async () => {
  const w = await hyprctl(['activewindow']);
  return w && w.class !== undefined ? { cls: w.class, title: w.title } : null;
});
ipcMain.handle('windows', async () => {
  const list = await hyprctl(['clients']);
  if (!Array.isArray(list)) { return []; }
  return list.filter((c) => c.mapped !== false && c.class)
    .map((c) => ({ cls: c.class, title: c.title, workspace: c.workspace && c.workspace.id }));
});

function watchHyprland() {
  if (!HYPR) { console.error('no Hyprland instance found; per-app switching is off'); return; }
  const sock = HYPR.socket;
  let buffer = '';
  const connect = () => {
    const client = net.createConnection(sock);
    client.setEncoding('utf8');
    client.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
        if (line.startsWith('activewindow>>')) {
          const rest = line.slice('activewindow>>'.length);
          const comma = rest.indexOf(',');
          const cls = comma >= 0 ? rest.slice(0, comma) : rest;
          const title = comma >= 0 ? rest.slice(comma + 1) : '';
          if (win && !win.isDestroyed()) { win.webContents.send('active-window', { cls, title }); }
        }
      }
    });
    client.on('error', () => {});
    client.on('close', () => setTimeout(connect, 5000));
  };
  connect();
}

function showWindow() {
  if (!win) { return; }
  if (win.isMinimized()) { win.restore(); }
  win.show();
  win.focus();
}

function makeTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON));
    tray.setToolTip('Razer Onboard Config');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch (e) {
    console.error('tray unavailable: ' + e.message);
  }
}

app.whenReady().then(async () => {
  setupHid(session.defaultSession);
  const port = await serveDist();
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    title: 'Razer Onboard Config',
    autoHideMenuBar: true,
    icon: ICON,
    backgroundColor: '#1f232a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Closing hides to the tray so automatic profile switching keeps running.
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
  makeTray();
  watchHyprland();
}).catch((err) => {
  console.error(err.message);
  app.exit(1);
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* keep running in the tray */ });
