/**
 * Suíte de Testes do Backend Online e Segurança Blindada (server.js) — Quarentena Z
 */
const assert = require('assert');
const { EventEmitter } = require('events');
const { server, computeRunSeal } = require('../server.js');

function mockReq(method, urlPath, body, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = urlPath;
    req.headers = Object.assign({ host: 'localhost:8080' }, customHeaders);
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      statusCode: 200,
      headers: {},
      chunks: [],
      writeHead(code, hdrs) {
        this.statusCode = code;
        if (hdrs) Object.assign(this.headers, hdrs);
      },
      end(chunk) {
        if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(this.chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: this.statusCode, headers: this.headers, body: raw, json });
      }
    };

    try {
      server.emit('request', req, res);
      process.nextTick(() => {
        if (body !== undefined && body !== null) {
          req.emit('data', Buffer.from(JSON.stringify(body)));
        }
        req.emit('end');
      });
    } catch (err) {
      reject(err);
    }
  });
}

(async () => {
  // 1. Status da API e Cabeçalhos OWASP (CSP, HSTS, X-Frame-Options, Nosniff)
  const st = await mockReq('GET', '/api/status');
  assert.strictEqual(st.status, 200);
  assert.strictEqual(st.json.ok, true);
  assert(st.headers['Content-Security-Policy'].includes("default-src 'self'"), 'CSP deve estar ativo');
  assert.strictEqual(st.headers['X-Frame-Options'], 'DENY');
  assert.strictEqual(st.headers['X-Content-Type-Options'], 'nosniff');
  assert(st.headers['Strict-Transport-Security'].includes('max-age='), 'HSTS deve estar ativo');

  // 2. Bloqueio de Path Traversal e Arquivos Internos (server.js, package.json, data/db.json)
  const blockedServer = await mockReq('GET', '/server.js');
  assert.strictEqual(blockedServer.status, 404, 'server.js NÃO pode ser exposto publicamente');
  const blockedDb = await mockReq('GET', '/data/db.json');
  assert.strictEqual(blockedDb.status, 404, 'db.json NÃO pode ser exposto publicamente');
  const blockedTraversal = await mockReq('GET', '/..%2Fpackage.json');
  assert.strictEqual(blockedTraversal.status, 404, 'Path traversal deve ser bloqueado');

  // 3. Emissão de Token Criptográfico de Sessão (HMAC-SHA256) para 2 jogadores distintos
  const sessA = await mockReq('GET', '/api/session');
  const sessB = await mockReq('GET', '/api/session');
  assert.strictEqual(sessA.status, 200);
  assert(sessA.json.clientToken && sessB.json.clientToken);
  assert.notStrictEqual(sessA.json.clientId, sessB.json.clientId);
  const tokenA = sessA.json.clientToken;
  const tokenB = sessB.json.clientToken;

  // 4. Registro legítimo no Ranking pelo Jogador A com Selo Criptográfico (sig)
  const runEntry = {
    id: 'test_sec_run_1',
    name: 'Comandante Alpha <script>',
    wave: 42,
    time: 985,
    kills: 2340,
    map: 'cratera',
    diff: 'hard'
  };
  // Nome é sanitizado contra XSS antes do selo
  const cleanEntry = Object.assign({}, runEntry, { name: 'Comandante Alpha script' });
  cleanEntry.sig = computeRunSeal(cleanEntry);

  const postLb = await mockReq('POST', '/api/leaderboard', cleanEntry, { 'x-client-token': tokenA });
  assert.strictEqual(postLb.status, 200);
  assert.strictEqual(postLb.json.ok, true);
  assert.strictEqual(postLb.json.entry.wave, 42);
  assert.strictEqual(postLb.json.entry.ownerHash, undefined, 'ownerHash nunca deve vazar na resposta pública');

  // 5. Proteção Anti-Cheat: Bloqueia assinatura adulterada, onda impossível sem kills e speedrun impossível
  const badSig = await mockReq('POST', '/api/leaderboard', Object.assign({}, cleanEntry, {
    id: 'cheat_1',
    wave: 99,
    sig: '0000000011111111'
  }), { 'x-client-token': tokenB });
  assert.strictEqual(badSig.status, 400, 'Assinatura adulterada deve ser bloqueada pelo Anti-Cheat');

  const badRatio = await mockReq('POST', '/api/leaderboard', {
    id: 'cheat_2',
    name: 'Hacker',
    wave: 50,
    time: 900,
    kills: 2,
    map: 'four',
    diff: 'normal'
  }, { 'x-client-token': tokenB });
  assert.strictEqual(badRatio.status, 400, 'Onda 50 com 2 abates deve ser bloqueada pelo Anti-Cheat');

  const badTime = await mockReq('POST', '/api/leaderboard', {
    id: 'cheat_3',
    name: 'FlashHacker',
    wave: 30,
    time: 3,
    kills: 600,
    map: 'four',
    diff: 'normal'
  }, { 'x-client-token': tokenB });
  assert.strictEqual(badTime.status, 400, 'Onda 30 em 3 segundos deve ser bloqueada pelo Anti-Cheat');

  // 6. Proteção de Propriedade: Jogador B NÃO pode deletar nem sobrescrever o recorde do Jogador A!
  const hijackDelete = await mockReq('DELETE', '/api/leaderboard/test_sec_run_1', null, { 'x-client-token': tokenB });
  assert.strictEqual(hijackDelete.status, 403, 'Jogador B não pode excluir o recorde do Jogador A');

  // 7. Proteção de Cloud Save por Propriedade
  const testPlayerName = 'Alpha_' + Date.now();
  const saveA = await mockReq('POST', '/api/cloud-save', {
    player: testPlayerName,
    career: { bestWave: 42, totalKills: 2340, games: 8, lastMap: 'cratera', lastDifficulty: 'hard' }
  }, { 'x-client-token': tokenA });
  assert.strictEqual(saveA.status, 200);

  const hijackSaveB = await mockReq('POST', '/api/cloud-save', {
    player: testPlayerName,
    career: { bestWave: 1, totalKills: 0, games: 0 }
  }, { 'x-client-token': tokenB });
  assert.strictEqual(hijackSaveB.status, 403, 'Jogador B não pode sobrescrever o Cloud Save do Jogador A');

  // 8. O próprio Jogador A consegue excluir seu próprio registro normalmente
  const validDelete = await mockReq('DELETE', '/api/leaderboard/test_sec_run_1', null, { 'x-client-token': tokenA });
  assert.strictEqual(validDelete.status, 200);
  assert.strictEqual(validDelete.json.ok, true);

  // 9. DRM Comercial (Estilo Steam): Geração, Ativação e Bloqueio de Chave Falsificada
  const genLic = await mockReq('POST', '/api/license/generate', { count: 1, edition: 'PRO' });
  assert.strictEqual(genLic.status, 200);
  assert.strictEqual(genLic.json.ok, true);
  const validKey = genLic.json.keys[0];
  assert(/^QZ19-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(validKey), 'Formato de chave comercial QZ19 válido');

  const fakeLic = await mockReq('POST', '/api/license/activate', { key: 'QZ19-AAAA-BBBB-CCCC-DDDD' }, { 'x-client-token': tokenB });
  assert.strictEqual(fakeLic.status, 400, 'Chave pirata/adulterada deve ser rejeitada pelo verificador HMAC');

  const actLic = await mockReq('POST', '/api/license/activate', { key: validKey }, { 'x-client-token': tokenA });
  assert.strictEqual(actLic.status, 200);
  assert.strictEqual(actLic.json.licensed, true);
  assert.strictEqual(actLic.json.edition, 'PRO');
  assert(actLic.json.licenseToken, 'Deve emitir licenseToken assinado');

  const licStatus = await mockReq('GET', '/api/license/status', null, {
    'x-client-token': tokenA,
    'x-license-token': actLic.json.licenseToken
  });
  assert.strictEqual(licStatus.status, 200);
  assert.strictEqual(licStatus.json.licensed, true);
  assert.strictEqual(licStatus.json.edition, 'PRO');

  // 10. Ticket Autoritativo de Partida (/api/run/start) e Bloqueio de Ticket Adulterado
  const runStart = await mockReq('POST', '/api/run/start', { map: 'four', diff: 'normal', seed: 12345 }, { 'x-client-token': tokenA });
  assert.strictEqual(runStart.status, 200);
  assert(runStart.json.runTicket, 'Deve emitir runTicket assinado');

  const forgedTicketRun = Object.assign({}, cleanEntry, {
    id: 'forged_ticket_run',
    runTicket: runStart.json.runTicket + 'tampered'
  });
  forgedTicketRun.sig = computeRunSeal(forgedTicketRun);
  const badTicketRes = await mockReq('POST', '/api/leaderboard', forgedTicketRun, { 'x-client-token': tokenA });
  assert.strictEqual(badTicketRes.status, 400, 'Ticket de partida adulterado deve ser bloqueado');

  // 11. Whitelist de Módulos e Assets Visuais (Torre e Upgrades SVG)
  const modVault = await mockReq('GET', '/modules/security-vault.js');
  assert.strictEqual(modVault.status, 200, 'Módulo security-vault.js deve ser servido com 200 OK');
  const svgDino = await mockReq('GET', '/assets/towers/dino.svg');
  assert.strictEqual(svgDino.status, 200, 'Sprite SVG da torre dino deve ser servido com 200 OK');
  const svgUp = await mockReq('GET', '/assets/upgrades/path0-lv1.svg');
  assert.strictEqual(svgUp.status, 200, 'Ícone circular SVG de upgrade deve ser servido com 200 OK');

  // 12. Contas de Usuários e Conquistas em Nuvem (/api/auth/profile)
  const profRes = await mockReq('POST', '/api/auth/profile', {
    player: 'Comandante_Alpha',
    bestWave: 45,
    totalKills: 3200,
    games: 12,
    achievements: { first_blood: Date.now(), wave40: Date.now() },
    medals: { four: { normal: true, hard: true } }
  }, { 'x-client-token': tokenA });
  assert.strictEqual(profRes.status, 200);
  assert.strictEqual(profRes.json.ok, true);
  assert.strictEqual(profRes.json.profile.bestWave, 45);

  // 13. Esquema Multiplayer: Criação de Sala, Pareamento (Matchmaking) e Sincronização de Ondas
  const mpCreate = await mockReq('POST', '/api/mp/rooms', {
    name: 'Sala Tática Alfa',
    mode: 'coop',
    map: 'metro',
    diff: 'hard',
    maxPlayers: 2,
    playerName: 'Alpha'
  }, { 'x-client-token': tokenA });
  assert.strictEqual(mpCreate.status, 200);
  assert.strictEqual(mpCreate.json.ok, true);
  const room = mpCreate.json.room;
  assert(room.roomId && room.roomCode, 'Deve gerar roomId e roomCode');

  const mpJoin = await mockReq('POST', '/api/mp/rooms/join', {
    roomCode: room.roomCode,
    playerName: 'Bravo'
  }, { 'x-client-token': tokenB });
  assert.strictEqual(mpJoin.status, 200);
  assert.strictEqual(mpJoin.json.room.players.length, 2, 'Sala deve ter 2 jogadores pareados');
  assert.strictEqual(mpJoin.json.room.status, 'playing', 'Sala deve iniciar ao parear 2 jogadores');

  // 14. Validação Server-Side de Comandos Multiplayer (/api/mp/sync)
  const validSync = await mockReq('POST', '/api/mp/sync', {
    roomId: room.roomId,
    wave: 5,
    tick: 1200,
    stateHash: 987654321,
    commands: [{ type: 'place', key: 'dino', x: 320, y: 240 }]
  }, { 'x-client-token': tokenA });
  assert.strictEqual(validSync.status, 200);
  assert.strictEqual(validSync.json.wave, 5);

  const invalidSync = await mockReq('POST', '/api/mp/sync', {
    roomId: room.roomId,
    wave: 5,
    tick: 1210,
    commands: [{ type: 'place', key: 'dino', x: -9999, y: 99999 }]
  }, { 'x-client-token': tokenB, 'x-forwarded-for': '10.0.0.99' });
  assert.strictEqual(invalidSync.status, 400, 'Coordenadas fora do mapa devem ser bloqueadas pelo servidor');

  // 15. Placar Multiplayer Cooperativo & Módulo AppSec Digital Signature
  const mpScore = await mockReq('POST', '/api/mp/scores', {
    roomId: room.roomId,
    mode: 'coop',
    map: 'metro',
    diff: 'hard',
    teamNames: 'Alpha & Bravo',
    wave: 40,
    kills: 2850,
    durationSec: 1120
  }, { 'x-client-token': tokenA });
  assert.strictEqual(mpScore.status, 200);
  assert.strictEqual(mpScore.json.ok, true);

  require('../modules/security-vault.js');
  const sec = global.QZ_SECURITY;
  assert(sec, 'Módulo QZ_SECURITY deve estar carregado');
  const sig1 = sec.computeDigitalSignature('career', { bestWave: 40, totalKills: 2500 });
  assert(sec.verifyDigitalSignature('career', { bestWave: 40, totalKills: 2500 }, sig1), 'Assinatura digital deve validar dados íntegros');
  assert(!sec.verifyDigitalSignature('career', { bestWave: 999, totalKills: 2500 }, sig1), 'Assinatura digital deve detectar e bloquear adulteração');

  const vault = sec.createAntiCheatVault();
  const mockG = { money: 650, life: 100, kills: 12 };
  const mockWM = { num: 3 };
  vault.sync(mockG.money, mockG.life, mockWM.num, mockG.kills, 1.0);
  mockG.money = 999999; // Tentativa de edição via console
  const vCheck = vault.verifyAndRestore(mockG, mockWM);
  assert.strictEqual(vCheck.tampered, true, 'Deve detectar adulteração de saldo via console');
  assert.strictEqual(mockG.money, 650, 'Deve restaurar o saldo legítimo do cofre fechado');

  console.log('TEST-BACKEND SECURITY PASS (100% — Steam-Grade DRM, HMAC-SHA256, Multiplayer, Cloud DB, Anti-Cheat Vault, Assinatura Digital e CSP verificados)');
})();
