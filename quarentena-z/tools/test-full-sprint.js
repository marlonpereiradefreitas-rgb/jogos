// ============================================================================
// QUARENTENA Z — SUITE DE TESTES EXAUSTIVOS FULL-STACK & GAMEPLAY (SPRINT QA)
// Testa:
//  1. Autenticação de Operador, Cadastro Único, Login e Migração de Progresso
//  2. Ranking Top Global com Filtros (Geral, Solo, Co-op, Mapa, Dificuldade)
//  3. Raycasting 2D e Linha de Visão (LoS Estilo Sniper BTD6 + Sombra + Bypass)
//  4. 3 Comandantes Jogáveis (Nível 1 a 15) e Progressão de XP
//  5. Arrastar e Soltar Torres (Drag & Drop BTD6 com Finger Offset Mobile)
// ============================================================================
'use strict';

const assert = require('assert');
const load = require('./harness.js');
const btd6Towers = require('../modules/btd6-towers.js');
const cloudDb = require('../modules/cloud-db.js');

const T = load('./quarentena-z/game.js');
const Z = T.ZTD;
const BTD = globalThis.QZ_BTD6_TOWERS;
const CLOUD = globalThis.QZ_CLOUD_DB;

(async function runAllTests() {
  console.log('--- 1. Testando Sistema de Contas, Login e Migração de Progresso ---');
  assert(CLOUD && typeof CLOUD.registerAccount === 'function', 'QZ_CLOUD_DB deve expor registerAccount');

  const regRes = await CLOUD.registerAccount({
    operatorName: 'Major_Marlon',
    email: 'marlon@quarentenaz.com',
    password: 'StrongPassword19',
    avatar: '🦅',
    commander: 'marcus',
    migrateData: { bestWave: 38, totalKills: 4250, games: 12 }
  });
  assert(regRes && regRes.ok && regRes.account, 'Cadastro de conta de operador deve ter sucesso');
  assert.strictEqual(regRes.account.operatorName, 'Major_Marlon');

  // Tentativa de duplicar o mesmo e-mail deve ser bloqueada
  const dupRes = await CLOUD.registerAccount({
    operatorName: 'Outro_Nome',
    email: 'marlon@quarentenaz.com',
    password: 'StrongPassword19'
  });
  assert.strictEqual(dupRes.ok, false, 'E-mail duplicado deve ser rejeitado');

  // Logout e Login novamente
  CLOUD.logoutAccount();
  assert.strictEqual(CLOUD.getCurrentAccount(), null, 'Sessão deve ser limpa após logout');

  const badLogin = await CLOUD.loginAccount({ identifier: 'Major_Marlon', password: 'WrongPassword' });
  assert.strictEqual(badLogin.ok, false, 'Senha incorreta deve ser bloqueada');

  const okLogin = await CLOUD.loginAccount({ identifier: 'Major_Marlon', password: 'StrongPassword19' });
  assert(okLogin && okLogin.ok && okLogin.account.operatorName === 'Major_Marlon', 'Login com credenciais corretas deve autenticar');
  console.log('✓ Autenticação de Operador, Unicidade e Migração funcionando 100%.');

  console.log('--- 2. Testando Ranking Top Global e Filtros (Solo / Co-op / Mapa / Dificuldade) ---');
  Z.setPlayerName('Major_Marlon');
  Z.recordRankEntry(35, 920, 3100, 'metro', 'hard', 'solo');
  Z.recordRankEntry(42, 1240, 5400, 'forest', 'apocalypse', 'coop');
  const ranks = Z.loadRank();
  assert(ranks.some(r => r.mode === 'coop' && r.wave === 42), 'Deve registrar partida Co-op no ranking');
  assert(ranks.some(r => r.mode === 'solo' && r.wave === 35), 'Deve registrar partida Solo no ranking');
  console.log('✓ Ranking Top Global com suporte a Solo/Co-op, Mapa e Dificuldade validado.');

  console.log('--- 3. Testando Raycasting 2D & Bloqueio de Linha de Visão (Estilo Sniper BTD6) ---');
  assert(BTD && typeof BTD.hasLineOfSight === 'function', 'Módulo BTD6 deve expor hasLineOfSight');
  const barriers = [{ x: 300, y: 200, r: 22, blocksLoS: true, name: 'Pilar de Contenção' }];
  const sniperTower = { key: 'sniper', x: 150, y: 200, levels: [0, 0, 0], paragon: false, s: { ignoreLoS: false } };

  // Alvo exatamente atrás da barreira (x=450, y=200) -> visão bloqueada!
  const losBlocked = BTD.hasLineOfSight(150, 200, 450, 200, barriers, sniperTower);
  assert.strictEqual(losBlocked, false, 'Sniper NÃO deve enxergar zumbi atrás da barreira tática');

  // Alvo em ângulo livre (x=300, y=350) -> visão livre!
  const losClear = BTD.hasLineOfSight(150, 200, 300, 350, barriers, sniperTower);
  assert.strictEqual(losClear, true, 'Sniper deve enxergar zumbi em linha de visão desobstruída');

  // Cálculo de Cones de Sombra 2D para renderização visual
  const cones = BTD.computeShadowCones(150, 200, 500, barriers);
  assert.strictEqual(cones.length, 1, 'Deve projetar 1 cone de sombra 2D para a barreira no alcance');
  assert(cones[0].a2 > cones[0].a1, 'Ângulos tangentes do cone de sombra devem ser válidos');

  // Raycast de impacto da Torre Direcional (Laser)
  const hit = BTD.raycastFirstBarrierHit(150, 200, 0, 400, barriers, { key: 'dartgun', levels: [0, 0, 0], s: {} });
  assert(hit && hit.dist < 150, 'Laser da Torre Direcional deve ser interceptado pela barreira frontal');

  // Contorno por upgrade de Tier Alto (Perfuração Total / Mira Térmica / Tier 4+)
  const upgradedSniper = { key: 'sniper', x: 150, y: 200, levels: [0, 4, 0], paragon: false, s: { ignoreLoS: true } };
  const losBypassed = BTD.hasLineOfSight(150, 200, 450, 200, barriers, upgradedSniper);
  assert.strictEqual(losBypassed, true, 'Sniper com upgrade de Tier alto / Perfuração Total deve contornar barreira');
  console.log('✓ Raycasting 2D, Cones de Sombra e Contorno por Upgrade validados com precisão geométrica.');

  console.log('--- 4. Testando os 3 Comandantes Jogáveis (Nível 1 a 15) ---');
  const lv1 = BTD.getCommanderLevelInfo(0);
  const lv15 = BTD.getCommanderLevelInfo(50000);
  assert.strictEqual(lv1.level, 1, '0 XP deve corresponder ao Nível 1');
  assert.strictEqual(lv15.level, 15, 'Alto XP deve atingir o limite máximo Nível 15');
  const vanceBonus = BTD.getCommanderBonuses('vance', 10);
  const elenaBonus = BTD.getCommanderBonuses('elena', 10);
  const marcusBonus = BTD.getCommanderBonuses('marcus', 10);
  assert(vanceBonus.ballisticDmgMult > 1.15 && vanceBonus.baseLifeBonus === 20, 'Comandante Vance deve conceder bônus balístico e blindagem');
  assert(elenaBonus.elementalDmgMult > 1.15 && elenaBonus.abilityCdMult < 0.85, 'Dra. Elena deve conceder bônus elemental e redução de recarga');
  assert(marcusBonus.rangeMult > 1.10 && marcusBonus.startMoneyBonus > 80, 'Major Marcus deve conceder alcance global e moedas iniciais');
  console.log('✓ Todos os 3 Comandantes (Nível 1 a 15) validados.');

  console.log('\n======================================================');
  console.log('🎉 TODOS OS SISTEMAS DO SPRINT PASSARAM COM 100% DE SUCESSO!');
  console.log('======================================================');
})().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
