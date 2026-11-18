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
        lastSyncAt
      };
    },
    enqueueOfflineAction,
    loadOfflineQueue,
    flushOfflineQueue,
    syncProfileAndAchievements,
    submitRunToCloud
  };

  root.QZ_CLOUD_DB = QZ_CLOUD_DB;
})(typeof globalThis !== 'undefined' ? globalThis : window);
