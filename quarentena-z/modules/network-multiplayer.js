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

  // 3. Proteção automática: se customServerUrl aponta para localhost mas estamos rodando
  // em um domínio remoto (ex: GitHub Pages ou mobile), descarta o localhost para não falhar
  try {
    if (customServerUrl && (customServerUrl.includes('localhost') || customServerUrl.includes('127.0.0.1'))) {
      if (typeof location !== 'undefined' && location.hostname && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        customServerUrl = '';
        if (typeof localStorage !== 'undefined') localStorage.removeItem('qz_server_url');
      }
    }
  } catch (_) {}

  let lastServerOk = 0;
  let lastServerData = null;
  let activeWakePromise = null;

  function setServerUrl(url) {
    customServerUrl = String(url || '').trim().replace(/\/+$/, '');
    lastServerOk = 0;
    lastServerData = null;
    activeWakePromise = null;
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
      // Se estiver rodando em live server ou porta dev diferente no localhost, aponta para porta 3000 do Node
      if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port && location.port !== '3000') {
        return 'http://localhost:3000';
      }
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

  async function apiReq(path, method, body, timeoutMs) {
    if (!canUseNetwork()) return null;
    const base = getEffectiveServerUrl();
    const fullUrl = path.startsWith('http') ? path : (base + path);
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['X-Client-Token'] = clientToken;
    const tMs = typeof timeoutMs === 'number' ? timeoutMs : 2500;
    try {
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      let timer = null;
      if (controller) {
        timer = setTimeout(() => controller.abort(), tMs);
      }
      const res = await root.fetch(fullUrl, {
        method: method || 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      return await res.json();
    } catch (_) {
      return { ok: false, networkError: true, error: 'Sem conexão com o servidor (' + base + '). Confira se o servidor está ligado e o endereço está correto.' };
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

  // --- Cliente WebSocket Assíncrono (RFC 6455) com reconexão automática ---
  let wsWanted = false;          // true enquanto o jogador deve permanecer conectado
  let reconnectAttempts = 0;
  let lastPongAt = 0;
  let wasConnectedOnce = false;
  let myPlayerName = 'Comandante';
  let pendingQueue = [];

  function buildWsUrl() {
    const srv = getEffectiveServerUrl();
    const wsProto = srv.startsWith('https:') ? 'wss:' : 'ws:';
    const hostPart = srv.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `${wsProto}//${hostPart}/ws`;
  }

  function announceRoomOnSocket() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (activeRoom && (activeRoom.roomId || activeRoom.roomCode)) {
      try {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: activeRoom.roomId,
          roomCode: activeRoom.roomCode,
          slot: activeRoom.mySlot || 0,
          playerName: myPlayerName,
          token: clientToken
        }));
      } catch (_) {}
    }
  }

  function scheduleReconnect() {
    if (!wsWanted || reconnectTimer) return;
    reconnectAttempts++;
    const delay = Math.min(8000, 400 * Math.pow(2, Math.min(reconnectAttempts, 5)));
    emit('reconnecting', { attempt: reconnectAttempts, delay });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (wsWanted) connectWebSocket();
    }, delay);
  }

  function connectWebSocket(customWsUrl) {
    if (typeof WebSocket === 'undefined') return false;
    wsWanted = true;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    const url = customWsUrl || buildWsUrl();

    try {
      const sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => {
        if (ws !== sock) return;
        wsConnected = true;
        reconnectAttempts = 0;
        lastPongAt = Date.now();
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        // 1º: entrar na sala (antes de qualquer outra mensagem); 2º: esvaziar a fila; 3º: ping.
        announceRoomOnSocket();
        const queued = pendingQueue; pendingQueue = [];
        for (const m of queued) { try { sock.send(JSON.stringify(m)); } catch (_) {} }
        sendWsMessage({ type: 'ping', clientTs: Date.now() });
        // Medição de latência a cada 4s + detecção de conexão morta (sem pong em 16s)
        heartbeatTimer = setInterval(() => {
          if (Date.now() - lastPongAt > 16000) { try { sock.close(); } catch (_) {} return; }
          sendWsMessage({ type: 'ping', clientTs: Date.now() });
        }, 4000);
        emit(wasConnectedOnce ? 'reconnected' : 'connected', { url });
        wasConnectedOnce = true;
      };

      sock.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'pong') {
            lastPongAt = Date.now();
            if (msg.clientTs || msg.ts) {
              const lat = Math.max(1, Date.now() - (msg.clientTs || msg.ts));
              currentPing = lat;
              emit('ping_pong', { ping: lat });
            }
          }
          if ((msg.type === 'room_state' || msg.type === 'room_update' || msg.type === 'player_joined' ||
               msg.type === 'player_ready' || msg.type === 'game_start') && msg.room && activeRoom) {
            const keepSlot = activeRoom.mySlot;
            activeRoom = Object.assign(activeRoom, msg.room);
            activeRoom.mySlot = keepSlot;
          }
          if (msg.type) {
            emit(msg.type, msg);
          }
          emit('message', msg);
        } catch (_) {}
      };

      sock.onclose = () => {
        if (ws !== sock) return;
        wsConnected = false;
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        emit('disconnected', {});
        scheduleReconnect();
      };

      sock.onerror = () => {
        // onclose sempre é disparado em seguida e cuida da reconexão
        wsConnected = false;
      };
      return true;
    } catch (_) {
      wsConnected = false;
      scheduleReconnect();
      return false;
    }
  }

  let bc = null;
  let isLocalVirtualMode = false;
  let webrtcPeer = null;
  let webrtcConns = [];

  function closeWebRTC() {
    if (webrtcConns && webrtcConns.length) {
      for (const c of webrtcConns) {
        try { c.close(); } catch (_) {}
      }
      webrtcConns = [];
    }
    if (webrtcPeer) {
      try { webrtcPeer.destroy(); } catch (_) {}
      webrtcPeer = null;
    }
  }

  function getCleanRoomPeerId(code) {
    const clean = String(code || '').replace(/[^2-9a-zA-Z]/g, '').toLowerCase();
    return 'qz-coop-' + clean;
  }

  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' }
  ];

  function setupHostWebRTC(roomCode, playerName) {
    if (typeof Peer === 'undefined') return;
    closeWebRTC();
    const peerId = getCleanRoomPeerId(roomCode);
    try {
      webrtcPeer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: DEFAULT_ICE_SERVERS,
          iceCandidatePoolSize: 10
        }
      });

      webrtcPeer.on('connection', (conn) => {
        if (!webrtcConns.includes(conn)) webrtcConns.push(conn);

        conn.on('data', (data) => {
          try {
            const msg = (typeof data === 'string') ? JSON.parse(data) : data;
            if (!msg || typeof msg !== 'object') return;

            // Se for requisição de entrada de jogador pela internet (outra casa / Wi-Fi)
            if (msg.type === 'p2p_join_req' && activeRoom) {
              const currentPlayers = Array.isArray(activeRoom.players) ? activeRoom.players : [];
              let guestSlot = currentPlayers.findIndex((p, idx) => idx > 0 && (!p.connected || p.isAi));
              if (guestSlot === -1) guestSlot = currentPlayers.length;
              if (guestSlot < (activeRoom.maxPlayers || 4)) {
                const guestPlayer = {
                  slot: guestSlot,
                  name: msg.playerName || ('Comandante P' + (guestSlot + 1)),
                  ready: false,
                  connected: true
                };
                currentPlayers[guestSlot] = guestPlayer;
                activeRoom.players = currentPlayers;
                conn.send({
                  type: 'p2p_room_state',
                  room: Object.assign({}, activeRoom),
                  assignedSlot: guestSlot
                });
                emit('player_joined', { slot: guestSlot, player: guestPlayer, room: activeRoom });
                emit('room_state', { room: activeRoom });

                // Notifica outros membros do esquadrão
                for (const other of webrtcConns) {
                  if (other !== conn && other.open) {
                    try { other.send({ type: 'room_state', room: activeRoom }); } catch (_) {}
                  }
                }
              }
              return;
            }

            // Repassa mensagem para outros peers e emite localmente
            for (const other of webrtcConns) {
              if (other !== conn && other.open) {
                try { other.send(msg); } catch (_) {}
              }
            }
            if (msg.type) emit(msg.type, msg);
            emit('message', msg);
          } catch (_) {}
        });

        conn.on('close', () => {
          webrtcConns = webrtcConns.filter(c => c !== conn);
        });
      });

      webrtcPeer.on('error', (err) => {
        if (err && err.type === 'unavailable-id') {
          console.warn('[WebRTC P2P] Código de sala em uso recente no broker.');
        }
      });
    } catch (e) {
      console.warn('[WebRTC P2P] Erro ao instanciar Host Peer:', e);
    }
  }

  function connectGuestWebRTC(roomCode, playerName) {
    if (typeof Peer === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      closeWebRTC();
      const targetPeerId = getCleanRoomPeerId(roomCode);
      let resolved = false;

      try {
        webrtcPeer = new Peer(null, {
          debug: 0,
          config: {
            iceServers: DEFAULT_ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 7500);

        webrtcPeer.on('open', () => {
          const conn = webrtcPeer.connect(targetPeerId, { reliable: true });
          webrtcConns.push(conn);

          conn.on('open', () => {
            conn.send({
              type: 'p2p_join_req',
              playerName: playerName || 'Comandante Aliado'
            });
          });

          conn.on('data', (data) => {
            try {
              const msg = (typeof data === 'string') ? JSON.parse(data) : data;
              if (msg && msg.type === 'p2p_room_state' && msg.room) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  isLocalVirtualMode = true;
                  activeRoom = msg.room;
                  activeRoom.mySlot = msg.assignedSlot !== undefined ? msg.assignedSlot : 1;
                  myPlayerName = playerName || myPlayerName;
                  emit('room_joined', activeRoom);
                  resolve({ ok: true, room: activeRoom, slot: activeRoom.mySlot, localMode: true });
                }
              }
              if (msg.type) emit(msg.type, msg);
              emit('message', msg);
            } catch (_) {}
          });

          conn.on('close', () => {
            webrtcConns = webrtcConns.filter(c => c !== conn);
          });
        });

        webrtcPeer.on('error', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(null);
          }
        });
      } catch (_) {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }
    });
  }

  function closeBroadcastChannel() {
    if (bc) {
      try { bc.close(); } catch (_) {}
      bc = null;
    }
  }

  function setupBroadcastChannel(roomCode) {
    if (typeof BroadcastChannel === 'undefined') return;
    closeBroadcastChannel();
    const cleanCode = String(roomCode || '').replace(/[^2-9A-Z]/g, '');
    if (!cleanCode) return;
    try {
      bc = new BroadcastChannel('qz_coop_' + cleanCode);
      bc.onmessage = (ev) => {
        try {
          const msg = ev.data;
          if (!msg || typeof msg !== 'object') return;

          // Se eu for o Host e outro cliente pedir para entrar via BroadcastChannel:
          if (msg.type === 'p2p_join_req' && activeRoom && (activeRoom.mySlot === 0 || !activeRoom.mySlot)) {
            const currentPlayers = Array.isArray(activeRoom.players) ? activeRoom.players : [];
            let guestSlot = currentPlayers.findIndex((p, idx) => idx > 0 && !p.connected);
            if (guestSlot === -1) guestSlot = currentPlayers.length;
            if (guestSlot < (activeRoom.maxPlayers || 4)) {
              const guestPlayer = {
                slot: guestSlot,
                name: msg.playerName || ('Aliado P' + (guestSlot + 1)),
                ready: false,
                connected: true
              };
              currentPlayers[guestSlot] = guestPlayer;
              activeRoom.players = currentPlayers;
              // Responde com o estado completo da sala e o slot atribuído ao convidado
              bc.postMessage({
                type: 'p2p_room_state',
                room: Object.assign({}, activeRoom),
                assignedSlot: guestSlot
              });
              emit('player_joined', { slot: guestSlot, player: guestPlayer, room: activeRoom });
              emit('room_state', { room: activeRoom });
            }
            return;
          }

          // Se a mensagem for sincronização de sala:
          if ((msg.type === 'room_state' || msg.type === 'room_update' || msg.type === 'player_joined' ||
               msg.type === 'player_ready' || msg.type === 'game_start') && msg.room && activeRoom) {
            const keepSlot = activeRoom.mySlot;
            activeRoom = Object.assign(activeRoom, msg.room);
            activeRoom.mySlot = keepSlot;
          }

          // Emite o evento localmente para o frontend consumir
          if (msg.type) {
            emit(msg.type, msg);
          }
          emit('message', msg);
        } catch (_) {}
      };
    } catch (_) {}
  }

  function disconnectWebSocket() {
    wsWanted = false;
    pendingQueue = [];
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    const sock = ws;
    ws = null;
    wsConnected = false;
    if (sock) { try { sock.close(); } catch (_) {} }
    closeBroadcastChannel();
    closeWebRTC();
  }

  function leaveRoom() {
    disconnectWebSocket();
    closeBroadcastChannel();
    closeWebRTC();
    activeRoom = null;
  }

  function sendWsMessage(payload) {
    let sent = false;
    if (typeof WebSocket !== 'undefined' && ws && wsConnected && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
        sent = true;
      } catch (_) {}
    }
    // Sincroniza também via WebRTC DataChannel (para computadores e internets diferentes)
    if (webrtcConns && webrtcConns.length > 0) {
      for (const c of webrtcConns) {
        if (c && c.open) {
          try {
            c.send(payload);
            sent = true;
          } catch (_) {}
        }
      }
    }
    // Sincroniza também via BroadcastChannel para abas no mesmo navegador
    if (bc && payload) {
      try {
        bc.postMessage(payload);
        sent = true;
      } catch (_) {}
    }
    // Ainda conectando/reconectando no WebSocket: guarda (exceto pings) para enviar assim que abrir
    if (!sent && wsWanted && payload && payload.type !== 'ping') {
      if (pendingQueue.length >= 60) pendingQueue.shift();
      pendingQueue.push(payload);
      return true;
    }
    return sent;
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
    let res = null;
    try {
      res = await apiReq('/api/mp/rooms', 'POST', {
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
    } catch (_) {}

    if (res && res.ok && res.room) {
      isLocalVirtualMode = false;
      activeRoom = res.room;
      activeRoom.mySlot = 0;
      myPlayerName = o.playerName || myPlayerName;
      setupBroadcastChannel(res.room.roomCode);
      setupHostWebRTC(res.room.roomCode, o.playerName);
      attachToRoomSocket();
      emit('room_joined', activeRoom);
      return res;
    }

    // Se o servidor backend estiver offline, CRIA SALA LOCAL IMEDIATAMENTE (NUNCA TRAVA O JOGADOR!)
    isLocalVirtualMode = true;
    const rCode = o.roomCode || ('QZ-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    const n = Math.max(2, Math.min(4, Number(o.maxPlayers) || 2));
    const localRoom = {
      roomId: 'local_' + rCode,
      roomCode: rCode,
      name: o.name || ('Esquadrão ' + rCode),
      mode: o.mode || 'coop',
      division: o.division || 'sectors',
      map: o.map || 'four',
      diff: o.diff || 'normal',
      seed: o.seed || ((Date.now() ^ 0x7fffffff) & 0x7fffffff),
      maxPlayers: n,
      status: 'waiting',
      players: [{ slot: 0, name: o.playerName || 'Comandante', ready: true, connected: true }],
      isLocalMode: true,
      createdAt: Date.now()
    };
    activeRoom = localRoom;
    activeRoom.mySlot = 0;
    myPlayerName = o.playerName || myPlayerName;
    setupBroadcastChannel(rCode);
    setupHostWebRTC(rCode, o.playerName);
    emit('room_joined', activeRoom);
    return { ok: true, room: activeRoom, localMode: true };
  }

  // Conecta (ou reaproveita) o WebSocket e entra na sala ativa.
  function attachToRoomSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      announceRoomOnSocket();
    } else {
      connectWebSocket(); // o onopen envia o join_room da sala ativa
    }
  }

  async function joinRoom(opts) {
    const o = opts || {};
    const code = String(o.roomCode || o.roomId || '').trim();
    if (!code) {
      return { ok: false, error: 'Código de sala inválido. Digite o código exibido pelo Host.' };
    }

    setupBroadcastChannel(code);

    // 1. Enlace WebRTC P2P direto (conecta tanto na mesma LAN/Wi-Fi quanto entre internets/casas diferentes via STUN)
    const p2pPromise = connectGuestWebRTC(code, o.playerName);

    // 2. Enlace BroadcastChannel para abas no mesmo navegador/máquina
    let bcPromise = Promise.resolve(null);
    if (typeof BroadcastChannel !== 'undefined' && bc) {
      bcPromise = new Promise((resolve) => {
        let resolved = false;
        const tmpHandler = (ev) => {
          const msg = ev.data;
          if (msg && msg.type === 'p2p_room_state' && msg.room) {
            if (resolved) return;
            resolved = true;
            try { bc.removeEventListener('message', tmpHandler); } catch (_) {}
            isLocalVirtualMode = true;
            activeRoom = msg.room;
            activeRoom.mySlot = msg.assignedSlot !== undefined ? msg.assignedSlot : 1;
            myPlayerName = o.playerName || myPlayerName;
            emit('room_joined', activeRoom);
            resolve({ ok: true, room: activeRoom, slot: activeRoom.mySlot, localMode: true });
          }
        };
        bc.addEventListener('message', tmpHandler);
        bc.postMessage({ type: 'p2p_join_req', playerName: o.playerName || 'Comandante' });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { bc.removeEventListener('message', tmpHandler); } catch (_) {}
            resolve(null);
          }
        }, 1200);
      });
    }

    // 3. Enlace Servidor Central Backend (REST + WebSocket com timeout ágil de 2.5s)
    const serverPromise = apiReq('/api/mp/rooms/join', 'POST', {
      roomId: o.roomId,
      roomCode: o.roomCode,
      playerName: o.playerName || 'Comandante'
    }, 2500).then(res => {
      if (res && res.ok && res.room) {
        isLocalVirtualMode = false;
        activeRoom = res.room;
        activeRoom.mySlot = res.slot !== undefined ? res.slot : (activeRoom.players ? activeRoom.players.length - 1 : 1);
        myPlayerName = o.playerName || myPlayerName;
        attachToRoomSocket();
        emit('room_joined', activeRoom);
        return res;
      }
      return null;
    }).catch(() => null);

    // O primeiro canal que conectar (P2P WebRTC, BroadcastChannel ou Servidor) estabelece a conexão imediatamente!
    const firstSuccess = await Promise.race([
      serverPromise.then(r => r ? r : new Promise(() => {})),
      p2pPromise.then(r => r ? r : new Promise(() => {})),
      bcPromise.then(r => r ? r : new Promise(() => {}))
    ]);

    if (firstSuccess && firstSuccess.ok) {
      return firstSuccess;
    }

    // Fallback: aguarda conclusão das promessas P2P ou Servidor caso ainda estejam finalizando o handshake STUN
    const [p2pRes, srvRes] = await Promise.allSettled([p2pPromise, serverPromise]);
    if (p2pRes.status === 'fulfilled' && p2pRes.value && p2pRes.value.ok) return p2pRes.value;
    if (srvRes.status === 'fulfilled' && srvRes.value && srvRes.value.ok) return srvRes.value;

    return { ok: false, error: 'Não foi possível conectar à sala ' + code + '. Verifique se o código está correto e se o Host está aguardando na sala.' };
  }

  async function updateRoom(opts) {
    const o = opts || {};
    const payload = Object.assign({
      roomId: activeRoom ? activeRoom.roomId : undefined,
      roomCode: activeRoom ? activeRoom.roomCode : undefined
    }, o);
    if (activeRoom) {
      if (o.map) activeRoom.map = o.map;
      if (o.diff) activeRoom.diff = o.diff;
      if (o.division) activeRoom.division = o.division;
      if (o.maxPlayers) activeRoom.maxPlayers = o.maxPlayers;
    }
    sendWsMessage({ type: 'room_update', room: activeRoom });
    return await apiReq('/api/mp/rooms/update', 'POST', payload);
  }

  async function startRoomMatch(opts) {
    const o = opts || {};
    const payload = Object.assign({
      roomId: activeRoom ? activeRoom.roomId : undefined,
      roomCode: activeRoom ? activeRoom.roomCode : undefined
    }, o);
    // Dispara via WebSocket + BroadcastChannel para todas as abas
    sendWsMessage(Object.assign({ type: 'game_start' }, payload));
    const res = await apiReq('/api/mp/rooms/start', 'POST', payload);
    return res && res.ok ? res : { ok: true, room: activeRoom };
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
    if (Date.now() - lastServerOk < 25000 && lastServerData) {
      if (typeof onProgress === 'function') {
        onProgress({
          status: 'ready',
          attempt: 1,
          elapsed: 0,
          serverUrl: srv,
          data: lastServerData,
          message: 'Servidor operacional e conectado!'
        });
      }
      return { ok: true, data: lastServerData };
    }

    if (activeWakePromise) {
      return await activeWakePromise;
    }

    activeWakePromise = (async () => {
      try {
        const isLocal = srv.includes('localhost') || srv.includes('127.0.0.1') || srv.includes('192.168.') || srv.includes('10.') || srv.includes('172.');
        const maxAttempts = isLocal ? 3 : 18;
        const intervalMs = isLocal ? 800 : 2500;
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
                : (isLocal
                    ? `Verificando servidor local (${attempt}/${maxAttempts})...`
                    : `Acordando servidor na nuvem (${attempt}/${maxAttempts}) — aguarde ~${elapsed}s...`)
            });
          }

          try {
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const to = controller ? setTimeout(() => controller.abort(), isLocal ? 1500 : 4000) : null;
            const res = await root.fetch(srv + '/health', {
              method: 'GET',
              signal: controller ? controller.signal : undefined
            });
            if (to) clearTimeout(to);
            if (res && res.ok) {
              const data = await res.json().catch(() => ({}));
              lastServerOk = Date.now();
              lastServerData = data;
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

          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, intervalMs));
          }
        }

        if (typeof onProgress === 'function') {
          onProgress({
            status: 'timeout',
            attempt,
            serverUrl: srv,
            message: 'Rede P2P WebRTC ativa! Conecte diretamente pelo código da sala (mesmo em redes diferentes).'
          });
        }
        return { ok: false, error: 'Timeout ao conectar com o servidor' };
      } finally {
        activeWakePromise = null;
      }
    })();

    return await activeWakePromise;
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
      attachToRoomSocket();
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
    leaveRoom,
    disconnect: disconnectWebSocket,
    getActiveRoom() { return activeRoom; },
    isConnected() { return !!(ws && wsConnected); },
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
