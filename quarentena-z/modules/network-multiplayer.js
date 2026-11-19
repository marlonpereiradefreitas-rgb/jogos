// ============================================================================
// QUARENTENA Z — SERVIÇO DE REDE ASSÍNCRONA & MULTIPLAYER (WEBSOCKETS + REST)
// - Criação de salas, Matchmaking (pareamento), Sincronização de Ondas/Comandos
// - Placares Cooperativos (Co-op) e Competitivos (Versus / Desafio Diário)
// - Cliente WebSocket com reconexão automática + Fallback REST Autoritativo
// ============================================================================
(function (root) {
  'use strict';

  const VALID_COMMANDS = new Set([
    'place', 'up', 'paragon', 'ability', 'sell',
    'prio', 'aim', 'portal_exit', 'clearObs', 'wave', 'power', 'auto'
  ]);

  const listeners = new Map();
  let ws = null;
  let wsConnected = false;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let activeRoom = null;
  let clientToken = null;
  let currentPing = 0;
  let customServerUrl = '';

  // Configuração padrão de produção quando o frontend rodar no GitHub Pages
  const DEFAULT_PROD_SERVER_URL = 'https://quarentena-z-online.onrender.com';

  // 1. Prioridade: Query string ?server=... ou ?backend=...
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search);
      const qs = q.get('server') || q.get('backend') || q.get('api');
      if (qs) {
        customServerUrl = String(qs).trim().replace(/\/+$/, '');
        try { if (typeof localStorage !== 'undefined') localStorage.setItem('qz_server_url', customServerUrl); } catch (_) {}
      }
    }
  } catch (_) {}

  // 2. Se não veio por query string, tenta recuperar do localStorage
  if (!customServerUrl) {
    try {
      if (typeof localStorage !== 'undefined') {
        customServerUrl = localStorage.getItem('qz_server_url') || '';
      }
    } catch (_) {}
  }

  function setServerUrl(url) {
    customServerUrl = String(url || '').trim().replace(/\/+$/, '');
    try {
      if (typeof localStorage !== 'undefined') {
        if (customServerUrl) localStorage.setItem('qz_server_url', customServerUrl);
        else localStorage.removeItem('qz_server_url');
      }
    } catch (_) {}
  }

  function getServerUrl() {
    return customServerUrl;
  }

  function getEffectiveServerUrl() {
    if (customServerUrl) return customServerUrl;
    if (typeof location !== 'undefined') {
      if (location.protocol === 'file:') return 'http://localhost:3000';
      // Se estiver hospedado no GitHub Pages e nenhuma URL manual foi definida:
      if (location.hostname && (location.hostname.endsWith('github.io') || location.hostname.includes('github.io'))) {
        return DEFAULT_PROD_SERVER_URL;
      }
      return location.origin;
    }
    return 'http://localhost:3000';
  }

  function getCurrentPing() {
    return currentPing;
  }

  function emit(event, data) {
    const subs = listeners.get(event);
    if (!subs) return;
    for (let i = 0; i < subs.length; i++) {
      try { subs[i](data); } catch (_) {}
    }
  }

  function on(event, handler) {
    if (typeof handler !== 'function') return () => {};
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(handler);
    return () => {
      const arr = listeners.get(event);
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  function canUseNetwork() {
    return typeof root.fetch === 'function';
  }

  async function apiReq(path, method, body) {
    if (!canUseNetwork()) return null;
    const base = getEffectiveServerUrl();
    const fullUrl = path.startsWith('http') ? path : (base + path);
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['X-Client-Token'] = clientToken;
    try {
      const res = await root.fetch(fullUrl, {
        method: method || 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  // --- Validação de Ações (Pré-validação no cliente espelhada no servidor) ---
  function validateActionCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return { valid: false, reason: 'Comando ausente' };
    if (!VALID_COMMANDS.has(cmd.type)) return { valid: false, reason: 'Tipo de comando inválido: ' + cmd.type };
    if (cmd.type === 'place') {
      if (typeof cmd.key !== 'string' || !Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
        return { valid: false, reason: 'Coordenadas ou torre inválidas para posicionamento' };
      }
      if (cmd.x < 8 || cmd.x > 952 || cmd.y < 8 || cmd.y > 632) {
        return { valid: false, reason: 'Posição fora dos limites do mapa' };
      }
    }
    if (cmd.type === 'up' || cmd.type === 'sell' || cmd.type === 'paragon' || cmd.type === 'ability') {
      if (!Number.isInteger(cmd.id) || cmd.id <= 0) {
        return { valid: false, reason: 'ID de torre inválido' };
      }
    }
    return { valid: true };
  }

  // --- Cliente WebSocket Assíncrono (RFC 6455) ---
  function connectWebSocket(customWsUrl) {
    if (typeof WebSocket === 'undefined') return false;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    let url = customWsUrl;
    if (!url) {
      const srv = getEffectiveServerUrl();
      const wsProto = srv.startsWith('https:') ? 'wss:' : 'ws:';
      const hostPart = srv.replace(/^https?:\/\//, '');
      url = `${wsProto}//${hostPart}/ws`;
    }

    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        wsConnected = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        // Medição em tempo real de latência/ping a cada 4 segundos
        heartbeatTimer = setInterval(() => {
          sendWsMessage({ type: 'ping', clientTs: Date.now() });
        }, 4000);
        // Ping imediato para leitura instantânea de latência ao conectar
        sendWsMessage({ type: 'ping', clientTs: Date.now() });
        if (activeRoom && (activeRoom.roomId || activeRoom.roomCode)) {
          sendWsMessage({
            type: 'join_room',
            roomId: activeRoom.roomId,
            roomCode: activeRoom.roomCode,
            slot: activeRoom.mySlot || 0,
            token: clientToken
          });
        }
        emit('connected', { url });
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'pong' && (msg.clientTs || msg.ts)) {
            const lat = Math.max(1, Date.now() - (msg.clientTs || msg.ts));
            currentPing = lat;
            emit('ping_pong', { ping: lat });
          }
          if (msg.type) {
            emit(msg.type, msg);
          }
          emit('message', msg);
        } catch (_) {}
      };

      ws.onclose = () => {
        wsConnected = false;
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        emit('disconnected', {});
      };

      ws.onerror = () => {
        wsConnected = false;
      };
      return true;
    } catch (_) {
      wsConnected = false;
      return false;
    }
  }

  function sendWsMessage(payload) {
    if (!ws || !wsConnected || typeof WebSocket === 'undefined' || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- API Multiplayer: Salas, Pareamento (Matchmaking), Sincronização e Placares ---
  async function listRooms(mode) {
    const q = mode ? '?mode=' + encodeURIComponent(mode) : '';
    return await apiReq('/api/mp/rooms' + q, 'GET');
  }

  async function getRoomInfo(codeOrId) {
    if (!codeOrId) return null;
    return await apiReq('/api/mp/rooms/info?code=' + encodeURIComponent(codeOrId), 'GET');
  }

  async function createRoom(opts) {
    const o = opts || {};
    const res = await apiReq('/api/mp/rooms', 'POST', {
      name: o.name || 'Esquadrão Alfa',
      roomCode: o.roomCode,
      mode: o.mode || 'coop',
      division: o.division || 'sectors',
      map: o.map || 'four',
      diff: o.diff || 'normal',
      seed: o.seed,
      maxPlayers: o.maxPlayers || 2,
      playerName: o.playerName || 'Comandante',
      isPublic: o.isPublic !== false
    });
    if (res && res.ok && res.room) {
      activeRoom = res.room;
      activeRoom.mySlot = 0;
      connectWebSocket();
      sendWsMessage({ type: 'join_room', roomId: activeRoom.roomId, roomCode: activeRoom.roomCode, slot: 0, playerName: o.playerName });
      emit('room_joined', activeRoom);
    }
    return res;
  }

  async function joinRoom(opts) {
    const o = opts || {};
    const res = await apiReq('/api/mp/rooms/join', 'POST', {
      roomId: o.roomId,
      roomCode: o.roomCode,
      playerName: o.playerName || 'Comandante'
    });
    if (res && res.ok && res.room) {
      activeRoom = res.room;
      activeRoom.mySlot = res.slot !== undefined ? res.slot : (activeRoom.players ? activeRoom.players.length - 1 : 1);
      connectWebSocket();
      sendWsMessage({ type: 'join_room', roomId: activeRoom.roomId, roomCode: activeRoom.roomCode, slot: activeRoom.mySlot, playerName: o.playerName });
      emit('room_joined', activeRoom);
    }
    return res;
  }

  async function updateRoom(opts) {
    const o = opts || {};
    const payload = Object.assign({
      roomId: activeRoom ? activeRoom.roomId : undefined,
      roomCode: activeRoom ? activeRoom.roomCode : undefined
    }, o);
    sendWsMessage(Object.assign({ type: 'room_update' }, payload));
    return await apiReq('/api/mp/rooms/update', 'POST', payload);
  }

  async function startRoomMatch(opts) {
    const o = opts || {};
    const payload = Object.assign({
      roomId: activeRoom ? activeRoom.roomId : undefined,
      roomCode: activeRoom ? activeRoom.roomCode : undefined
    }, o);
    sendWsMessage(Object.assign({ type: 'game_start' }, payload));
    return await apiReq('/api/mp/rooms/start', 'POST', payload);
  }

  function broadcastCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    const packet = { type: 'cmd_broadcast', command: cmd, ts: Date.now() };
    return sendWsMessage(packet);
  }

  function broadcastDonate(toSlotOrObj, pct, amount, fromSlot, balance) {
    let packet;
    if (toSlotOrObj && typeof toSlotOrObj === 'object') {
      packet = Object.assign({ type: 'coop_donate' }, toSlotOrObj);
    } else {
      const p = Number(pct) || 0.25;
      const amt = Number(amount) || 0;
      const bal = balance !== undefined ? Number(balance) : (p > 0 ? Math.round(amt / p) : amt);
      packet = {
        type: 'coop_donate',
        toSlot: Number(toSlotOrObj) || 0,
        pct: p,
        amount: amt,
        balance: bal,
        fromSlot: fromSlot !== undefined ? fromSlot : (activeRoom ? activeRoom.mySlot : 0),
        ts: Date.now()
      };
    }
    return sendWsMessage(packet);
  }

  function broadcastPing(kindOrObj, x, y, sender) {
    let packet;
    if (kindOrObj && typeof kindOrObj === 'object') {
      packet = Object.assign({ type: 'coop_ping' }, kindOrObj);
    } else {
      packet = {
        type: 'coop_ping',
        kind: kindOrObj || 'danger',
        x: Number(x) || 480,
        y: Number(y) || 320,
        sender: sender || 'Comandante',
        fromSlot: activeRoom ? activeRoom.mySlot : 0,
        ts: Date.now()
      };
    }
    return sendWsMessage(packet);
  }

  function broadcastVote(voteTypeOrObj, speed, voter) {
    let packet;
    if (voteTypeOrObj && typeof voteTypeOrObj === 'object') {
      packet = Object.assign({ type: 'coop_vote' }, voteTypeOrObj);
    } else {
      packet = {
        type: 'coop_vote',
        voteType: voteTypeOrObj || 'wave',
        speed: speed || 1,
        voter: voter || 'Comandante',
        fromSlot: activeRoom ? activeRoom.mySlot : 0,
        ts: Date.now()
      };
    }
    return sendWsMessage(packet);
  }

  function broadcastBaseSync(life) {
    return sendWsMessage({ type: 'base_sync', life: Math.max(0, Math.floor(life || 0)) });
  }

  async function setPlayerReady(ready) {
    const isReady = ready !== undefined ? !!ready : true;
    if (activeRoom && activeRoom.players && activeRoom.mySlot !== undefined) {
      const p = activeRoom.players.find(pl => pl.slot === activeRoom.mySlot);
      if (p) p.ready = isReady;
    }
    sendWsMessage({
      type: 'player_ready',
      ready: isReady,
      slot: activeRoom ? (activeRoom.mySlot || 0) : 0
    });
    return await apiReq('/api/mp/rooms/ready', 'POST', {
      roomId: activeRoom ? activeRoom.roomId : undefined,
      roomCode: activeRoom ? activeRoom.roomCode : undefined,
      slot: activeRoom ? activeRoom.mySlot : 0,
      ready: isReady
    });
  }

  async function wakeServer(onProgress) {
    const srv = getEffectiveServerUrl();
    const maxAttempts = 18;
    const intervalMs = 2500;
    let attempt = 0;
    const startT = Date.now();

    while (attempt < maxAttempts) {
      attempt++;
      const elapsed = Math.round((Date.now() - startT) / 1000);
      if (typeof onProgress === 'function') {
        onProgress({
          status: 'waking',
          attempt,
          maxAttempts,
          elapsed,
          serverUrl: srv,
          message: attempt === 1
            ? 'Conectando ao servidor tático...'
            : `Acordando servidor na nuvem (${attempt}/${maxAttempts}) — aguarde ~${elapsed}s...`
        });
      }

      try {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const to = controller ? setTimeout(() => controller.abort(), 4000) : null;
        const res = await root.fetch(srv + '/health', {
          method: 'GET',
          signal: controller ? controller.signal : undefined
        });
        if (to) clearTimeout(to);
        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          if (typeof onProgress === 'function') {
            onProgress({
              status: 'ready',
              attempt,
              elapsed,
              serverUrl: srv,
              data,
              message: 'Servidor operacional e conectado!'
            });
          }
          return { ok: true, data };
        }
      } catch (_) {}

      await new Promise(r => setTimeout(r, intervalMs));
    }

    if (typeof onProgress === 'function') {
      onProgress({
        status: 'timeout',
        attempt,
        serverUrl: srv,
        message: 'Tempo limite ao acordar o servidor. Verifique sua conexão ou a URL nas opções avançadas.'
      });
    }
    return { ok: false, error: 'Timeout ao conectar com o servidor' };
  }

  async function matchmake(opts) {
    const o = opts || {};
    const res = await apiReq('/api/mp/matchmaking', 'POST', {
      mode: o.mode || 'coop',
      map: o.map || 'four',
      diff: o.diff || 'normal',
      playerName: o.playerName || 'Comandante'
    });
    if (res && res.ok && res.room) {
      activeRoom = res.room;
      connectWebSocket();
      sendWsMessage({ type: 'join_room', roomId: activeRoom.roomId, token: clientToken });
      emit('room_joined', activeRoom);
    }
    return res;
  }

  async function syncWaveAndCommands(syncPayload) {
    const p = syncPayload || {};
    const roomId = p.roomId || (activeRoom && activeRoom.roomId);
    if (!roomId) return { ok: false, error: 'Nenhuma sala multiplayer ativa' };

    const cmds = Array.isArray(p.commands) ? p.commands : [];
    for (let i = 0; i < cmds.length; i++) {
      const check = validateActionCommand(cmds[i]);
      if (!check.valid) return { ok: false, error: check.reason };
    }

    const packet = {
      roomId,
      wave: Number(p.wave) || 0,
      tick: Number(p.tick) || 0,
      stateHash: Number(p.stateHash) >>> 0,
      commands: cmds
    };

    // Envia via WebSocket em tempo real se conectado + sincroniza no endpoint autoritativo REST
    sendWsMessage(Object.assign({ type: 'wave_sync' }, packet));
    return await apiReq('/api/mp/sync', 'POST', packet);
  }

  async function submitMultiplayerScore(scorePayload) {
    const s = scorePayload || {};
    const sig = root.QZ_SECURITY
      ? root.QZ_SECURITY.computeDigitalSignature('mp_score', {
          mode: s.mode || 'coop',
          wave: Number(s.wave) || 0,
          kills: Number(s.kills) || 0,
          map: s.map || 'four'
        })
      : '';
    return await apiReq('/api/mp/scores', 'POST', Object.assign({}, s, { matchSeal: sig }));
  }

  async function getMultiplayerLeaderboard(mode) {
    const q = mode ? '?mode=' + encodeURIComponent(mode) : '';
    return await apiReq('/api/mp/scores' + q, 'GET');
  }

  const QZ_NET_MP = {
    setClientToken(tk) { clientToken = tk; },
    setServerUrl,
    getServerUrl,
    getEffectiveServerUrl,
    getCurrentPing,
    setPlayerReady,
    wakeServer,
    getStatus() {
      return {
        wsConnected,
        activeRoom: activeRoom ? activeRoom.roomId : null,
        roomCode: activeRoom ? activeRoom.roomCode : null,
        mySlot: activeRoom ? (activeRoom.mySlot || 0) : 0
      };
    },
    on,
    validateActionCommand,
    connectWebSocket,
    sendWsMessage,
    listRooms,
    getRoomInfo,
    createRoom,
    joinRoom,
    updateRoom,
    startRoomMatch,
    broadcastCommand,
    broadcastDonate,
    broadcastPing,
    broadcastVote,
    broadcastBaseSync,
    matchmake,
    syncWaveAndCommands,
    submitMultiplayerScore,
    getMultiplayerLeaderboard
  };

  root.QZ_NET_MP = QZ_NET_MP;
})(typeof globalThis !== 'undefined' ? globalThis : window);
