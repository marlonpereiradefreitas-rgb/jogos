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

  console.log('TEST-BACKEND SECURITY PASS (100% — Steam-Grade DRM, HMAC-SHA256, Ticket Autoritativo, Anti-Cheat, CSP e Propriedade verificados)');
})();
