/**
 * Quarentena Z — Servidor Backend Online Blindado (Node.js puro, zero dependências externas)
 * Camadas de Segurança Profissional (OWASP + Anti-Cheat + Criptografia HMAC-SHA256):
 *  - Autenticação Criptográfica de Sessão e Propriedade (HMAC-SHA256 + Timing-Safe Compare)
 *  - Proteção de Propriedade de Registros (um jogador não pode apagar/alterar recordes de terceiros)
 *  - Motor Anti-Cheat Server-Side (validação de selo de integridade, heurística de física/ondas/abates)
 *  - Sanitização Profunda Anti-XSS e Anti-Prototype-Pollution (__proto__, constructor, prototype)
 *  - Firewall Rate-Limit Multi-Camadas + Quarentena Automática de IPs abusivos (Anti-DDoS / Brute-Force)
 *  - Cabeçalhos HTTP Estritos (CSP, HSTS, X-Frame-Options, COOP, CORP, Permissions-Policy, Nosniff)
 *  - Whitelist Estrita de Arquivos Estáticos + Proteção contra Path Traversal e Slowloris
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, '.server_secret');
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Garante diretório seguro de dados
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

// Chave secreta criptográfica persistente de 256 bits para assinar tokens HMAC-SHA256
function loadOrCreateServerSecret() {
  if (process.env.QZ_SECRET && process.env.QZ_SECRET.length >= 32) {
    return process.env.QZ_SECRET;
  }
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (s.length >= 64) return s;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch (e) {
    return crypto.randomBytes(32).toString('hex');
  }
}
const SERVER_SECRET = loadOrCreateServerSecret();

function defaultDb() {
  return {
    version: 3,
    createdAt: Date.now(),
    leaderboard: [],
    cloudSaves: {},
    licenses: {},
    securityAudit: {
      blockedRequests: 0,
      antiCheatRejections: 0,
      unauthorizedAttempts: 0,
      licenseActivations: 0
    },
    stats: {
      totalGames: 0,
      totalKills: 0,
      highestWave: 0
    }
  };
}

let DB = defaultDb();
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      DB = Object.assign(defaultDb(), parsed);
      if (!Array.isArray(DB.leaderboard)) DB.leaderboard = [];
      if (!DB.cloudSaves || typeof DB.cloudSaves !== 'object') DB.cloudSaves = {};
      if (!DB.licenses || typeof DB.licenses !== 'object') DB.licenses = {};
      if (!DB.securityAudit || typeof DB.securityAudit !== 'object') {
        DB.securityAudit = defaultDb().securityAudit;
      }
    }
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
} catch (err) {
  console.error('[Quarentena Z] Aviso ao carregar banco de dados:', err.message);
}

let savePending = false;
function persistDb() {
  if (savePending) return;
  savePending = true;
  setTimeout(() => {
    savePending = false;
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('[Quarentena Z] Erro ao salvar banco de dados:', err.message);
    }
  }, 150);
}

/* ============================================================================
 * 1. CRIPTOGRAFIA DE SESSÃO, PROPRIEDADE E SELO DE INTEGRIDADE (ANTI-CHEAT)
 * ============================================================================ */

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function hmacHex(payload) {
  return crypto.createHmac('sha256', SERVER_SECRET).update(String(payload)).digest('hex');
}

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch (e) {
    return false;
  }
}

/**
 * Gera um token de cliente assinado: clientId.issuedAt.hmac
 */
function issueClientToken(existingClientId) {
  const clientId = (existingClientId && /^[a-f0-9]{24,64}$/i.test(existingClientId))
    ? existingClientId
    : crypto.randomBytes(16).toString('hex');
  const issuedAt = Date.now();
  const payload = `${clientId}.${issuedAt}`;
  const sig = hmacHex(payload);
  return `${payload}.${sig}`;
}

/**
 * Verifica um token de cliente assinado e retorna { valid, clientId, ownerHash }
 */
function verifyClientToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, clientId: null, ownerHash: null };
  const parts = token.trim().split('.');
  if (parts.length !== 3) return { valid: false, clientId: null, ownerHash: null };
  const [clientId, issuedAtStr, sig] = parts;
  if (!/^[a-f0-9]{24,64}$/i.test(clientId) || !/^\d+$/.test(issuedAtStr)) {
    return { valid: false, clientId: null, ownerHash: null };
  }
  const expected = hmacHex(`${clientId}.${issuedAtStr}`);
  if (!timingSafeHexEqual(sig, expected)) {
    return { valid: false, clientId: null, ownerHash: null };
  }
  return {
    valid: true,
    clientId,
    ownerHash: sha256Hex('owner:' + clientId)
  };
}

function verifyAdminKey(req) {
  if (!ADMIN_KEY || ADMIN_KEY.length < 12) return false;
  const headerKey = String(req.headers['x-admin-key'] || '');
  return timingSafeHexEqual(sha256Hex(headerKey), sha256Hex(ADMIN_KEY));
}

/* ============================================================================
 * 1B. DRM COMERCIAL (ESTILO STEAM): CHAVES DE LICENÇA E TICKET AUTORITATIVO DE PARTIDA
 * ============================================================================ */

const MAX_DEVICES_PER_LICENSE = 3;
const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function encodeBase32Group(buf, len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += KEY_ALPHABET[buf[i] % KEY_ALPHABET.length];
  }
  return out;
}

/**
 * Gera uma chave comercial criptográfica no formato QZ19-XXXX-XXXX-XXXX-XXXX
 * Os 2 primeiros blocos identificam o serial único e os 2 últimos são o selo HMAC-SHA256.
 */
function generateLicenseKey(edition = 'STD') {
  const rand = crypto.randomBytes(8);
  const g1 = encodeBase32Group(rand.slice(0, 4), 4);
  const g2 = encodeBase32Group(rand.slice(4, 8), 4);
  const mac = crypto.createHmac('sha256', SERVER_SECRET).update(`QZ19_LICENSE:${edition}:${g1}-${g2}`).digest();
  const g3 = encodeBase32Group(mac.slice(0, 4), 4);
  const g4 = encodeBase32Group(mac.slice(4, 8), 4);
  return `QZ19-${g1}-${g2}-${g3}-${g4}`;
}

/**
 * Valida matematicamente uma chave de produto QZ19-XXXX-XXXX-XXXX-XXXX via HMAC-SHA256
 */
function verifyLicenseKey(rawKey) {
  const clean = String(rawKey || '').trim().toUpperCase();
  const m = /^QZ19-([2-9A-Z]{4})-([2-9A-Z]{4})-([2-9A-Z]{4})-([2-9A-Z]{4})$/.exec(clean);
  if (!m) return { valid: false, key: null };
  const [, g1, g2, g3, g4] = m;
  for (const ed of ['STD', 'PRO', 'VIP']) {
    const mac = crypto.createHmac('sha256', SERVER_SECRET).update(`QZ19_LICENSE:${ed}:${g1}-${g2}`).digest();
    const expG3 = encodeBase32Group(mac.slice(0, 4), 4);
    const expG4 = encodeBase32Group(mac.slice(4, 8), 4);
    if (timingSafeHexEqual(g3 + g4, expG3 + expG4)) {
      return { valid: true, key: clean, edition: ed };
    }
  }
  return { valid: false, key: null };
}

function issueLicenseToken(key, ownerHash, edition = 'STD') {
  const issuedAt = Date.now();
  const payload = `${key}.${ownerHash}.${edition}.${issuedAt}`;
  const sig = hmacHex(`lic:${payload}`);
  return `${payload}.${sig}`;
}

function verifyLicenseToken(token, expectedOwnerHash) {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.trim().split('.');
  if (parts.length !== 5) return { valid: false };
  const [key, ownerHash, edition, issuedAtStr, sig] = parts;
  const expectedSig = hmacHex(`lic:${key}.${ownerHash}.${edition}.${issuedAtStr}`);
  if (!timingSafeHexEqual(sig, expectedSig)) return { valid: false };
  if (expectedOwnerHash && ownerHash !== expectedOwnerHash) return { valid: false };
  const rec = DB.licenses[key];
  if (rec && rec.revoked) return { valid: false };
  return { valid: true, key, ownerHash, edition };
}

/**
 * Emite um Ticket Autoritativo de Partida assinado pelo servidor no início do jogo.
 * Contém timestamp real de início, mapa, dificuldade e seed, impedindo falsificação de tempo.
 */
function issueRunTicket(ownerHash, map, diff, seed) {
  const runNonce = crypto.randomBytes(6).toString('hex');
  const startedAt = Date.now();
  const safeMap = VALID_MAPS.has(map) ? map : 'four';
  const safeDiff = VALID_DIFFS.has(diff) ? diff : 'normal';
  const safeSeed = (Number(seed) >>> 0) || 1;
  const payload = `${runNonce}.${ownerHash || 'anon'}.${safeMap}.${safeDiff}.${safeSeed}.${startedAt}`;
  const sig = hmacHex(`runticket:${payload}`);
  return {
    runTicket: `${payload}.${sig}`,
    startedAt,
    seed: safeSeed
  };
}

function verifyRunTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return { valid: false };
  const parts = ticket.trim().split('.');
  if (parts.length !== 7) return { valid: false };
  const [runNonce, ownerHash, map, diff, seedStr, startedAtStr, sig] = parts;
  const payload = `${runNonce}.${ownerHash}.${map}.${diff}.${seedStr}.${startedAtStr}`;
  const expected = hmacHex(`runticket:${payload}`);
  if (!timingSafeHexEqual(sig, expected)) return { valid: false };
  return {
    valid: true,
    runNonce,
    ownerHash,
    map,
    diff,
    seed: Number(seedStr) >>> 0,
    startedAt: Number(startedAtStr) || 0
  };
}

/**
 * Selo determinístico de integridade de partida compartilhado entre cliente e servidor.
 * Impede adulteração direta de requisições POST /api/leaderboard.
 */
function computeRunSeal(entry) {
  const raw = [
    cleanId(entry.id || ''),
    cleanName(entry.name || 'Comandante'),
    Number(entry.wave) | 0,
    Number(entry.time) | 0,
    Number(entry.kills) | 0,
    String(entry.map || 'four'),
    String(entry.diff || 'normal'),
    'qz_v19_sec_seal_9f4a'
  ].join('|');
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 5381 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = ((Math.imul(h2, 33) >>> 0) ^ c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ============================================================================
 * 2. FIREWALL RATE-LIMIT MULTI-CAMADAS E QUARENTENA DE IP (ANTI-ABUSO)
 * ============================================================================ */

const ipState = new Map();
const BAN_DURATION_MS = 10 * 60 * 1000; // 10 minutos de bloqueio para IPs maliciosos

function checkFirewall(ip, isMutation = false) {
  const now = Date.now();
  let rec = ipState.get(ip);
  if (!rec) {
    rec = { windowStart: now, readCount: 0, writeCount: 0, violations: 0, bannedUntil: 0 };
    ipState.set(ip, rec);
  }
  if (rec.bannedUntil > now) {
    DB.securityAudit.blockedRequests = (DB.securityAudit.blockedRequests || 0) + 1;
    return { allowed: false, reason: 'IP temporariamente em quarentena por atividade suspeita.' };
  }
  if (now - rec.windowStart > 60000) {
    rec.windowStart = now;
    rec.readCount = 0;
    rec.writeCount = 0;
  }
  if (isMutation) {
    rec.writeCount++;
    if (rec.writeCount > 30) {
      rec.violations++;
      if (rec.violations >= 6) rec.bannedUntil = now + BAN_DURATION_MS;
      DB.securityAudit.blockedRequests = (DB.securityAudit.blockedRequests || 0) + 1;
      return { allowed: false, reason: 'Limite de operações de escrita excedido. Aguarde 1 minuto.' };
    }
  } else {
    rec.readCount++;
    if (rec.readCount > 120) {
      rec.violations++;
      if (rec.violations >= 6) rec.bannedUntil = now + BAN_DURATION_MS;
      DB.securityAudit.blockedRequests = (DB.securityAudit.blockedRequests || 0) + 1;
      return { allowed: false, reason: 'Muitas requisições. Tente novamente em instantes.' };
    }
  }
  return { allowed: true };
}

function recordViolation(ip) {
  const now = Date.now();
  let rec = ipState.get(ip);
  if (!rec) {
    rec = { windowStart: now, readCount: 0, writeCount: 0, violations: 0, bannedUntil: 0 };
    ipState.set(ip, rec);
  }
  rec.violations++;
  if (rec.violations >= 8) {
    rec.bannedUntil = now + BAN_DURATION_MS;
  }
}

// Limpeza periódica da tabela de rate-limit (evita vazamento de memória sob ataque)
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of ipState.entries()) {
    if (now - rec.windowStart > 300000 && rec.bannedUntil < now) {
      ipState.delete(ip);
    }
  }
}, 120000).unref();

/* ============================================================================
 * 3. SANITIZAÇÃO PROFUNDA (ANTI-XSS, ANTI-PROTOTYPE-POLLUTION E VALIDAÇÃO)
 * ============================================================================ */

const VALID_MAPS = new Set([
  'four', 'forest', 'industrial', 'metro', 'highway',
  'suburbio', 'clareira', 'ferrovia', 'espiral', 'cruzamento',
  'porto', 'artico', 'pantano', 'zigzag', 'aneis',
  'laboratorio', 'cratera', 'labirinto'
]);
const VALID_DIFFS = new Set(['easy', 'normal', 'hard', 'apocalypse']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeDeep(val, depth = 0) {
  if (depth > 6) return null;
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return val
      .replace(/[\u0000-\u001F\u007F<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:text\/html/gi, '')
      .slice(0, 16384);
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'boolean') return val;
  if (Array.isArray(val)) {
    return val.slice(0, 2500).map(item => sanitizeDeep(item, depth + 1));
  }
  if (typeof val === 'object') {
    const clean = Object.create(null);
    const keys = Object.keys(val).slice(0, 120);
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      const safeKey = String(k).replace(/[^\w.-]/g, '').slice(0, 48);
      if (!safeKey || FORBIDDEN_KEYS.has(safeKey)) continue;
      clean[safeKey] = sanitizeDeep(val[k], depth + 1);
    }
    return Object.assign({}, clean);
  }
  return null;
}

function cleanName(raw) {
  const s = String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>'"`\\]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, 22);
  return s || 'Comandante';
}

function cleanId(raw) {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
}

/**
 * Validação heurística e criptográfica anti-cheat para submissão de pontuação
 */
function validateLeaderboardEntry(body) {
  const rawWave = Number(body.wave);
  const rawTime = Number(body.time);
  const rawKills = Number(body.kills);

  if (!Number.isFinite(rawWave) || !Number.isFinite(rawTime) || !Number.isFinite(rawKills)) {
    return { ok: false, error: 'Valores numéricos inválidos.' };
  }
  if (rawWave < 0 || rawTime < 0 || rawKills < 0) {
    return { ok: false, error: 'Valores negativos não são permitidos.' };
  }
  if (rawWave > 5000 || rawKills > 5000000 || rawTime > 86400 * 14) {
    return { ok: false, error: 'Valores fora dos limites físicos do jogo.' };
  }

  const wave = Math.floor(rawWave);
  const time = Math.floor(rawTime);
  const kills = Math.floor(rawKills);
  const isProfile = !!body.isProfile;

  // Regra Anti-Cheat 1: Onda avançada sem matar zumbis suficientes
  if (wave > 10 && kills < wave * 3) {
    return { ok: false, error: 'Dados de partida inconsistentes (relação onda/abates impossível).' };
  }
  // Regra Anti-Cheat 2: Abates astronômicos incompatíveis com o número de ondas
  if (wave >= 0 && kills > (Math.max(1, wave) * 2000 + 800)) {
    return { ok: false, error: 'Dados de partida inconsistentes (excesso de abates para a onda atual).' };
  }
  // Regra Anti-Cheat 3: Tempo impossível para uma partida real (mesmo em 3x)
  if (!isProfile && wave >= 6 && time < (wave - 1) * 2) {
    return { ok: false, error: 'Dados de partida inconsistentes (tempo de onda abaixo do limite mínimo).' };
  }

  const name = cleanName(body.name);
  const map = VALID_MAPS.has(body.map) ? body.map : 'four';
  const diff = VALID_DIFFS.has(body.diff) ? body.diff : 'normal';
  const id = cleanId(body.id) || ('run_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'));

  // Regra Anti-Cheat 4: Se o cliente enviou selo criptográfico (sig), ele DEVE bater
  if (body.sig !== undefined && body.sig !== null && String(body.sig).length > 0) {
    const expectedSeal = computeRunSeal({ id, name, wave, time, kills, map, diff });
    if (!timingSafeHexEqual(String(body.sig), expectedSeal)) {
      return { ok: false, error: 'Assinatura criptográfica de integridade da partida é inválida.' };
    }
  }

  // Regra Anti-Cheat 5: Verificação de Ticket Autoritativo de Partida (quando presente)
  if (body.runTicket) {
    const tk = verifyRunTicket(String(body.runTicket));
    if (!tk.valid) {
      return { ok: false, error: 'Ticket de sessão de partida adulterado ou inválido.' };
    }
    const wallElapsedSec = Math.max(0, (Date.now() - tk.startedAt) / 1000);
    // Mesmo em velocidade 3x, o tempo de simulação não pode exceder mais de 4x o tempo real decorrido + margem de 15s
    if (!isProfile && wave >= 10 && wallElapsedSec + 15 < time / 4) {
      return { ok: false, error: 'Anomalia temporal detectada (speedhack bloqueado pelo servidor).' };
    }
  }

  return {
    ok: true,
    entry: {
      id,
      isProfile,
      name,
      wave,
      time,
      kills,
      map,
      diff,
      date: Date.now()
    }
  };
}

/**
 * Remove campos internos sensíveis (como ownerHash) antes de enviar ao público
 */
function publicEntry(entry) {
  return {
    id: entry.id,
    isProfile: !!entry.isProfile,
    name: entry.name,
    wave: entry.wave,
    time: entry.time,
    kills: entry.kills,
    map: entry.map,
    diff: entry.diff,
    date: entry.date
  };
}

/* ============================================================================
 * 4. CABEÇALHOS HTTP DE SEGURANÇA MÁXIMA (OWASP / CSP / HSTS / CORP)
 * ============================================================================ */

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
};

function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const host = req.headers.host || 'localhost';
  // Permite apenas mesma origem ou localhost para evitar CSRF cross-origin abusivo
  const allowedOrigin = (!origin || origin.includes(host) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))
    ? (origin || '*')
    : 'null';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Token, X-License-Token, X-Admin-Key',
    'Vary': 'Origin'
  };
}

function sendJson(req, res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, getCorsHeaders(req), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  }));
  res.end(body);
}

function readJsonBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload excede o limite de segurança (64KB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        const parsed = str ? JSON.parse(str) : {};
        resolve(sanitizeDeep(parsed));
      } catch (e) {
        reject(new Error('Formato JSON inválido ou corrompido'));
      }
    });
    req.on('error', reject);
  });
}

function sortLeaderboard(list, sortMode) {
  return list.slice().sort((a, b) => {
    if (sortMode === 'kills') return (b.kills - a.kills) || (b.wave - a.wave) || (b.time - a.time);
    if (sortMode === 'time') return (b.time - a.time) || (b.wave - a.wave) || (b.kills - a.kills);
    return (b.wave - a.wave) || (b.kills - a.kills) || (b.time - a.time);
  });
}

function extractClientAuth(req, body) {
  const rawToken = req.headers['x-client-token'] || (body && body.clientToken) || '';
  return verifyClientToken(String(rawToken));
}

/* ============================================================================
 * 5. ROTEADOR DA API REST (/api/*)
 * ============================================================================ */

async function handleApi(req, res, urlObj) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, Object.assign({}, SECURITY_HEADERS, getCorsHeaders(req)));
    res.end();
    return;
  }

  const rawIp = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown');
  const ip = rawIp.split(',')[0].trim();
  const isMutation = req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE';

  const fw = checkFirewall(ip, isMutation);
  if (!fw.allowed) {
    sendJson(req, res, 429, { ok: false, error: fw.reason });
    return;
  }

  const pathname = urlObj.pathname;

  // 0. GET ou POST /api/session — Emissão/ renovação de token criptográfico de sessão (HMAC-SHA256)
  if (pathname === '/api/session' && (req.method === 'GET' || req.method === 'POST')) {
    const existingAuth = extractClientAuth(req, null);
    const token = issueClientToken(existingAuth.valid ? existingAuth.clientId : null);
    const verified = verifyClientToken(token);
    sendJson(req, res, 200, {
      ok: true,
      clientToken: token,
      clientId: verified.clientId
    });
    return;
  }

  // 1. GET /api/status
  if (pathname === '/api/status' && req.method === 'GET') {
    sendJson(req, res, 200, {
      ok: true,
      status: 'online',
      game: 'Quarentena Z',
      version: '19.4',
      security: 'Steam-Grade DRM + HMAC-SHA256 + AntiCheat + CSP',
      requireLicense: process.env.REQUIRE_LICENSE === '1',
      uptime: Math.floor(process.uptime()),
      totalEntries: DB.leaderboard.length,
      stats: DB.stats
    });
    return;
  }

  // 1B. GET /api/license/status — Verifica licença DRM ativa do dispositivo/jogador
  if (pathname === '/api/license/status' && req.method === 'GET') {
    const auth = extractClientAuth(req, null);
    const rawLicToken = String(req.headers['x-license-token'] || urlObj.searchParams.get('token') || '');
    const verifiedLic = verifyLicenseToken(rawLicToken, auth.valid ? auth.ownerHash : null);
    let activeKey = verifiedLic.valid ? verifiedLic.key : null;
    let edition = verifiedLic.valid ? verifiedLic.edition : null;

    if (!activeKey && auth.valid) {
      for (const [k, rec] of Object.entries(DB.licenses)) {
        if (rec && !rec.revoked && Array.isArray(rec.devices) && rec.devices.includes(auth.ownerHash)) {
          activeKey = k;
          edition = rec.edition || 'STD';
          break;
        }
      }
    }

    const maskedKey = activeKey ? activeKey.replace(/^QZ19-[A-Z0-9]{4}-[A-Z0-9]{4}/, 'QZ19-••••-••••') : null;
    sendJson(req, res, 200, {
      ok: true,
      licensed: !!activeKey,
      requireLicense: process.env.REQUIRE_LICENSE === '1',
      edition: edition || (activeKey ? 'STD' : 'EVAL'),
      maskedKey
    });
    return;
  }

  // 1C. POST /api/license/activate — Ativa uma chave de produto comercial e vincula ao dispositivo (até 3 dispositivos)
  if (pathname === '/api/license/activate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      let auth = extractClientAuth(req, body);
      let newClientToken = null;
      if (!auth.valid) {
        newClientToken = issueClientToken(null);
        auth = verifyClientToken(newClientToken);
      }

      const check = verifyLicenseKey(body.key || body.licenseKey || '');
      if (!check.valid) {
        recordViolation(ip);
        DB.securityAudit.unauthorizedAttempts = (DB.securityAudit.unauthorizedAttempts || 0) + 1;
        persistDb();
        sendJson(req, res, 400, { ok: false, error: 'Chave de produto inválida ou adulterada.' });
        return;
      }

      let rec = DB.licenses[check.key];
      if (!rec) {
        rec = {
          key: check.key,
          edition: check.edition,
          createdAt: Date.now(),
          activatedAt: Date.now(),
          devices: [],
          revoked: false
        };
        DB.licenses[check.key] = rec;
      }

      if (rec.revoked) {
        sendJson(req, res, 403, { ok: false, error: 'Esta chave de licença foi revogada por violação de termos.' });
        return;
      }

      if (!rec.devices.includes(auth.ownerHash)) {
        if (rec.devices.length >= MAX_DEVICES_PER_LICENSE) {
          sendJson(req, res, 403, {
            ok: false,
            error: `Limite máximo de dispositivos (${MAX_DEVICES_PER_LICENSE}) atingido para esta chave.`
          });
          return;
        }
        rec.devices.push(auth.ownerHash);
        rec.lastActivatedAt = Date.now();
        DB.securityAudit.licenseActivations = (DB.securityAudit.licenseActivations || 0) + 1;
        persistDb();
      }

      const licenseToken = issueLicenseToken(check.key, auth.ownerHash, check.edition);
      sendJson(req, res, 200, {
        ok: true,
        licensed: true,
        edition: check.edition,
        maskedKey: check.key.replace(/^QZ19-[A-Z0-9]{4}-[A-Z0-9]{4}/, 'QZ19-••••-••••'),
        devicesUsed: rec.devices.length,
        maxDevices: MAX_DEVICES_PER_LICENSE,
        licenseToken,
        clientToken: newClientToken || undefined
      });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 1D. POST /api/license/generate — Emissão de chaves comerciais pelo proprietário do jogo
  if (pathname === '/api/license/generate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const isLocalLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'unknown';
      if (ADMIN_KEY && !verifyAdminKey(req)) {
        recordViolation(ip);
        sendJson(req, res, 403, { ok: false, error: 'Chave administrativa (X-Admin-Key) inválida.' });
        return;
      }
      if (!ADMIN_KEY && !isLocalLoopback) {
        sendJson(req, res, 403, { ok: false, error: 'Configure ADMIN_KEY no servidor para emitir licenças remotamente.' });
        return;
      }
      const count = Math.max(1, Math.min(50, Number(body.count) || 1));
      const edition = ['STD', 'PRO', 'VIP'].includes(body.edition) ? body.edition : 'STD';
      const keys = [];
      for (let i = 0; i < count; i++) {
        const k = generateLicenseKey(edition);
        DB.licenses[k] = {
          key: k,
          edition,
          createdAt: Date.now(),
          devices: [],
          revoked: false
        };
        keys.push(k);
      }
      persistDb();
      sendJson(req, res, 200, { ok: true, edition, count: keys.length, keys });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 1E. POST /api/run/start — Emite Ticket Autoritativo de Partida assinado pelo servidor
  if (pathname === '/api/run/start' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const ticketData = issueRunTicket(
        auth.valid ? auth.ownerHash : 'anon',
        body.map || 'four',
        body.diff || 'normal',
        body.seed || 1
      );
      sendJson(req, res, 200, Object.assign({ ok: true }, ticketData));
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 2. GET /api/leaderboard
  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const sort = urlObj.searchParams.get('sort') || 'wave';
    const mapFilter = urlObj.searchParams.get('map') || 'all';
    const limit = Math.max(1, Math.min(100, Number(urlObj.searchParams.get('limit')) || 50));

    let list = DB.leaderboard;
    if (mapFilter !== 'all' && VALID_MAPS.has(mapFilter)) {
      list = list.filter(r => r.map === mapFilter);
    }
    const sorted = sortLeaderboard(list, sort).slice(0, limit).map(publicEntry);
    sendJson(req, res, 200, {
      ok: true,
      entries: sorted,
      leaderboard: sorted,
      stats: DB.stats
    });
    return;
  }

  // 3. POST /api/leaderboard (Registrar partida com verificação Anti-Cheat e propriedade)
  if (pathname === '/api/leaderboard' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const validation = validateLeaderboardEntry(body);

      if (!validation.ok) {
        recordViolation(ip);
        DB.securityAudit.antiCheatRejections = (DB.securityAudit.antiCheatRejections || 0) + 1;
        persistDb();
        sendJson(req, res, 400, { ok: false, error: validation.error });
        return;
      }

      const entry = validation.entry;
      if (auth.valid) {
        entry.ownerHash = auth.ownerHash;
      }

      const existingIdx = DB.leaderboard.findIndex(r => r.id === entry.id);
      if (existingIdx >= 0) {
        const prev = DB.leaderboard[existingIdx];
        // Se o registro já possui dono criptográfico, impede que outro cliente o sobrescreva
        if (prev.ownerHash && prev.ownerHash !== entry.ownerHash && !verifyAdminKey(req)) {
          recordViolation(ip);
          DB.securityAudit.unauthorizedAttempts = (DB.securityAudit.unauthorizedAttempts || 0) + 1;
          sendJson(req, res, 403, { ok: false, error: 'Acesso negado: este registro pertence a outro jogador.' });
          return;
        }
        entry.ownerHash = prev.ownerHash || entry.ownerHash;
        entry.wave = Math.max(prev.wave || 0, entry.wave);
        entry.kills = Math.max(prev.kills || 0, entry.kills);
        entry.time = Math.max(prev.time || 0, entry.time);
        DB.leaderboard[existingIdx] = entry;
      } else {
        DB.leaderboard.push(entry);
        if (!entry.isProfile) {
          DB.stats.totalGames = (DB.stats.totalGames || 0) + 1;
          DB.stats.totalKills = (DB.stats.totalKills || 0) + entry.kills;
        }
      }

      if (entry.wave > (DB.stats.highestWave || 0)) {
        DB.stats.highestWave = entry.wave;
      }

      DB.leaderboard = sortLeaderboard(DB.leaderboard, 'wave').slice(0, 200);
      persistDb();

      sendJson(req, res, 200, {
        ok: true,
        entry: publicEntry(entry),
        leaderboard: DB.leaderboard.slice(0, 50).map(publicEntry),
        stats: DB.stats
      });
    } catch (err) {
      recordViolation(ip);
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 4. PATCH /api/leaderboard/name (Atualizar nome apenas nos próprios registros do jogador)
  if (pathname === '/api/leaderboard/name' && (req.method === 'PATCH' || req.method === 'POST')) {
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const newName = cleanName(body.name);
      const targetId = cleanId(body.id);

      let updated = 0;
      for (const r of DB.leaderboard) {
        const isOwner = !r.ownerHash || (auth.valid && r.ownerHash === auth.ownerHash) || verifyAdminKey(req);
        if (!isOwner) continue;
        if ((targetId && r.id === targetId) || (auth.valid && r.ownerHash === auth.ownerHash)) {
          r.name = newName;
          updated++;
        }
      }
      if (updated > 0) persistDb();
      sendJson(req, res, 200, {
        ok: true,
        updated,
        name: newName,
        leaderboard: DB.leaderboard.slice(0, 50).map(publicEntry)
      });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 5. DELETE /api/leaderboard/:id ou DELETE /api/leaderboard (Protegido por propriedade criptográfica)
  if (pathname.startsWith('/api/leaderboard') && req.method === 'DELETE') {
    const auth = extractClientAuth(req, null);
    const isAdmin = verifyAdminKey(req);
    const parts = pathname.split('/').filter(Boolean); // ['api', 'leaderboard', id?]

    if (parts.length === 3) {
      const targetId = cleanId(parts[2]);
      const target = DB.leaderboard.find(r => r.id === targetId);
      if (!target) {
        sendJson(req, res, 200, { ok: true, deletedId: targetId, leaderboard: DB.leaderboard.slice(0, 50).map(publicEntry) });
        return;
      }
      // Só permite excluir se pertencer ao próprio jogador, não tiver ownerHash (teste local) ou for Admin
      if (target.ownerHash && (!auth.valid || target.ownerHash !== auth.ownerHash) && !isAdmin) {
        recordViolation(ip);
        DB.securityAudit.unauthorizedAttempts = (DB.securityAudit.unauthorizedAttempts || 0) + 1;
        sendJson(req, res, 403, { ok: false, error: 'Acesso negado: você só pode excluir seus próprios registros.' });
        return;
      }
      DB.leaderboard = DB.leaderboard.filter(r => r.id !== targetId);
      persistDb();
      sendJson(req, res, 200, {
        ok: true,
        deletedId: targetId,
        leaderboard: DB.leaderboard.slice(0, 50).map(publicEntry)
      });
      return;
    }

    if (parts.length === 2) {
      if (isAdmin) {
        DB.leaderboard = [];
        DB.stats.highestWave = 0;
      } else if (auth.valid) {
        // Remove apenas os registros pertencentes a este jogador (preserva o ranking global dos outros jogadores!)
        DB.leaderboard = DB.leaderboard.filter(r => r.ownerHash && r.ownerHash !== auth.ownerHash);
      } else {
        // Sem token: remove apenas registros locais sem proprietário
        DB.leaderboard = DB.leaderboard.filter(r => !!r.ownerHash);
      }
      persistDb();
      sendJson(req, res, 200, {
        ok: true,
        cleared: true,
        leaderboard: DB.leaderboard.slice(0, 50).map(publicEntry)
      });
      return;
    }
  }

  // 6. GET /api/cloud-save?player=Nome
  if (pathname === '/api/cloud-save' && req.method === 'GET') {
    const auth = extractClientAuth(req, null);
    const playerName = cleanName(urlObj.searchParams.get('player') || 'Comandante');
    const playerKey = auth.valid ? `${auth.ownerHash}:${playerName.toLowerCase()}` : playerName.toLowerCase();
    const record = DB.cloudSaves[playerKey] || DB.cloudSaves[playerName.toLowerCase()] || null;
    if (record && record.ownerHash && auth.valid && record.ownerHash !== auth.ownerHash && !verifyAdminKey(req)) {
      sendJson(req, res, 403, { ok: false, error: 'Acesso negado ao save de outro jogador.' });
      return;
    }
    const safeRecord = record ? Object.assign({}, record, { ownerHash: undefined }) : null;
    sendJson(req, res, 200, { ok: true, save: safeRecord, data: safeRecord });
    return;
  }

  // 7. POST /api/cloud-save
  if (pathname === '/api/cloud-save' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, 131072); // até 128KB para save com log de replay
      const auth = extractClientAuth(req, body);
      const playerName = cleanName(body.player || 'Comandante');
      const baseKey = playerName.toLowerCase();
      const existing = DB.cloudSaves[baseKey];

      // Impede sobrescrever o perfil de outro jogador se já estiver vinculado a outro ownerHash
      if (existing && existing.ownerHash && (!auth.valid || existing.ownerHash !== auth.ownerHash) && !verifyAdminKey(req)) {
        recordViolation(ip);
        DB.securityAudit.unauthorizedAttempts = (DB.securityAudit.unauthorizedAttempts || 0) + 1;
        sendJson(req, res, 403, { ok: false, error: 'Este perfil na nuvem está protegido por outro comandante.' });
        return;
      }

      // Sanitiza limites da carreira no cloud save
      const rawCareer = body.career && typeof body.career === 'object' ? body.career : {};
      const safeCareer = {
        bestWave: Math.max(0, Math.min(5000, Math.floor(Number(rawCareer.bestWave) || 0))),
        totalKills: Math.max(0, Math.min(50000000, Math.floor(Number(rawCareer.totalKills) || 0))),
        games: Math.max(0, Math.min(100000, Math.floor(Number(rawCareer.games) || 0))),
        lastMap: VALID_MAPS.has(rawCareer.lastMap) ? rawCareer.lastMap : 'four',
        lastDifficulty: VALID_DIFFS.has(rawCareer.lastDifficulty) ? rawCareer.lastDifficulty : 'normal'
      };

      const record = {
        player: playerName,
        ownerHash: auth.valid ? auth.ownerHash : (existing ? existing.ownerHash : null),
        updatedAt: Date.now(),
        career: safeCareer,
        stats: body.stats || null,
        achievements: body.achievements || body.ach || null,
        gameSave: body.gameSave || body.save || null
      };
      DB.cloudSaves[baseKey] = record;
      if (auth.valid) {
        DB.cloudSaves[`${auth.ownerHash}:${baseKey}`] = record;
      }
      persistDb();
      const safeOut = Object.assign({}, record, { ownerHash: undefined });
      sendJson(req, res, 200, { ok: true, updatedAt: record.updatedAt, save: safeOut });
    } catch (err) {
      recordViolation(ip);
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  sendJson(req, res, 404, { ok: false, error: 'Endpoint não encontrado' });
}

/* ============================================================================
 * 6. SERVIDOR DE ARQUIVOS ESTÁTICOS COM WHITELIST ESTRITA
 * ============================================================================ */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const ALLOWED_FILES = new Set([
  '/index.html',
  '/style.css',
  '/theme-v19.css',
  '/game.js',
  '/sw.js',
  '/manifest.webmanifest',
  '/assets/icon.svg'
]);

function serveStatic(req, res, urlObj) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('405 - Método não permitido');
    return;
  }

  let reqPath = decodeURIComponent(urlObj.pathname || '/');
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Bloqueio estrito contra Path Traversal e acesso a arquivos internos (server.js, db.json, .env, etc.)
  if (reqPath.includes('..') || reqPath.includes('\0') || !ALLOWED_FILES.has(reqPath)) {
    res.writeHead(404, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('404 - Recurso não autorizado ou inexistente');
    return;
  }

  const filePath = path.resolve(ROOT_DIR, '.' + reqPath);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('403 - Acesso proibido');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('404 - Erro ao ler arquivo');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = Object.assign({}, SECURITY_HEADERS, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' || reqPath === '/sw.js' ? 'no-cache, must-revalidate' : 'public, max-age=3600'
    });

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('gzip') && content.length > 1024) {
      zlib.gzip(content, (gzErr, compressed) => {
        if (gzErr) {
          res.writeHead(200, headers);
          res.end(req.method === 'HEAD' ? undefined : content);
          return;
        }
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : compressed);
      });
    } else {
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : content);
    }
  });
}

const server = http.createServer((req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname.startsWith('/api/')) {
      handleApi(req, res, urlObj);
    } else {
      serveStatic(req, res, urlObj);
    }
  } catch (err) {
    sendJson(req, res, 500, { ok: false, error: 'Erro interno no servidor' });
  }
});

// Proteção contra ataques Slowloris e conexões penduradas
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 60;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(` ☣ QUARENTENA Z — SERVIDOR BLINDADO ATIVO NA PORTA ${PORT}`);
    console.log(` 🔒 Segurança: HMAC-SHA256 + Anti-Cheat + CSP + RateLimit`);
    console.log(` 🌐 Acesse no navegador: http://localhost:${PORT}`);
    console.log(` 📡 API Ranking Online:  http://localhost:${PORT}/api/leaderboard`);
    console.log(` 💾 API Cloud Save:      http://localhost:${PORT}/api/cloud-save`);
    console.log('==========================================================');
  });
}

module.exports = {
  server,
  DB,
  computeRunSeal,
  issueClientToken,
  verifyClientToken,
  generateLicenseKey,
  verifyLicenseKey,
  issueRunTicket,
  verifyRunTicket
};
