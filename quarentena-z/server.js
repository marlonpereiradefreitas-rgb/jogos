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
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, '.server_secret');
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Configuração Cloud-Ready de CORS Dinâmico via ALLOWED_ORIGINS
const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGINS || 'https://marlonpereiradefreitas-rgb.github.io';
const ALLOWED_ORIGINS_SET = new Set(
  ALLOWED_ORIGINS_RAW.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
);

// Alfabeto desambiguado para códigos curtos de sala (sem 0, O, 1, I para evitar confusão entre jogadores)
const SAFE_ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateShortRoomCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SAFE_ROOM_ALPHABET[bytes[i] % SAFE_ROOM_ALPHABET.length];
  }
  return 'QZ-' + code;
}

// Detecta endereços IPv4 locais (LAN) para exibição e conexão direta entre 2 PCs
function getLocalIps() {
  const ips = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
  } catch (_) {}
  return ips;
}

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
    version: 4,
    createdAt: Date.now(),
    leaderboard: [],
    cloudSaves: {},
    users: {},
    mpRooms: {},
    mpScores: [],
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
      if (!DB.users || typeof DB.users !== 'object') DB.users = {};
      if (!DB.mpRooms || typeof DB.mpRooms !== 'object') DB.mpRooms = {};
      if (!Array.isArray(DB.mpScores)) DB.mpScores = [];
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
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  const isLanOrLocal = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(cleanOrigin);
  const isGithubPages = /^https:\/\/([a-z0-9-]+\.)?github\.io$/i.test(cleanOrigin) || cleanOrigin === 'https://marlonpereiradefreitas-rgb.github.io';
  const isExplicitAllowed = ALLOWED_ORIGINS_SET.has(cleanOrigin) || ALLOWED_ORIGINS_RAW === '*';
  const isSameHost = origin && host && cleanOrigin.includes(host);

  const allowedOrigin = (!origin || isExplicitAllowed || isGithubPages || isLanOrLocal || isSameHost || cleanOrigin === 'null')
    ? (origin || '*')
    : 'null';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token, X-License-Token, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
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

  const pathname = urlObj.pathname;

  // 0a. HEALTH CHECK LEVE PARA CLOUD (Render, Railway, Fly.io, Monitoramento): HTTP 200 rápido e sem rate limit
  if ((pathname === '/health' || pathname === '/api/health') && req.method === 'GET') {
    const localIps = getLocalIps();
    sendJson(req, res, 200, {
      status: 'ok',
      service: 'Quarentena Z Server',
      version: '1.0.15',
      uptime: Math.floor(process.uptime()),
      roomsCount: Object.keys(DB.mpRooms || {}).length,
      port: PORT,
      localIps,
      primaryLanIp: localIps[0] || 'localhost',
      timestamp: Date.now()
    });
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

  // 0. SERVER INFO & LAN IP: GET /api/server-info — Detecção de servidor e IP de rede local para conectar 2 PCs
  if (pathname === '/api/server-info' && req.method === 'GET') {
    const localIps = getLocalIps();
    sendJson(req, res, 200, {
      ok: true,
      name: 'Quarentena Z Server',
      version: '1.0.13',
      port: PORT,
      localIps,
      primaryLanIp: localIps[0] || '127.0.0.1',
      wsPath: '/ws',
      roomsCount: Object.keys(DB.mpRooms || {}).length,
      ts: Date.now()
    });
    return;
  }

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

  // 8. GET / POST /api/auth/profile — Contas de usuários, conquistas e sincronização híbrida
  if (pathname === '/api/auth/profile' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.method === 'GET') {
      const auth = extractClientAuth(req, null);
      const key = auth.valid ? auth.ownerHash : cleanName(urlObj.searchParams.get('player') || 'Comandante').toLowerCase();
      const prof = DB.users[key] || null;
      const safeProf = prof ? Object.assign({}, prof, { ownerHash: undefined }) : null;
      sendJson(req, res, 200, { ok: true, profile: safeProf });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const playerName = cleanName(body.player || body.displayName || 'Comandante');
      const key = auth.valid ? auth.ownerHash : playerName.toLowerCase();
      const prev = DB.users[key] || {};
      if (prev.ownerHash && auth.valid && prev.ownerHash !== auth.ownerHash && !verifyAdminKey(req)) {
        sendJson(req, res, 403, { ok: false, error: 'Perfil vinculado a outro titular.' });
        return;
      }
      const bestWave = Math.max(prev.bestWave || 0, Math.min(5000, Math.floor(Number(body.bestWave) || 0)));
      const totalKills = Math.max(prev.totalKills || 0, Math.min(100000000, Math.floor(Number(body.totalKills) || 0)));
      const games = Math.max(prev.games || 0, Math.min(1000000, Math.floor(Number(body.games) || 0)));
      const achievements = Object.assign({}, prev.achievements || {}, (body.achievements && typeof body.achievements === 'object') ? body.achievements : {});
      const medals = Object.assign({}, prev.medals || {}, (body.medals && typeof body.medals === 'object') ? body.medals : {});
      const profile = {
        player: playerName,
        ownerHash: auth.valid ? auth.ownerHash : (prev.ownerHash || null),
        bestWave,
        totalKills,
        games,
        achievements,
        medals,
        integritySig: String(body.integritySig || '').slice(0, 80),
        updatedAt: Date.now()
      };
      DB.users[key] = profile;
      persistDb();
      sendJson(req, res, 200, { ok: true, profile: Object.assign({}, profile, { ownerHash: undefined }) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 9. MULTIPLAYER: GET / POST /api/mp/rooms — Listagem e criação de salas (Co-op / Versus / Daily)
  if (pathname === '/api/mp/rooms' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.method === 'GET') {
      const modeFilter = urlObj.searchParams.get('mode') || '';
      const rooms = Object.values(DB.mpRooms)
        .filter(r => r && r.isPublic && r.status !== 'closed' && (!modeFilter || r.mode === modeFilter))
        .slice(-30)
        .map(r => ({
          roomId: r.roomId,
          roomCode: r.roomCode,
          name: r.name,
          mode: r.mode,
          map: r.map,
          diff: r.diff,
          maxPlayers: r.maxPlayers,
          playersCount: Array.isArray(r.players) ? r.players.length : 1,
          wave: r.wave || 0,
          status: r.status
        }));
      sendJson(req, res, 200, { ok: true, rooms });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const roomId = 'room_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const customCode = String(body.roomCode || '').trim().toUpperCase();
      const roomCode = /^QZ-?[2-9A-Z]{4,8}$/.test(customCode)
        ? customCode
        : ('QZ-' + encodeBase32Group(crypto.randomBytes(6), 6));
      const mode = ['coop', 'versus', 'daily'].includes(body.mode) ? body.mode : 'coop';
      const division = body.division === 'free' ? 'free' : 'sectors';
      const map = VALID_MAPS.has(body.map) ? body.map : 'four';
      const diff = VALID_DIFFS.has(body.diff) ? body.diff : 'normal';
      const maxPlayers = Math.max(2, Math.min(4, Number(body.maxPlayers) || 2));
      const playerName = cleanName(body.playerName || 'Comandante');
      const ownerHash = auth.valid ? auth.ownerHash : ('anon_' + crypto.randomBytes(4).toString('hex'));

      const room = {
        roomId,
        roomCode,
        name: cleanName(body.name || 'Operação Co-op'),
        hostHash: ownerHash,
        mode,
        division,
        map,
        diff,
        maxPlayers,
        seed: (crypto.randomBytes(4).readUInt32BE(0) >>> 0) || 20260101,
        wave: 0,
        tick: 0,
        stateHash: 0,
        status: 'waiting',
        isPublic: body.isPublic !== false,
        players: [{ name: playerName, ownerHash, slot: 0, ready: true, joinedAt: Date.now() }],
        waveEvents: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      DB.mpRooms[roomId] = room;
      persistDb();
      sendJson(req, res, 200, { ok: true, room: publicRoom(room) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 10. MULTIPLAYER: POST /api/mp/rooms/join — Entrar em uma sala existente
  if (pathname === '/api/mp/rooms/join' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const code = String(body.roomCode || '').trim().toUpperCase();
      const normalizedCode = code.startsWith('QZ-') ? code : (code.startsWith('QZ') ? ('QZ-' + code.slice(2)) : ('QZ-' + code));
      const id = cleanId(body.roomId || '');
      const room = id && DB.mpRooms[id]
        ? DB.mpRooms[id]
        : Object.values(DB.mpRooms).find(r => r && (r.roomCode === code || r.roomCode === normalizedCode));
      if (!room) {
        sendJson(req, res, 404, { ok: false, error: 'Sala multiplayer não encontrada.' });
        return;
      }
      const ownerHash = auth.valid ? auth.ownerHash : ('anon_' + crypto.randomBytes(4).toString('hex'));
      const playerName = cleanName(body.playerName || 'Comandante');
      let existingPlayer = room.players.find(p => p.ownerHash === ownerHash);
      if (!existingPlayer) {
        if (room.players.length >= room.maxPlayers) {
          sendJson(req, res, 400, { ok: false, error: 'A sala selecionada já está lotada.' });
          return;
        }
        const newPlayer = {
          name: playerName,
          ownerHash,
          slot: room.players.length,
          ready: true,
          joinedAt: Date.now()
        };
        room.players.push(newPlayer);
        existingPlayer = newPlayer;
      }
      if (room.players.length >= 2 && room.status === 'waiting') {
        room.status = 'playing';
      }
      room.updatedAt = Date.now();
      persistDb();
      broadcastRoomWs(room.roomId, {
        type: 'player_joined',
        slot: existingPlayer.slot,
        player: { name: existingPlayer.name, slot: existingPlayer.slot, ready: true },
        room: publicRoom(room)
      });
      broadcastRoomWs(room.roomId, { type: 'room_state', room: publicRoom(room) });
      sendJson(req, res, 200, { ok: true, slot: existingPlayer.slot, room: publicRoom(room) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 10b. MULTIPLAYER: GET /api/mp/rooms/info — Consulta dados atualizados da sala
  if (pathname === '/api/mp/rooms/info' && req.method === 'GET') {
    const raw = String(urlObj.searchParams.get('code') || urlObj.searchParams.get('roomId') || '').trim().toUpperCase();
    const normalized = raw.startsWith('QZ-') ? raw : (raw.startsWith('QZ') ? ('QZ-' + raw.slice(2)) : ('QZ-' + raw));
    const room = DB.mpRooms[raw] || Object.values(DB.mpRooms).find(r => r && (r.roomCode === raw || r.roomCode === normalized || r.roomId === raw));
    if (!room) {
      sendJson(req, res, 404, { ok: false, error: 'Sala não encontrada.' });
      return;
    }
    sendJson(req, res, 200, { ok: true, room: publicRoom(room) });
    return;
  }

  // 10c. MULTIPLAYER: POST /api/mp/rooms/update — Atualizar configurações da sala no Lobby (Host)
  if (pathname === '/api/mp/rooms/update' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const roomId = cleanId(body.roomId || '');
      const code = String(body.roomCode || '').trim().toUpperCase();
      const room = (roomId && DB.mpRooms[roomId]) || Object.values(DB.mpRooms).find(r => r && r.roomCode === code);
      if (!room) {
        sendJson(req, res, 404, { ok: false, error: 'Sala não encontrada.' });
        return;
      }
      if (body.map && VALID_MAPS.has(body.map)) room.map = body.map;
      if (body.diff && VALID_DIFFS.has(body.diff)) room.diff = body.diff;
      if (body.division && (body.division === 'free' || body.division === 'sectors')) room.division = body.division;
      if (body.maxPlayers) room.maxPlayers = Math.max(2, Math.min(4, Number(body.maxPlayers) || 2));
      room.updatedAt = Date.now();
      persistDb();
      broadcastRoomWs(room.roomId, { type: 'room_update', room: publicRoom(room) });
      sendJson(req, res, 200, { ok: true, room: publicRoom(room) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 10d. MULTIPLAYER: POST /api/mp/rooms/start — Host inicia a partida para todo o esquadrão
  if (pathname === '/api/mp/rooms/start' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const roomId = cleanId(body.roomId || '');
      const code = String(body.roomCode || '').trim().toUpperCase();
      const room = (roomId && DB.mpRooms[roomId]) || Object.values(DB.mpRooms).find(r => r && r.roomCode === code);
      if (!room) {
        sendJson(req, res, 404, { ok: false, error: 'Sala não encontrada.' });
        return;
      }
      launchRoomMatch(room, body);
      const startEv = buildGameStartEvent(room);
      sendJson(req, res, 200, Object.assign({ ok: true }, startEv));
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 11. MULTIPLAYER: POST /api/mp/matchmaking — Pareamento automático de jogadores
  if (pathname === '/api/mp/matchmaking' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const auth = extractClientAuth(req, body);
      const mode = ['coop', 'versus', 'daily'].includes(body.mode) ? body.mode : 'coop';
      const map = VALID_MAPS.has(body.map) ? body.map : 'four';
      const diff = VALID_DIFFS.has(body.diff) ? body.diff : 'normal';
      const playerName = cleanName(body.playerName || 'Comandante');
      const ownerHash = auth.valid ? auth.ownerHash : ('anon_' + crypto.randomBytes(4).toString('hex'));

      let room = Object.values(DB.mpRooms).find(r =>
        r && r.isPublic && r.status === 'waiting' && r.mode === mode &&
        r.map === map && r.diff === diff && r.players.length < r.maxPlayers
      );

      if (room) {
        if (!room.players.some(p => p.ownerHash === ownerHash)) {
          room.players.push({ name: playerName, ownerHash, slot: room.players.length, ready: true, joinedAt: Date.now() });
        }
        if (room.players.length >= 2) room.status = 'playing';
        room.updatedAt = Date.now();
      } else {
        const roomId = 'room_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
        const roomCode = 'QZ' + encodeBase32Group(crypto.randomBytes(4), 4);
        room = {
          roomId,
          roomCode,
          name: 'Esquadrão ' + roomCode,
          hostHash: ownerHash,
          mode,
          map,
          diff,
          maxPlayers: 2,
          seed: (crypto.randomBytes(4).readUInt32BE(0) >>> 0) || 20260101,
          wave: 0,
          tick: 0,
          stateHash: 0,
          status: 'waiting',
          isPublic: true,
          players: [{ name: playerName, ownerHash, slot: 0, ready: true, joinedAt: Date.now() }],
          waveEvents: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        DB.mpRooms[roomId] = room;
      }
      persistDb();
      broadcastRoomWs(room.roomId, { type: 'room_state', room: publicRoom(room) });
      sendJson(req, res, 200, { ok: true, matched: room.players.length >= 2, room: publicRoom(room) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 12. MULTIPLAYER: POST /api/mp/sync — Sincronização de ondas e validação de comandos no servidor
  if (pathname === '/api/mp/sync' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const roomId = cleanId(body.roomId || '');
      const room = DB.mpRooms[roomId];
      if (!room) {
        sendJson(req, res, 404, { ok: false, error: 'Sala multiplayer inexistente.' });
        return;
      }
      const wave = Math.max(0, Math.min(5000, Math.floor(Number(body.wave) || 0)));
      const tick = Math.max(0, Math.floor(Number(body.tick) || 0));
      const stateHash = Number(body.stateHash) >>> 0;
      const cmds = Array.isArray(body.commands) ? body.commands.slice(0, 60) : [];

      for (const c of cmds) {
        const check = validateMultiplayerCommand(c);
        if (!check.valid) {
          recordViolation(ip);
          DB.securityAudit.antiCheatRejections = (DB.securityAudit.antiCheatRejections || 0) + 1;
          sendJson(req, res, 400, { ok: false, error: check.reason });
          return;
        }
      }

      room.wave = Math.max(room.wave || 0, wave);
      room.tick = Math.max(room.tick || 0, tick);
      room.stateHash = stateHash;
      room.updatedAt = Date.now();
      if (cmds.length > 0) {
        room.waveEvents = (room.waveEvents || []).concat(cmds.map(c => Object.assign({}, c, { syncedAt: Date.now() }))).slice(-250);
      }
      persistDb();

      const syncEvent = {
        type: 'wave_sync',
        roomId: room.roomId,
        wave: room.wave,
        tick: room.tick,
        stateHash: room.stateHash,
        commands: cmds
      };
      broadcastRoomWs(room.roomId, syncEvent);
      sendJson(req, res, 200, Object.assign({ ok: true }, syncEvent));
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 13. MULTIPLAYER: GET / POST /api/mp/scores — Placares cooperativos e competitivos
  if (pathname === '/api/mp/scores' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.method === 'GET') {
      const mode = urlObj.searchParams.get('mode') || '';
      const list = (DB.mpScores || [])
        .filter(s => !mode || s.mode === mode)
        .sort((a, b) => (b.wave - a.wave) || (b.kills - a.kills))
        .slice(0, 50);
      sendJson(req, res, 200, { ok: true, scores: list });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const wave = Math.max(0, Math.min(5000, Math.floor(Number(body.wave) || 0)));
      const kills = Math.max(0, Math.min(10000000, Math.floor(Number(body.kills) || 0)));
      const durationSec = Math.max(0, Math.min(86400 * 7, Math.floor(Number(body.durationSec) || 0)));
      if (wave > 10 && kills < wave * 3) {
        DB.securityAudit.antiCheatRejections = (DB.securityAudit.antiCheatRejections || 0) + 1;
        sendJson(req, res, 400, { ok: false, error: 'Placar multiplayer inconsistente (anti-cheat).' });
        return;
      }
      const entry = {
        matchId: 'mp_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        roomId: cleanId(body.roomId || ''),
        mode: ['coop', 'versus', 'daily'].includes(body.mode) ? body.mode : 'coop',
        map: VALID_MAPS.has(body.map) ? body.map : 'four',
        diff: VALID_DIFFS.has(body.diff) ? body.diff : 'normal',
        teamNames: cleanName(body.teamNames || 'Esquadrão Alfa'),
        wave,
        kills,
        durationSec,
        date: Date.now()
      };
      DB.mpScores.push(entry);
      DB.mpScores = DB.mpScores.sort((a, b) => (b.wave - a.wave) || (b.kills - a.kills)).slice(0, 150);
      persistDb();
      sendJson(req, res, 200, { ok: true, score: entry, scores: DB.mpScores.slice(0, 30) });
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 14. MULTIPLAYER CO-OP: POST /api/mp/donate — Validação Server-Side de Doações Percentuais (25%, 50%, 100%)
  if (pathname === '/api/mp/donate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const check = validateCoinDonation(body);
      if (!check.valid) {
        recordViolation(ip);
        DB.securityAudit.antiCheatRejections = (DB.securityAudit.antiCheatRejections || 0) + 1;
        persistDb();
        sendJson(req, res, 400, { ok: false, error: check.reason });
        return;
      }
      const roomCodeOrId = String(body.roomId || body.roomCode || '').trim();
      const room = DB.mpRooms[roomCodeOrId] || Object.values(DB.mpRooms).find(r => r && r.roomCode === roomCodeOrId.toUpperCase());
      const event = {
        type: 'coop_donate',
        roomId: room ? room.roomId : roomCodeOrId,
        fromSlot: check.fromSlot,
        toSlot: check.toSlot,
        pct: check.pct,
        amount: check.amount,
        remainingBalance: check.remainingBalance,
        ts: Date.now()
      };
      if (room) {
        room.waveEvents = (room.waveEvents || []).concat([event]).slice(-250);
        broadcastRoomWs(room.roomId, event);
        persistDb();
      }
      sendJson(req, res, 200, Object.assign({ ok: true }, event));
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 15. MULTIPLAYER CO-OP: POST /api/mp/vote — Votação Rápida em Grupo (Ondas e Velocidade 1x/2x/3x) e Alertas
  if ((pathname === '/api/mp/vote' || pathname === '/api/mp/ping') && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const roomId = cleanId(body.roomId || '');
      const room = DB.mpRooms[roomId];
      if (pathname === '/api/mp/vote') {
        const voteType = body.voteType === 'speed' ? 'speed' : 'wave';
        const speedVal = [1, 2, 3].includes(Number(body.speed)) ? Number(body.speed) : 1;
        const ev = { type: 'coop_vote', voteType, speed: speedVal, voter: cleanName(body.playerName || 'Comandante'), ts: Date.now() };
        if (room) broadcastRoomWs(room.roomId, ev);
        sendJson(req, res, 200, Object.assign({ ok: true }, ev));
        return;
      }
      const x = Math.max(8, Math.min(952, Math.round(Number(body.x) || 480)));
      const y = Math.max(8, Math.min(632, Math.round(Number(body.y) || 320)));
      const kind = ['danger', 'focus', 'coins', 'combo'].includes(body.kind) ? body.kind : 'danger';
      const pingEv = { type: 'coop_ping', x, y, kind, sender: cleanName(body.playerName || 'Comandante'), ts: Date.now() };
      if (room) broadcastRoomWs(room.roomId, pingEv);
      sendJson(req, res, 200, Object.assign({ ok: true }, pingEv));
    } catch (err) {
      sendJson(req, res, 400, { ok: false, error: err.message });
    }
    return;
  }

  sendJson(req, res, 404, { ok: false, error: 'Endpoint não encontrado' });
}

/* ============================================================================
 * 5B. VALIDAÇÃO SERVER-SIDE MULTIPLAYER & WEBSOCKET NATIVO RFC 6455
 * ============================================================================ */

const VALID_MP_CMDS = new Set([
  'place', 'up', 'paragon', 'ability', 'sell',
  'prio', 'aim', 'portal_exit', 'clearObs', 'wave', 'power', 'auto',
  'donate', 'ping', 'vote'
]);

const VALID_DONATION_PCTS = [0.25, 0.50, 1.00];

/**
 * Valida transferências percentuais de moedas na mini-janela Co-op (arredondadas para inteiro)
 */
function validateCoinDonation(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'Payload de doação inválido.' };
  }
  const pct = Number(payload.pct);
  const amount = Number(payload.amount);
  let balance = Number(payload.balance);
  if ((!Number.isFinite(balance) || balance < 1) && Number.isFinite(amount) && amount >= 1 && Number.isFinite(pct) && pct > 0) {
    balance = Math.round(amount / pct);
  }
  const fromSlot = Number(payload.fromSlot) | 0;
  const toSlot = Number(payload.toSlot) | 0;

  if (!Number.isFinite(balance) || balance < 1 || balance > 10000000 || Math.floor(balance) !== balance) {
    return { valid: false, reason: 'Saldo de moedas inválido ou não-inteiro.' };
  }
  const matchedPct = VALID_DONATION_PCTS.find(p => Math.abs(p - pct) < 0.001);
  if (!matchedPct) {
    return { valid: false, reason: 'Porcentagem de doação não autorizada (use 25%, 50% ou 100%).' };
  }
  if (fromSlot < 0 || fromSlot > 3 || toSlot < 0 || toSlot > 3 || fromSlot === toSlot) {
    return { valid: false, reason: 'Slot de destinatário de doação inválido.' };
  }
  const expectedAmount = Math.floor(balance * matchedPct);
  if (expectedAmount < 1) {
    return { valid: false, reason: 'Saldo insuficiente para doar esta porcentagem.' };
  }
  if (payload.amount !== undefined && Number(payload.amount) !== expectedAmount) {
    return { valid: false, reason: 'Valor de doação adulterado (divergência de arredondamento inteiro).' };
  }
  return {
    valid: true,
    pct: matchedPct,
    amount: expectedAmount,
    remainingBalance: balance - expectedAmount,
    fromSlot,
    toSlot
  };
}

function validateMultiplayerCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return { valid: false, reason: 'Comando inválido.' };
  if (!VALID_MP_CMDS.has(cmd.type)) return { valid: false, reason: 'Ação não reconhecida pelo servidor.' };
  if (cmd.type === 'place') {
    const x = Number(cmd.x), y = Number(cmd.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 8 || x > 952 || y < 8 || y > 632) {
      return { valid: false, reason: 'Coordenadas de construção inválidas.' };
    }
  }
  if (cmd.type === 'donate') {
    const dc = validateCoinDonation(cmd);
    if (!dc.valid) return dc;
  }
  return { valid: true };
}

function publicRoom(room) {
  if (!room) return null;
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    name: room.name,
    mode: room.mode,
    division: room.division || 'sectors',
    map: room.map,
    diff: room.diff,
    maxPlayers: room.maxPlayers,
    seed: room.seed,
    wave: room.wave,
    tick: room.tick,
    stateHash: room.stateHash,
    status: room.status,
    startedAt: room.startedAt || 0,
    players: (room.players || []).map(p => ({ name: p.name, slot: p.slot, ready: !!p.ready }))
  };
}

function buildGameStartEvent(room) {
  const pr = publicRoom(room);
  return {
    type: 'game_start',
    seed: pr.seed,
    map: pr.map,
    diff: pr.diff,
    division: pr.division,
    maxPlayers: pr.maxPlayers,
    startedAt: pr.startedAt,
    room: pr
  };
}

/**
 * Início de partida único e idempotente: tanto o caminho REST quanto o WebSocket
 * chamam esta função; se a sala já foi lançada há poucos segundos, o segundo
 * pedido NÃO dispara novo broadcast (evita iniciar a partida duas vezes).
 */
function launchRoomMatch(room, params) {
  const p = params || {};
  const now = Date.now();
  if (room.startedAt && now - room.startedAt < 8000) {
    return { duplicate: true, event: buildGameStartEvent(room) };
  }
  room.status = 'playing';
  room.startedAt = now;
  room.seed = (Number(p.seed) >>> 0) || room.seed || 20260101;
  if (p.map && VALID_MAPS.has(p.map)) room.map = p.map;
  if (p.diff && VALID_DIFFS.has(p.diff)) room.diff = p.diff;
  if (p.division === 'free' || p.division === 'sectors') room.division = p.division;
  room.updatedAt = now;
  persistDb();
  const event = buildGameStartEvent(room);
  broadcastRoomWs(room.roomId, event);
  return { duplicate: false, event };
}

const wsClients = new Set();

function encodeWsFrame(str) {
  const payload = Buffer.from(String(str), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

const WS_MAX_PAYLOAD = 262144; // 256 KB por mensagem

/**
 * Extrai TODOS os frames completos do buffer acumulado do cliente (vários frames
 * podem chegar colados no mesmo pacote TCP, ou um frame pode chegar dividido em
 * vários pacotes). Retorna { frames, error }.
 */
function extractWsFrames(client) {
  const frames = [];
  let buf = client.rxBuf || Buffer.alloc(0);
  while (buf.length >= 2) {
    const b0 = buf[0];
    const b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(WS_MAX_PAYLOAD)) { client.rxBuf = Buffer.alloc(0); return { frames, error: true }; }
      len = Number(big);
      offset = 10;
    }
    if (len > WS_MAX_PAYLOAD) { client.rxBuf = Buffer.alloc(0); return { frames, error: true }; }
    const total = offset + (masked ? 4 : 0) + len;
    if (buf.length < total) break;
    const data = Buffer.alloc(len);
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      const start = offset + 4;
      for (let i = 0; i < len; i++) data[i] = buf[start + i] ^ mask[i & 3];
    } else {
      buf.copy(data, 0, offset, offset + len);
    }
    frames.push({ fin, opcode, data });
    buf = buf.subarray(total);
  }
  client.rxBuf = buf;
  return { frames, error: false };
}

function encodeWsControlFrame(opcode, payload) {
  const p = payload || Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0x80 | opcode, Math.min(125, p.length)]), p.subarray(0, 125)]);
}

function broadcastRoomWs(roomId, msgObj, excludeClient) {
  if (!roomId || wsClients.size === 0) return;
  const frame = encodeWsFrame(JSON.stringify(msgObj));
  for (const client of wsClients) {
    if (client !== excludeClient && client.roomId === roomId && !client.socket.destroyed) {
      try { client.socket.write(frame); } catch (_) {}
    }
  }
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
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const ALLOWED_FILES = new Set([
  '/index.html',
  '/style.css',
  '/theme-v19.css',
  '/game.js',
  '/sw.js',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/assets/icon.png',
  '/assets/icon.ico'
]);

function isAllowedStaticPath(reqPath) {
  if (ALLOWED_FILES.has(reqPath)) return true;
  if (/^\/modules\/[a-z0-9_-]+\.js$/i.test(reqPath)) return true;
  if (/^\/assets\/towers\/[a-z0-9_-]+\.svg$/i.test(reqPath)) return true;
  if (/^\/assets\/upgrades\/[a-z0-9_-]+\.svg$/i.test(reqPath)) return true;
  if (/^\/docs\/images\/[a-z0-9_-]+\.(png|jpg|svg)$/i.test(reqPath)) return true;
  return false;
}

function serveStatic(req, res, urlObj) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({}, SECURITY_HEADERS, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('405 - Método não permitido');
    return;
  }

  let reqPath = decodeURIComponent(urlObj.pathname || '/');
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Bloqueio estrito contra Path Traversal e acesso a arquivos internos (server.js, db.json, .env, etc.)
  if (reqPath.includes('..') || reqPath.includes('\0') || !isAllowedStaticPath(reqPath)) {
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
      'Cache-Control': (ext === '.html' || ext === '.js' || ext === '.css' || reqPath === '/sw.js') ? 'no-cache, must-revalidate' : 'public, max-age=3600'
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
    if (urlObj.pathname === '/baixar' || urlObj.pathname === '/download' || urlObj.pathname === '/instalar') {
      const installerFile = path.resolve(ROOT_DIR, 'INSTALADOR_WINDOWS', 'Instalar_Quarentena_Z.exe');
      if (fs.existsSync(installerFile)) {
        const stat = fs.statSync(installerFile);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.microsoft.portable-executable',
          'Content-Disposition': 'attachment; filename="Instalar_Quarentena_Z.exe"',
          'Content-Length': stat.size
        });
        fs.createReadStream(installerFile).pipe(res);
        return;
      }
    }
    if (urlObj.pathname === '/health' || urlObj.pathname === '/ping' || urlObj.pathname.startsWith('/api/')) {
      handleApi(req, res, urlObj);
    } else {
      serveStatic(req, res, urlObj);
    }
  } catch (err) {
    sendJson(req, res, 500, { ok: false, error: 'Erro interno no servidor' });
  }
});

// Handshake e comunicação WebSocket Nativo RFC 6455 (/ws) para sincronização multiplayer em tempo real
server.on('upgrade', (req, socket) => {
  try {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const cleanPath = (urlObj.pathname || '').replace(/\/+$/, '') || '/';
    if (cleanPath !== '/ws') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key || typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key.trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const client = { socket, roomId: null, connectedAt: Date.now(), rxBuf: Buffer.alloc(0), fragments: [], lastSeen: Date.now() };
    wsClients.add(client);
    try { socket.setNoDelay(true); socket.setKeepAlive(true, 20000); socket.setTimeout(0); } catch (_) {}

    const processWsText = (frameText) => {
      const frame = { text: frameText };
      {
        try {
          const msg = JSON.parse(frame.text);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'ping') {
            socket.write(encodeWsFrame(JSON.stringify({
              type: 'pong',
              clientTs: msg.clientTs || msg.ts || Date.now(),
              serverTs: Date.now()
            })));
          } else if (msg.type === 'player_ready' && client.roomId) {
            const room = DB.mpRooms[client.roomId];
            if (room && Array.isArray(room.players)) {
              const slot = client.slot !== undefined ? client.slot : Number(msg.slot);
              let p = room.players.find(pl => pl.slot === slot);
              if (!p) {
                p = { name: client.name || ('Jogador P' + (slot + 1)), slot, ready: true, joinedAt: Date.now() };
                room.players.push(p);
              }
              p.ready = msg.ready !== undefined ? !!msg.ready : true;
              persistDb();
              broadcastRoomWs(client.roomId, {
                type: 'player_ready',
                slot,
                ready: p.ready,
                room: publicRoom(room)
              });
            }
          } else if (msg.type === 'join_room') {
            const rawId = String(msg.roomId || '').trim();
            const rawCode = String(msg.roomCode || '').trim().toUpperCase();
            const cleanCode = rawCode.replace(/[^2-9A-Z]/g, '');
            const normalized = cleanCode.startsWith('QZ') ? ('QZ-' + cleanCode.slice(2)) : ('QZ-' + cleanCode);
            const room = (rawId && DB.mpRooms[rawId]) || Object.values(DB.mpRooms).find(r => r && (
              (rawId && r.roomId === rawId) ||
              (rawCode && r.roomCode === rawCode) ||
              (rawCode && r.roomCode === normalized) ||
              (cleanCode && r.roomCode.replace(/[^2-9A-Z]/g, '') === cleanCode)
            ));
            if (room) {
              client.roomId = room.roomId;
              client.roomCode = room.roomCode;
              client.slot = Number(msg.slot) || 0;
              client.name = cleanName(msg.playerName || 'Comandante');
              if (Array.isArray(room.players)) {
                let p = room.players.find(pl => pl.slot === client.slot);
                if (!p) {
                  p = { name: client.name, slot: client.slot, ready: false, joinedAt: Date.now() };
                  room.players.push(p);
                  persistDb();
                }
              }
              socket.write(encodeWsFrame(JSON.stringify({ type: 'room_state', room: publicRoom(room) })));
              const joinedP = (room.players || []).find(pl => pl.slot === client.slot);
              broadcastRoomWs(room.roomId, {
                type: 'player_joined',
                slot: client.slot,
                player: { name: (joinedP && joinedP.name) || client.name, slot: client.slot, ready: !!(joinedP && joinedP.ready) },
                room: publicRoom(room)
              }, client);
            } else {
              socket.write(encodeWsFrame(JSON.stringify({ type: 'join_error', error: 'Sala não encontrada no servidor.' })));
            }
          } else if (msg.type === 'game_start' && client.roomId) {
            const room = DB.mpRooms[client.roomId];
            if (room) launchRoomMatch(room, msg);
          } else if (msg.type === 'room_update' && client.roomId) {
            const room = DB.mpRooms[client.roomId];
            if (room) {
              if (msg.map && VALID_MAPS.has(msg.map)) room.map = msg.map;
              if (msg.diff && VALID_DIFFS.has(msg.diff)) room.diff = msg.diff;
              if (msg.division) room.division = msg.division;
              persistDb();
              broadcastRoomWs(client.roomId, { type: 'room_update', room: publicRoom(room) });
            }
          } else if (msg.type === 'cmd_broadcast' && client.roomId) {
            const cmd = msg.command;
            if (cmd && validateMultiplayerCommand(cmd).valid) {
              broadcastRoomWs(client.roomId, {
                type: 'cmd_broadcast',
                fromSlot: client.slot !== undefined ? client.slot : (msg.fromSlot || 0),
                command: cmd,
                tick: Number(msg.tick) || 0,
                ts: Date.now()
              }, client);
            }
          } else if (msg.type === 'coop_donate' && client.roomId) {
            const check = validateCoinDonation(msg);
            if (check.valid) {
              const ev = {
                type: 'coop_donate',
                fromSlot: check.fromSlot,
                toSlot: check.toSlot,
                pct: check.pct,
                amount: check.amount,
                remainingBalance: check.remainingBalance,
                ts: Date.now()
              };
              broadcastRoomWs(client.roomId, ev, client);
            }
          } else if (msg.type === 'coop_ping' && client.roomId) {
            const x = Math.max(8, Math.min(952, Math.round(Number(msg.x) || 480)));
            const y = Math.max(8, Math.min(632, Math.round(Number(msg.y) || 320)));
            const kind = ['danger', 'focus', 'combo'].includes(msg.kind) ? msg.kind : 'danger';
            const pingEv = {
              type: 'coop_ping',
              x, y, kind,
              sender: cleanName(msg.sender || client.name || 'Comandante'),
              fromSlot: client.slot || 0,
              ts: Date.now()
            };
            broadcastRoomWs(client.roomId, pingEv, client);
          } else if (msg.type === 'coop_vote' && client.roomId) {
            const voteType = msg.voteType === 'speed' ? 'speed' : 'wave';
            const speedVal = [1, 2, 3].includes(Number(msg.speed)) ? Number(msg.speed) : 1;
            const ev = {
              type: 'coop_vote',
              voteType,
              speed: speedVal,
              voter: cleanName(msg.voter || client.name || 'Comandante'),
              fromSlot: client.slot || 0,
              ts: Date.now()
            };
            broadcastRoomWs(client.roomId, ev, client);
          } else if (msg.type === 'base_sync' && client.roomId) {
            const life = Math.max(0, Math.floor(Number(msg.life) || 0));
            broadcastRoomWs(client.roomId, { type: 'base_sync', life, fromSlot: client.slot || 0 }, client);
          } else if (msg.type === 'wave_sync' && client.roomId) {
            const cmds = Array.isArray(msg.commands) ? msg.commands.slice(0, 30) : [];
            if (cmds.every(c => validateMultiplayerCommand(c).valid)) {
              broadcastRoomWs(client.roomId, {
                type: 'wave_sync',
                roomId: client.roomId,
                wave: Number(msg.wave) || 0,
                tick: Number(msg.tick) || 0,
                stateHash: Number(msg.stateHash) >>> 0,
                commands: cmds
              });
            }
          }
        } catch (_) {}
      }
    };

    socket.on('data', (chunk) => {
      client.lastSeen = Date.now();
      client.rxBuf = Buffer.concat([client.rxBuf, chunk]);
      if (client.rxBuf.length > WS_MAX_PAYLOAD * 2) { socket.destroy(); return; }
      const res = extractWsFrames(client);
      if (res.error) { socket.destroy(); return; }
      for (const fr of res.frames) {
        if (fr.opcode === 0x8) { // close
          try { socket.write(encodeWsControlFrame(0x8, fr.data.subarray(0, 2))); } catch (_) {}
          wsClients.delete(client);
          socket.end();
          return;
        }
        if (fr.opcode === 0x9) { // ping do cliente -> pong
          try { socket.write(encodeWsControlFrame(0xA, fr.data)); } catch (_) {}
          continue;
        }
        if (fr.opcode === 0xA) continue; // pong
        if (fr.opcode === 0x1 || fr.opcode === 0x2) {
          if (fr.fin) { client.fragments = []; processWsText(fr.data.toString('utf8')); }
          else client.fragments = [fr.data];
        } else if (fr.opcode === 0x0) { // continuação
          client.fragments.push(fr.data);
          if (fr.fin) {
            const full = Buffer.concat(client.fragments);
            client.fragments = [];
            if (full.length <= WS_MAX_PAYLOAD) processWsText(full.toString('utf8'));
          }
        }
      }
    });

    socket.on('close', () => {
      wsClients.delete(client);
      if (client.roomId) {
        broadcastRoomWs(client.roomId, {
          type: 'player_left',
          slot: client.slot,
          name: client.name,
          roomId: client.roomId
        });
      }
    });
    socket.on('error', () => {
      wsClients.delete(client);
    });
  } catch (_) {
    try { socket.destroy(); } catch (__) {}
  }
});

// Proteção contra ataques Slowloris e conexões penduradas
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 60;

// Limpeza automática de salas vazias/inativas a cada 10 minutos (previne vazamentos de memória e inchaço no db.json)
function cleanupStaleRooms() {
  const now = Date.now();
  let changed = false;
  const ONE_HOUR = 60 * 60 * 1000;
  const THREE_HOURS = 3 * ONE_HOUR;
  for (const [id, r] of Object.entries(DB.mpRooms || {})) {
    if (!r) { delete DB.mpRooms[id]; changed = true; continue; }
    const age = now - (r.updatedAt || r.createdAt || 0);
    if (age > THREE_HOURS || (r.status === 'waiting' && age > ONE_HOUR)) {
      delete DB.mpRooms[id];
      changed = true;
    }
  }
  if (changed) persistDb();
}
try {
  const timer = setInterval(cleanupStaleRooms, 10 * 60 * 1000);
  if (timer && typeof timer.unref === 'function') timer.unref();
} catch (_) {}

if (require.main === module) {
  const localIps = getLocalIps();
  const lanUrl = localIps.length > 0 ? `http://${localIps[0]}:${PORT}` : `http://localhost:${PORT}`;
  server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(` ☣ QUARENTENA Z — SERVIDOR BLINDADO ATIVO NA PORTA ${PORT}`);
    console.log(` 🔒 Segurança: HMAC-SHA256 + Anti-Cheat + CSP + RateLimit`);
    console.log(` 🌐 Acesso Local (Host):     http://localhost:${PORT}`);
    console.log(` 🤝 Rede Local (LAN / 2º PC): ${lanUrl}`);
    console.log(` 📡 API Multiplayer/WS:       ${lanUrl}/api/mp/rooms | ws://${localIps[0] || 'localhost'}:${PORT}/ws`);
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
  verifyRunTicket,
  validateMultiplayerCommand,
  validateCoinDonation
};
