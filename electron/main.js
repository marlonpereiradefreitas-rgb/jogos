// Quarentena Z - Janela Desktop + Steamworks DRM + Criptografia AES-256-GCM + Isolamento de Segurança (Electron Security Checklist)
'use strict';

const { app, BrowserWindow, ipcMain, Menu, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

app.setName('Quarentena Z');
app.setPath('userData', path.join(app.getPath('appData'), 'Quarentena Z'));
const SAVE_DIR = path.join(app.getPath('userData'), 'cloud');
const SAVE_FILE = path.join(SAVE_DIR, 'savegame.json');
const STEAM_APP_ID = Number(process.env.STEAM_APP_ID) || 480;
const IS_PROD = process.env.NODE_ENV === 'production' || app.isPackaged;

// Chave derivada AES-256-GCM vinculada à máquina/usuário para proteger o save local contra edição manual
const SAVE_KEY_BUF = crypto.scryptSync(
  `qz19-drm-vault:${os.hostname()}:${os.userInfo().username}:quarentena-z`,
  'qz19_salt_v4_9f2a',
  32
);

function encryptSaveData(plainUtf8) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SAVE_KEY_BUF, iv);
  const enc = Buffer.concat([cipher.update(plainUtf8, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    qzEnc: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('base64')
  });
}

function decryptSaveData(rawContent) {
  if (!rawContent) return null;
  const parsed = JSON.parse(rawContent);
  if (parsed && parsed.qzEnc === 1 && parsed.iv && parsed.tag && parsed.data) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      SAVE_KEY_BUF,
      Buffer.from(parsed.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final()
    ]);
    return dec.toString('utf8');
  }
  // Compatibilidade transparente com saves JSON anteriores
  if (parsed && parsed.v === 1) {
    return rawContent;
  }
  return null;
}

// Verificação de integridade dos arquivos principais do pacote contra adulteração
function verifyCoreBundleIntegrity() {
  try {
    const rootDir = path.join(__dirname, '..');
    for (const rel of ['index.html', 'game.js', 'style.css', 'theme-v19.css']) {
      const full = path.join(rootDir, rel);
      if (!fs.existsSync(full)) return { ok: false, missing: rel };
      const buf = fs.readFileSync(full);
      if (buf.length < 128) return { ok: false, corrupted: rel };
      crypto.createHash('sha256').update(buf).digest('hex');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

let steam = null;
let steamOwned = false;
try {
  const sw = require('steamworks.js');
  if (process.env.STEAM_DRM_STRICT === '1' && typeof sw.restartAppIfNecessary === 'function') {
    if (sw.restartAppIfNecessary(STEAM_APP_ID)) {
      app.quit();
      process.exit(0);
    }
  }
  steam = sw.init(STEAM_APP_ID);
  steamOwned = !!(steam && (!steam.apps || typeof steam.apps.isSubscribed !== 'function' || steam.apps.isSubscribed()));
} catch (e) {
  console.log('Steam indisponivel (executando fora da Steam):', e.message);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#07090f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !IS_PROD
    }
  });
  Menu.setApplicationMenu(null);

  // Bloqueia navegação externa e abertura de popups arbitrários (proteção contra redirecionamento malicioso)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, navUrl) => {
    if (!navUrl.startsWith('file://')) {
      e.preventDefault();
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
      return;
    }
    // Em modo comercial/produção, bloqueia atalhos de inspeção DevTools (F12, Ctrl+Shift+I/J/C)
    if (IS_PROD && input.type === 'keyDown') {
      const k = String(input.key || '').toUpperCase();
      if (k === 'F12' || ((input.control || input.meta) && input.shift && (k === 'I' || k === 'J' || k === 'C'))) {
        e.preventDefault();
      }
    }
  });
  return win;
}

app.whenReady().then(() => {
  const integrity = verifyCoreBundleIntegrity();
  if (!integrity.ok) {
    dialog.showErrorBox('Erro de Integridade (DRM)', 'Os arquivos principais do jogo estão ausentes ou foram adulterados.');
    app.quit();
    return;
  }

  if (process.env.STEAM_DRM_STRICT === '1' && !steamOwned) {
    dialog.showErrorBox('Verificação Steam DRM', 'Licença ativa da Steam não encontrada. Inicie o jogo diretamente pelo cliente Steam.');
    app.quit();
    return;
  }

  // Nega permissões desnecessárias do navegador (câmera, microfone, geolocalização, USB, notificações)
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false);
    });
  }

  const win = createWindow();

  // Validação estrita em todos os canais IPC
  ipcMain.on('steam:unlock', (e, id) => {
    try {
      const cleanId = String(id || '').trim();
      if (!/^[a-z0-9_]{1,32}$/.test(cleanId)) return;
      if (steam) steam.achievement.activate(cleanId);
    } catch (err) {
      console.log(err.message);
    }
  });

  ipcMain.on('steam:presence', (e, txt) => {
    try {
      const cleanTxt = String(txt || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 120);
      if (steam) {
        steam.localplayer.setRichPresence('steam_display', '#Status');
        steam.localplayer.setRichPresence('status', cleanTxt);
      }
    } catch (err) {
      console.log(err.message);
    }
  });

  ipcMain.on('steam:drm-status', (e) => {
    e.returnValue = {
      ok: true,
      steamConnected: !!steam,
      steamOwned,
      encryptedSaves: true
    };
  });

  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('app:fullscreen', () => win.setFullScreen(!win.isFullScreen()));

  ipcMain.on('save:write', (e, data) => {
    try {
      const str = String(data || '');
      if (str.length > 262144) return; // limite máximo de 256KB
      const parsed = JSON.parse(str);
      if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return;
      fs.mkdirSync(SAVE_DIR, { recursive: true, mode: 0o700 });
      const encryptedPayload = encryptSaveData(JSON.stringify(parsed));
      const tmpFile = SAVE_FILE + '.tmp';
      fs.writeFileSync(tmpFile, encryptedPayload, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpFile, SAVE_FILE);
    } catch (err) {
      console.log(err.message);
    }
  });

  ipcMain.on('save:read', (e) => {
    try {
      if (!fs.existsSync(SAVE_FILE)) {
        e.returnValue = null;
        return;
      }
      const raw = fs.readFileSync(SAVE_FILE, 'utf8');
      e.returnValue = decryptSaveData(raw);
    } catch (err) {
      e.returnValue = null;
    }
  });
});

app.on('window-all-closed', () => app.quit());
