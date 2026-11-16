// Teste automatizado do Pacote de Expansão & Balanceamento BTD6
const assert = require('assert');
const load = require('./harness');
const file = process.argv[2] || 'quarentena-z/game.js';
const T = load(file), Z = T.ZTD;
let simNow = 0;
const errs = [];
const step = (n = 1) => {
  for (let i = 0; i < n; i++) {
    simNow += 16;
    try { T.frame(simNow); } catch (e) { errs.push(e.message); }
  }
};
step(2);

// 1. Verificar balanceamento da Torre de Gelo e Ascensão
assert(Z.TOWERS.ice.cost >= 310, 'Custo base da Torre de Gelo deve ter sido aumentado');
assert(Z.TOWERS.ice.base.slow <= 0.28, 'Lentidão base da Torre de Gelo reduzida');
assert(Z.CFG.waveBonusBase <= 36 && Z.CFG.waveBonusPer <= 6, 'Economia restrita ativa nos bônus de onda');

// 2. Verificar Boss de Alta Velocidade (speedboss) e resistência a lentidão vs vulnerabilidade a Stun
assert(Z.ZOMBIES.speedboss && Z.ZOMBIES.speedboss.speedBoss, 'Boss de alta velocidade (speedboss) registrado');
const sbWave15 = Z.buildWave(15);
assert(sbWave15.some(e => e.type === 'speedboss'), 'Onda 15 deve conter o PREDADOR VELOZ (speedboss)');

Z.resetGame(20261116);
Z.G.money = 999999;

// 3. Testar Obstáculos Destrutíveis no Mapa
assert(Z.obstacles.length >= 3, 'Mapa deve iniciar com obstáculos destrutíveis');
const obs0 = Z.obstacles[0];
const blockedBefore = Z.validSpot(obs0.x, obs0.y);
assert(blockedBefore && blockedBefore.includes('Obstáculo'), 'Obstáculo deve bloquear construção antes de ser demolido');
const cleared = Z.dispatch({ type: 'clearObs', id: obs0.id });
assert(cleared === true && obs0.cleared === true, 'Obstáculo deve ser demolido mediante pagamento em moedas');

// 4. Testar as 4 Novas Torres BTD6 (dartgun, dino, minefactory, portal)
const spots = [];
for (let gx = 60; gx <= 780 && spots.length < 6; gx += 48) {
  for (let gy = 60; gy <= 560 && spots.length < 6; gy += 48) {
    if (!Z.validSpot(gx, gy)) spots.push([gx, gy]);
  }
}
assert(spots.length >= 4, 'Deve encontrar posições livres para as 4 novas torres');

const tDart = Z.dispatch({ type: 'place', key: 'dartgun', x: spots[0][0], y: spots[0][1] });
const tDino = Z.dispatch({ type: 'place', key: 'dino', x: spots[1][0], y: spots[1][1] });
const tMine = Z.dispatch({ type: 'place', key: 'minefactory', x: spots[2][0], y: spots[2][1] });
const tPortal = Z.dispatch({ type: 'place', key: 'portal', x: spots[3][0], y: spots[3][1] });
assert(tDart && tDino && tMine && tPortal, 'Todas as 4 novas torres devem ser posicionadas com sucesso');

// Mudar mira travada da Torre Direcional (dartgun)
assert(Z.dispatch({ type: 'aim', id: tDart.id, x: 450, y: 300 }) === true, 'Deve atualizar ponto de mira da dartgun');
assert(tDart.aimX === 450 && tDart.aimY === 300, 'Coordenadas de mira travadas corretamente');

// Definir saída do Portal Tático
assert(Z.dispatch({ type: 'portal_exit', id: tPortal.id, x: 120, y: 150 }) === true, 'Deve definir saída do portal na pista');

// Evoluir as novas torres e verificar atualização dinâmica de nível e retrato/skin
for (const tw of [tDart, tDino, tMine, tPortal]) {
  Z.select(tw);
  Z.refreshPanel();
  for (let lv = 0; lv < 5; lv++) {
    const prevTier = tw.tier;
    assert(Z.dispatch({ type: 'up', id: tw.id, i: 0, path: 0 }) === true, 'Upgrade nível ' + (lv + 1) + ' da torre ' + tw.key);
    assert(tw.tier === prevTier + 1, 'Tier deve avançar a cada upgrade');
    Z.refreshPanel();
  }
  assert(tw.tier === 5, 'Torre ' + tw.key + ' deve atingir nível 5');
}

// Verificar Painel de Inspeção Dinâmico BTD6 (Retrato, Abates, Ícones Circulares, Botão Retrátil e Venda)
const fs = require('fs');
const path = require('path');
const assetsBase = path.join(__dirname, '..', 'assets');
assert(fs.existsSync(path.join(assetsBase, 'towers', 'dino.svg')), 'Imagem exclusiva de torre dino.svg deve existir em assets/towers');
assert(fs.existsSync(path.join(assetsBase, 'towers', 'dartgun-tier5.svg')), 'Skin evoluída dartgun-tier5.svg deve existir em assets/towers');
assert(fs.existsSync(path.join(assetsBase, 'upgrades', 'path0-lv1.svg')), 'Ícone circular path0-lv1.svg deve existir em assets/upgrades');
assert(fs.existsSync(path.join(assetsBase, 'upgrades', 'path2-lv5.svg')), 'Ícone circular path2-lv5.svg deve existir em assets/upgrades');
Z.select(tDino);
Z.refreshPanel();
assert(typeof Z.getTowerPortrait(tDino) === 'string', 'Retrato dinâmico da torre deve ser gerado');
assert(tDino._dino && typeof tDino._dino.roarT === 'number', 'Dinossauro deve possuir estados de caminhada, mordida e rugido sísmico');

// Iniciar onda e simular combate com Dinossauro, Aliados, Minas com Stun e Portal Tático
Z.dispatch({ type: 'wave' });
step(5);
assert(Z.mines.length > 0, 'Usina de Minas deve lançar minas acumuláveis na pista');
assert(Z.allies.length > 0 || tDino._dino, 'Domador Jurássico deve comandar Dinossauro e aliados');

// Testar Boss de Alta Velocidade contra Stun e Portal Tático
Z.WM.queue.unshift({ t: Z.WM.clock, type: 'speedboss', wave: 15 });
step(4);
const speedBossInstance = Z.zombies.find(z => z.type === 'speedboss');
assert(speedBossInstance, 'Instância de speedboss deve estar ativa na pista');
speedBossInstance.dist = 420;
speedBossInstance.place();

// Aplicar Stun diretamente (como explosão de mina) e verificar paralisia
Z.stunZ(speedBossInstance, 1.2);
assert(speedBossInstance.stunT > 0.8, 'Speedboss deve ser atordoado por minas de stun');

// Acionar habilidade ativa do Portal Tático e da Investida Jurássica
tPortal.x = speedBossInstance.x;
tPortal.y = speedBossInstance.y;
const distBeforePortal = speedBossInstance.dist;
assert(Z.dispatch({ type: 'ability', id: tPortal.id }) === true, 'Habilidade ativa Portal Tático acionada');
assert(speedBossInstance.dist < distBeforePortal, 'Portal Tático deve recuar o chefe veloz na pista');
assert(Z.dispatch({ type: 'ability', id: tDino.id }) === true, 'Habilidade ativa Investida Jurássica acionada');

step(10);
assert(errs.length === 0, 'Zero erros de frame durante simulação completa BTD6: ' + errs.join('; '));
console.log('TESTE BTD6 EXPANSION OK: 4 novas torres, speedboss, minas com stun, portal tático, obstáculos e balanceamento validados com zero erros.');
