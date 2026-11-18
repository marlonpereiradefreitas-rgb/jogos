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
    if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
    return typeof root.fetch === 'function';
  }

  async function apiReq(path, method, body) {
    if (!canUseNetwork()) return null;
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['X-Client-Token'] = clientToken;
    try {
      const res = await root.fetch(path, {
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
    if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
    const host = (typeof location !== 'undefined' && location.host) ? location.host : 'localhost:8080';
    const url = customWsUrl || `${proto}//${host}/ws`;

    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        wsConnected = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          sendWsMessage({ type: 'ping', ts: Date.now() });
        }, 20000);
        if (activeRoom && activeRoom.roomId) {
          sendWsMessage({ type: 'join_room', roomId: activeRoom.roomId, token: clientToken });
        }
        emit('connected', { url });
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'wave_sync' || msg.type === 'cmd_broadcast' || msg.type === 'room_state') {
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

  async function createRoom(opts) {
    const o = opts || {};
    const res = await apiReq('/api/mp/rooms', 'POST', {
      name: o.name || 'Esquadrão Alfa',
      mode: o.mode || 'coop',
      map: o.map || 'four',
      diff: o.diff || 'normal',
      maxPlayers: o.maxPlayers || 2,
      playerName: o.playerName || 'Comandante',
      isPublic: o.isPublic !== false
    });
    if (res && res.ok && res.room) {
      activeRoom = res.room;
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
      sendWsMessage({ type: 'join_room', roomId: activeRoom.roomId, token: clientToken });
      emit('room_joined', activeRoom);
    }
    return res;
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
    getStatus() {
      return {
        wsConnected,
        activeRoom: activeRoom ? activeRoom.roomId : null,
        roomCode: activeRoom ? activeRoom.roomCode : null
      };
    },
    on,
    validateActionCommand,
    connectWebSocket,
    sendWsMessage,
    listRooms,
    createRoom,
    joinRoom,
    matchmake,
    syncWaveAndCommands,
    submitMultiplayerScore,
    getMultiplayerLeaderboard
  };

  root.QZ_NET_MP = QZ_NET_MP;
})(typeof globalThis !== 'undefined' ? globalThis : window);
