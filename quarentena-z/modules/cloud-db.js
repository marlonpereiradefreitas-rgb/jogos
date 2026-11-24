// ============================================================================
// QUARENTENA Z — ARQUITETURA DE BANCO DE DADOS EM NUVEM E SINCRONIZAÇÃO HÍBRIDA
// Suporte nativo para:
//  1. Supabase (PostgREST / RLS / Realtime)
//  2. Firebase (Firestore / Realtime Database REST)
//  3. Quarentena Z Cloud Server (/api/*)
//  4. Fila Offline-First (PWA) com Sincronização Híbrida Automática
// ============================================================================
(function (root) {
  'use strict';

  const SYNC_QUEUE_KEY = 'quarentenaz_hybrid_sync_queue_v1';
  const MAX_QUEUE_ITEMS = 60;

  const config = {
    provider: 'auto', // 'supabase' | 'firebase' | 'native' | 'auto'
    supabaseUrl: '',
    supabaseAnonKey: '',
    firebaseDatabaseUrl: '',
    firebaseApiKey: '',
    apiBaseUrl: '',
    clientToken: null,
    licenseToken: null
  };

  let isFlushing = false;
  let lastSyncAt = 0;

  function isBrowserOnline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
    return typeof root.fetch === 'function';
  }

  function getActiveProvider() {
    if (config.provider && config.provider !== 'auto') return config.provider;
    if (config.supabaseUrl && config.supabaseAnonKey) return 'supabase';
    if (config.firebaseDatabaseUrl) return 'firebase';
    return 'native';
  }

  function loadOfflineQueue() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(SYNC_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveOfflineQueue(list) {
    try {
      if (typeof localStorage === 'undefined') return;
      const trimmed = Array.isArray(list) ? list.slice(-MAX_QUEUE_ITEMS) : [];
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(trimmed));
    } catch (_) {}
  }

  function enqueueOfflineAction(actionType, payload) {
    const queue = loadOfflineQueue();
    const sig = root.QZ_SECURITY
      ? root.QZ_SECURITY.computeDigitalSignature('hybrid_queue:' + actionType, payload)
      : 'nosig';
    // Evita duplicar cloud_save se já houver um na fila: substitui pelo mais recente
    if (actionType === 'cloud_save' || actionType === 'profile_sync') {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].type === actionType) queue.splice(i, 1);
      }
    }
    queue.push({
      id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      type: actionType,
      payload,
      sig,
      queuedAt: Date.now()
    });
    saveOfflineQueue(queue);
    return queue.length;
  }

  // --- Requisições para Supabase REST (PostgREST), Firebase REST ou Native Server ---
  async function requestSupabase(table, method, queryOrBody) {
    if (!config.supabaseUrl || !config.supabaseAnonKey || !isBrowserOnline()) return null;
    const base = config.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/' + table;
    const url = method === 'GET' && typeof queryOrBody === 'string' ? base + '?' + queryOrBody : base;
    const headers = {
      'apikey': config.supabaseAnonKey,
      'Authorization': 'Bearer ' + config.supabaseAnonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates'
    };
    try {
      const res = await root.fetch(url, {
        method,
        headers,
        body: method !== 'GET' && queryOrBody ? JSON.stringify(queryOrBody) : undefined
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function requestFirebase(pathStr, method, body) {
    if (!config.firebaseDatabaseUrl || !isBrowserOnline()) return null;
    const base = config.firebaseDatabaseUrl.replace(/\/+$/, '') + '/' + pathStr.replace(/^\/+/, '') + '.json';
    const url = config.firebaseApiKey ? base + '?key=' + encodeURIComponent(config.firebaseApiKey) : base;
    try {
      const res = await root.fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' && body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function requestNative(endpoint, method, body, customTokens) {
    if (!isBrowserOnline()) return null;
    const headers = { 'Content-Type': 'application/json' };
    const tk = (customTokens && customTokens.clientToken) || config.clientToken;
    const ltk = (customTokens && customTokens.licenseToken) || config.licenseToken;
    if (tk) headers['X-Client-Token'] = tk;
    if (ltk) headers['X-License-Token'] = ltk;
    try {
      const res = await root.fetch((config.apiBaseUrl || '') + endpoint, {
        method: method || 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  // --- Operações Unificadas de Banco de Dados ---
  async function syncProfileAndAchievements(profilePayload) {
    if (!profilePayload || typeof profilePayload !== 'object') return { ok: false, offline: true };
    const sig = root.QZ_SECURITY
      ? root.QZ_SECURITY.computeDigitalSignature('profile_sync', profilePayload)
      : '';
    const enriched = Object.assign({}, profilePayload, { integritySig: sig, updatedAt: Date.now() });

    if (!isBrowserOnline()) {
      enqueueOfflineAction('profile_sync', enriched);
      return { ok: true, queuedOffline: true };
    }

    const prov = getActiveProvider();
    if (prov === 'supabase') {
      const sbRes = await requestSupabase('users_profiles', 'POST', {
        client_id: String(enriched.clientId || 'local'),
        display_name: String(enriched.player || 'Comandante'),
        best_wave: Number(enriched.bestWave) || 0,
        total_kills: Number(enriched.totalKills) || 0,
        total_games: Number(enriched.games) || 0,
        medals: enriched.medals || {},
        integrity_sig: sig
      });
      if (sbRes) return { ok: true, provider: 'supabase', data: sbRes };
    } else if (prov === 'firebase') {
      const fbRes = await requestFirebase('users_profiles/' + (enriched.clientId || 'default'), 'PUT', enriched);
      if (fbRes) return { ok: true, provider: 'firebase', data: fbRes };
    }

    const natRes = await requestNative('/api/auth/profile', 'POST', enriched);
    if (!natRes || !natRes.ok) {
      enqueueOfflineAction('profile_sync', enriched);
      return { ok: false, queuedOffline: true };
    }
    lastSyncAt = Date.now();
    return natRes;
  }

  async function submitRunToCloud(entryPayload) {
    if (!entryPayload || typeof entryPayload !== 'object') return { ok: false };
    if (!isBrowserOnline()) {
      enqueueOfflineAction('leaderboard_submit', entryPayload);
      return { ok: true, queuedOffline: true };
    }

    const prov = getActiveProvider();
    if (prov === 'supabase') {
      await requestSupabase('global_leaderboard', 'POST', {
        run_id: entryPayload.id,
        player_name: entryPayload.name,
        wave: entryPayload.wave,
        time_sec: entryPayload.time,
        kills: entryPayload.kills,
        map_id: entryPayload.map,
        difficulty: entryPayload.diff,
        run_seal: entryPayload.sig || ''
      });
    } else if (prov === 'firebase') {
      await requestFirebase('global_leaderboard/' + encodeURIComponent(entryPayload.id || 'run'), 'PUT', entryPayload);
    }

    const natRes = await requestNative('/api/leaderboard', 'POST', entryPayload);
    if (!natRes || !natRes.ok) {
      enqueueOfflineAction('leaderboard_submit', entryPayload);
      return { ok: false, queuedOffline: true };
    }
    lastSyncAt = Date.now();
    return natRes;
  }

  async function flushOfflineQueue() {
    if (isFlushing || !isBrowserOnline()) return { flushed: 0, remaining: loadOfflineQueue().length };
    const queue = loadOfflineQueue();
    if (!queue.length) return { flushed: 0, remaining: 0 };

    isFlushing = true;
    const remaining = [];
    let flushed = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (!item || !item.payload) continue;
      // Verifica assinatura digital do item na fila antes de sincronizar com a nuvem
      if (root.QZ_SECURITY && item.sig && item.sig !== 'nosig') {
        const valid = root.QZ_SECURITY.verifyDigitalSignature('hybrid_queue:' + item.type, item.payload, item.sig);
        if (!valid) continue; // Descarta item adulterado localmente
      }
      let ok = false;
      try {
        if (item.type === 'leaderboard_submit') {
          const r = await requestNative('/api/leaderboard', 'POST', item.payload);
          ok = !!(r && r.ok);
        } else if (item.type === 'cloud_save') {
          const r = await requestNative('/api/cloud-save', 'POST', item.payload);
          ok = !!(r && r.ok);
        } else if (item.type === 'profile_sync') {
          const r = await requestNative('/api/auth/profile', 'POST', item.payload);
          ok = !!(r && r.ok);
        }
      } catch (_) {
        ok = false;
      }
      if (ok) {
        flushed++;
      } else {
        remaining.push(item);
      }
    }

    saveOfflineQueue(remaining);
    isFlushing = false;
    if (flushed > 0) lastSyncAt = Date.now();
    return { flushed, remaining: remaining.length };
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('online', () => {
      flushOfflineQueue();
    });
  }

  const ACCOUNT_SESSION_KEY = 'quarentenaz_operator_session_v1';
  const LOCAL_ACCOUNTS_KEY = 'quarentenaz_local_accounts_v1';

  function simpleHash(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  const _memStore = {};
  function getStoreItem(k) {
    try {
      const ls = root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (ls && typeof ls.getItem === 'function') return ls.getItem(k);
    } catch (_) {}
    return _memStore[k] || null;
  }
  function setStoreItem(k, v) {
    _memStore[k] = String(v);
    try {
      const ls = root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (ls && typeof ls.setItem === 'function') ls.setItem(k, String(v));
    } catch (_) {}
  }
  function removeStoreItem(k) {
    delete _memStore[k];
    try {
      const ls = root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (ls && typeof ls.removeItem === 'function') ls.removeItem(k);
    } catch (_) {}
  }

  function loadLocalAccounts() {
    try {
      const raw = getStoreItem(LOCAL_ACCOUNTS_KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalAccounts(map) {
    try {
      setStoreItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function getCurrentAccount() {
    try {
      const raw = getStoreItem(ACCOUNT_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && parsed.operatorName) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function setCurrentAccount(acct) {
    try {
      if (!acct) {
        removeStoreItem(ACCOUNT_SESSION_KEY);
      } else {
        setStoreItem(ACCOUNT_SESSION_KEY, JSON.stringify(acct));
      }
    } catch (_) {}
  }

  async function registerAccount(opts) {
    const o = opts || {};
    const operatorName = String(o.operatorName || '').trim().slice(0, 22);
    const email = String(o.email || '').trim().toLowerCase().slice(0, 80);
    const password = String(o.password || '');
    const avatar = String(o.avatar || '🦅').slice(0, 8);
    const commander = String(o.commander || 'vance').slice(0, 20);
    const migrateData = o.migrateData || null;

    if (operatorName.length < 2) {
      return { ok: false, error: 'O Nome de Operador deve ter pelo menos 2 caracteres.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Digite um endereço de e-mail válido.' };
    }
    if (password.length < 4) {
      return { ok: false, error: 'A senha deve ter pelo menos 4 caracteres.' };
    }

    // 1. Tenta registrar no Servidor Online / Cloud
    if (isBrowserOnline()) {
      const natRes = await requestNative('/api/auth/register', 'POST', {
        operatorName,
        email,
        password,
        avatar,
        commander,
        migrateData
      });
      if (natRes && natRes.ok) {
        if (natRes.clientToken) config.clientToken = natRes.clientToken;
        const session = {
          operatorName: natRes.profile.player || operatorName,
          email,
          avatar: natRes.profile.avatar || avatar,
          commander: natRes.profile.commander || commander,
          verifiedOnline: true,
          loggedAt: Date.now()
        };
        setCurrentAccount(session);
        // Também salva no cofre local para login offline
        const accts = loadLocalAccounts();
        accts[email] = Object.assign({}, session, { passHash: simpleHash(email + ':' + password) });
        saveLocalAccounts(accts);
        return { ok: true, account: session, profile: natRes.profile, clientToken: natRes.clientToken };
      } else if (natRes && natRes.error) {
        return { ok: false, error: natRes.error };
      }
    }

    // 2. Fallback Offline-First / Standalone Cloud Vault (ex: GitHub Pages sem backend ativo)
    const accts = loadLocalAccounts();
    for (const k of Object.keys(accts)) {
      const existing = accts[k];
      if (existing.email === email) {
        return { ok: false, error: 'Este e-mail já está cadastrado neste dispositivo.' };
      }
      if ((existing.operatorName || '').toLowerCase() === operatorName.toLowerCase()) {
        return { ok: false, error: 'Este Nome de Operador já está reservado.' };
      }
    }

    const session = {
      operatorName,
      email,
      avatar,
      commander,
      verifiedOnline: isBrowserOnline(),
      loggedAt: Date.now()
    };
    accts[email] = Object.assign({}, session, {
      passHash: simpleHash(email + ':' + password),
      migrateData
    });
    saveLocalAccounts(accts);
    setCurrentAccount(session);
    if (migrateData) {
      enqueueOfflineAction('profile_sync', Object.assign({ player: operatorName, email, avatar, commander }, migrateData));
    }
    return { ok: true, account: session };
  }

  async function loginAccount(opts) {
    const o = opts || {};
    const identifier = String(o.identifier || o.email || o.operatorName || '').trim().toLowerCase();
    const password = String(o.password || '');

    if (!identifier || !password) {
      return { ok: false, error: 'Informe seu Nome de Operador (ou E-mail) e Senha.' };
    }

    if (isBrowserOnline()) {
      const natRes = await requestNative('/api/auth/login', 'POST', { identifier, password });
      if (natRes && natRes.ok && natRes.profile) {
        if (natRes.clientToken) config.clientToken = natRes.clientToken;
        const session = {
          operatorName: natRes.profile.player,
          email: natRes.profile.email || identifier,
          avatar: natRes.profile.avatar || '🦅',
          commander: natRes.profile.commander || 'vance',
          verifiedOnline: true,
          loggedAt: Date.now()
        };
        setCurrentAccount(session);
        return { ok: true, account: session, profile: natRes.profile, clientToken: natRes.clientToken };
      }
    }

    const accts = loadLocalAccounts();
    let found = null;
    for (const k of Object.keys(accts)) {
      const a = accts[k];
      if (!a) continue;
      if (a.email === identifier || (a.operatorName || '').toLowerCase() === identifier) {
        found = a;
        break;
      }
    }

    if (!found) {
      return { ok: false, error: 'Conta não encontrada. Crie sua conta na aba CRIAR CONTA.' };
    }

    const expectedHash = simpleHash(found.email + ':' + password);
    if (found.passHash !== expectedHash) {
      return { ok: false, error: 'Senha tática incorreta.' };
    }

    const session = {
      operatorName: found.operatorName,
      email: found.email,
      avatar: found.avatar || '🦅',
      commander: found.commander || 'vance',
      verifiedOnline: isBrowserOnline(),
      loggedAt: Date.now()
    };
    setCurrentAccount(session);
    return { ok: true, account: session };
  }

  function logoutAccount() {
    setCurrentAccount(null);
    return { ok: true };
  }

  const QZ_CLOUD_DB = {
    configure(opts) {
      if (opts && typeof opts === 'object') Object.assign(config, opts);
      return this.getStatus();
    },
    setTokens(clientToken, licenseToken) {
      if (clientToken) config.clientToken = clientToken;
      if (licenseToken) config.licenseToken = licenseToken;
    },
    getStatus() {
      return {
        provider: getActiveProvider(),
        online: isBrowserOnline(),
        queuedItems: loadOfflineQueue().length,
        lastSyncAt,
        account: getCurrentAccount()
      };
    },
    enqueueOfflineAction,
    loadOfflineQueue,
    flushOfflineQueue,
    syncProfileAndAchievements,
    submitRunToCloud,
    registerAccount,
    loginAccount,
    logoutAccount,
    getCurrentAccount,
    setCurrentAccount
  };

  root.QZ_CLOUD_DB = QZ_CLOUD_DB;
})(typeof globalThis !== 'undefined' ? globalThis : window);
