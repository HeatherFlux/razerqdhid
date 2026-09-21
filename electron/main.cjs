// Desktop wrapper for the razerqdhid web app.
//
// Serves the built site (dist-desktop/) from a loopback HTTP server, because the
// app relies on a service worker (sync-message channel for Pyodide) and service
// workers need a secure context. http://127.0.0.1 counts as secure; file:// does not.
//
// WebHID: Chromium's device picker does not exist in Electron, so the
// 'select-hid-device' handler picks the Razer interface that carries a feature
// report (the vendor control interface) automatically.
'use strict';
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const RAZER_VID = 0x1532;
const DIST = path.join(__dirname, '..', 'dist-desktop');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.py': 'text/x-python',
  '.zip': 'application/zip', '.ts': 'text/plain', '.map': 'application/json',
};

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

app.whenReady().then(async () => {
  setupHid(session.defaultSession);
  const port = await serveDist();
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    title: 'Razer Onboard Config',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#1f232a',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}).catch((err) => {
  console.error(err.message);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
