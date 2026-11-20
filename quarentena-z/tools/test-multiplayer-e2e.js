const http = require('http');
const net = require('net');
const crypto = require('crypto');
const path = require('path');
const { server, DB } = require(path.join(__dirname, '..', 'server.js'));

const PORT = 3888;

function encodeWsFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function decodeServerFrame(buf) {
  if (buf.length < 2) return null;
  const lenByte = buf[1] & 0x7F;
  let offset = 2;
  let payloadLen = lenByte;
  if (lenByte === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (lenByte === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  if (buf.length < offset + payloadLen) return null;
  const payload = buf.slice(offset, offset + payloadLen);
  return { text: payload.toString('utf8'), remaining: buf.slice(offset + payloadLen) };
}

function createWsClient(name, onMessage) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.createConnection({ port: PORT, host: '127.0.0.1' }, () => {
      const req = [
        'GET /ws HTTP/1.1',
        'Host: 127.0.0.1:' + PORT,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + key,
        'Sec-WebSocket-Version: 13',
        '\r\n'
      ].join('\r\n');
      socket.write(req);
    });

    let upgraded = false;
    let rxBuf = Buffer.alloc(0);

    socket.on('data', chunk => {
      if (!upgraded) {
        const s = chunk.toString('utf8');
        if (s.includes('101 Switching Protocols')) {
          upgraded = true;
          const idx = chunk.indexOf(Buffer.from('\r\n\r\n'));
          if (idx !== -1 && idx + 4 < chunk.length) {
            rxBuf = chunk.slice(idx + 4);
          }
          resolve({
            send(obj) {
              socket.write(encodeWsFrame(JSON.stringify(obj)));
            },
            close() {
              socket.destroy();
            }
          });
          return;
        }
      }
      rxBuf = Buffer.concat([rxBuf, chunk]);
      while (rxBuf.length >= 2) {
        const fr = decodeServerFrame(rxBuf);
        if (!fr) break;
        rxBuf = fr.remaining;
        try {
          const msg = JSON.parse(fr.text);
          onMessage(msg);
        } catch (_) {}
      }
    });

    socket.on('error', reject);
  });
}

function reqApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTest() {
  server.listen(PORT, '127.0.0.1');
  await new Promise(r => setTimeout(r, 200));

  console.log('--- 1. Health check ---');
  const h = await reqApi('GET', '/health');
  if (h.status !== 'ok') throw new Error('Health check failed');
  console.log('✓ Health check OK:', h.status, 'Port:', h.port);

  console.log('--- 2. Host cria sala ---');
  const created = await reqApi('POST', '/api/mp/rooms', {
    name: 'Sala Teste 2PCs',
    roomCode: 'QZ-TEST99',
    mode: 'coop',
    division: 'sectors',
    map: 'metro',
    diff: 'hard',
    playerName: 'PC1_Host'
  });
  if (!created.ok || !created.room) throw new Error('Falha ao criar sala');
  console.log('✓ Sala criada:', created.room.roomCode);

  const c1Messages = [];
  const c2Messages = [];

  const wsHost = await createWsClient('Host', m => {
    c1Messages.push(m);
  });
  wsHost.send({
    type: 'join_room',
    roomId: created.room.roomId,
    roomCode: created.room.roomCode,
    slot: 0,
    playerName: 'PC1_Host'
  });
  await new Promise(r => setTimeout(r, 100));

  console.log('--- 3. Guest entra na sala ---');
  const joined = await reqApi('POST', '/api/mp/rooms/join', {
    roomCode: 'QZ-TEST99',
    playerName: 'PC2_Guest'
  });
  if (!joined.ok || joined.slot !== 1) throw new Error('Falha ao entrar na sala como slot 1');
  console.log('✓ Convidado entrou no slot:', joined.slot);

  const wsGuest = await createWsClient('Guest', m => {
    c2Messages.push(m);
  });
  wsGuest.send({
    type: 'join_room',
    roomId: joined.room.roomId,
    roomCode: joined.room.roomCode,
    slot: 1,
    playerName: 'PC2_Guest'
  });
  await new Promise(r => setTimeout(r, 100));

  console.log('--- 4. Sincronização de Prontidão ---');
  wsGuest.send({ type: 'player_ready', slot: 1, ready: true });
  await new Promise(r => setTimeout(r, 100));
  const readyRcv = c1Messages.find(m => m.type === 'player_ready' && m.slot === 1);
  if (!readyRcv) throw new Error('Host não recebeu player_ready do Guest');
  console.log('✓ Host recebeu confirmação de Convidado Pronto!');

  console.log('--- 5. Posicionamento de Torre com ID Determinístico ---');
  wsHost.send({
    type: 'cmd_broadcast',
    command: { type: 'place', key: 'gunner', x: 200, y: 300, tid: 100001, playerSlot: 0 }
  });
  await new Promise(r => setTimeout(r, 100));
  const placeRcv = c2Messages.find(m => m.type === 'cmd_broadcast' && m.command && m.command.tid === 100001);
  if (!placeRcv) throw new Error('Guest não recebeu posicionamento de torre com tid');
  console.log('✓ Guest recebeu torre com TID sincronizado:', placeRcv.command.tid);

  console.log('--- 6. Doação Percentual de Moedas (50%) do Guest para o Host ---');
  wsGuest.send({
    type: 'coop_donate',
    fromSlot: 1,
    toSlot: 0,
    pct: 0.50,
    amount: 500,
    balance: 1000
  });
  await new Promise(r => setTimeout(r, 100));
  const donateRcv = c1Messages.find(m => m.type === 'coop_donate' && m.fromSlot === 1);
  if (!donateRcv || donateRcv.amount !== 500) throw new Error('Host não recebeu doação de 500 moedas');
  console.log('✓ Host recebeu doação de:', donateRcv.amount, 'moedas do Aliado P2!');

  console.log('--- 7. Alerta Tático na Pista (Ping) ---');
  wsHost.send({
    type: 'coop_ping',
    x: 480,
    y: 320,
    kind: 'danger',
    sender: 'PC1_Host'
  });
  await new Promise(r => setTimeout(r, 100));
  const pingRcv = c2Messages.find(m => m.type === 'coop_ping' && m.kind === 'danger');
  if (!pingRcv) throw new Error('Guest não recebeu ping tático');
  console.log('✓ Guest recebeu alerta tático na pista em x:', pingRcv.x, 'y:', pingRcv.y);

  console.log('--- 8. Início Simultâneo de Partida pelo Host ---');
  const startRes = await reqApi('POST', '/api/mp/rooms/start', {
    roomCode: 'QZ-TEST99',
    seed: 20261120,
    map: 'metro',
    diff: 'hard',
    division: 'sectors'
  });
  if (!startRes.ok) throw new Error('Falha ao iniciar partida via REST');
  await new Promise(r => setTimeout(r, 100));
  const startRcv1 = c1Messages.find(m => m.type === 'game_start');
  const startRcv2 = c2Messages.find(m => m.type === 'game_start');
  if (!startRcv1 || !startRcv2 || startRcv1.seed !== startRcv2.seed) {
    throw new Error('Falha no início sincronizado da partida com a mesma semente');
  }
  console.log('✓ Ambas as máquinas iniciaram a partida com a semente idêntica:', startRcv1.seed);

  wsHost.close();
  wsGuest.close();
  server.close();
  console.log('\n======================================================');
  console.log('🎉 SUCESSO TOTAL: 2 PCs comunicando e sincronizando 100%');
  console.log('======================================================');
}

runTest().catch(err => {
  console.error('FALHA NO TESTE MULTIPLAYER:', err);
  process.exit(1);
});
