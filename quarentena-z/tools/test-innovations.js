// Teste automatizado para as Inovações Táticas: Laboratório Alfa, Chamadas do Comandante e Clima Dinâmico
const load = require('./harness.js');
const file = process.argv[2] || './game.js';

let allOk = true;
const T = load(file);
const Z = T.ZTD;
T.frame(0);

console.log('--- 1. Validação do Laboratório Alfa (Tech Tree) ---');
if (!Array.isArray(Z.TECH_DEFS) || Z.TECH_DEFS.length !== 8) {
  console.error('FALHA: TECH_DEFS não contém 8 vantagens militares.');
  allOk = false;
} else {
  console.log('✓ 8 Vantagens Militares carregadas:', Z.TECH_DEFS.map(d => d.name).join(', '));
}

// Simula ganho de Biocélulas e compra de upgrades
const career = Z.career();
career.techPoints = 20;
career.techPerks = {};

Z.buyTechPerk('initial_coins');
Z.buyTechPerk('base_armor');
Z.buyTechPerk('tower_range');

if (career.techPerks.initial_coins !== 1 || career.techPerks.base_armor !== 1 || career.techPerks.tower_range !== 1) {
  console.error('FALHA na compra de vantagens no Laboratório Alfa.');
  allOk = false;
} else {
  console.log('✓ Upgrades comprados com sucesso. Biocélulas restantes:', career.techPoints);
}

// Verifica aplicação na partida
Z.resetGame(12345);
if (Z.G.money < Z.CFG.startMoney + 50) {
  console.error('FALHA: Suprimentos Iniciais não concederam créditos extras (+50).');
  allOk = false;
} else {
  console.log('✓ Créditos iniciais com bônus de pesquisa aplicados: $' + Z.G.money);
}

if (Z.G.life < Z.CFG.baseLife + 5) {
  console.error('FALHA: Bunker Fortificado não concedeu vida extra (+5).');
  allOk = false;
} else {
  console.log('✓ Blindagem da base fortificada com sucesso: ' + Z.G.life + ' HP');
}

// Testa Reorganização de Pesquisa (Reset de Pontos)
Z.resetTechPerks();
if (career.techPoints !== 20 || Object.keys(career.techPerks).length !== 0) {
  console.error('FALHA: Reorganização de Pesquisa não reembolsou 100% das biocélulas.');
  allOk = false;
} else {
  console.log('✓ Reorganização de Pesquisa reembolsou 100% das biocélulas sem penalidade.');
}

console.log('--- 2. Validação das Chamadas Táticas do Comandante ---');
Z.resetGame(54321);
Z.G.mode = 'play';

// Dispara Napalm
const napalmOk = Z.dispatch({ type: 'callin', callin: 'napalm' });
if (!napalmOk || Z.callinState.napalm.cd <= 0) {
  console.error('FALHA no acionamento do Bombardeio Napalm.');
  allOk = false;
} else {
  console.log('✓ Bombardeio Napalm acionado via dispatch com cooldown de:', Math.round(Z.callinState.napalm.cd) + 's');
}

// Dispara Overclock
const ocOk = Z.dispatch({ type: 'callin', callin: 'overclock' });
if (!ocOk || Z.callinState.activeOverclock <= 0) {
  console.error('FALHA no acionamento do Overclock do Reator.');
  allOk = false;
} else {
  console.log('✓ Overclock do Reator ativo com duração de:', Z.callinState.activeOverclock + 's');
}

// Dispara Barricada
const barOk = Z.dispatch({ type: 'callin', callin: 'barricade' });
if (!barOk || Z.callinState.barricades.length === 0) {
  console.error('FALHA na implantação da Barricada Eletroestática.');
  allOk = false;
} else {
  console.log('✓ Barricada Eletroestática implantada no campo. Barricadas ativas:', Z.callinState.barricades.length);
}

// Simula passo de tempo
Z.update(1.0);
if (Z.callinState.napalm.cd >= 40) {
  console.error('FALHA: Cooldown de chamadas táticas não regrediu após update.');
  allOk = false;
} else {
  console.log('✓ Cooldown e duração de chamadas regrediram perfeitamente no loop.');
}

console.log('--- 3. Validação do Clima Dinâmico de Bioma ---');
Z.WM.num = 5; // Ao enviar a próxima, vai para onda 6
Z.WM.send();

if (Z.G.weather !== 'emp_storm') {
  console.error('FALHA: Onda 6 deveria ter ativado Tempestade EMP, obteve:', Z.G.weather);
  allOk = false;
} else {
  console.log('✓ Evento Climático Tempestade EMP ativado com sucesso na Onda 6.');
}

if (!allOk) {
  console.error('\n❌ TESTES DE INOVAÇÃO FALHARAM.');
  process.exit(1);
} else {
  console.log('\n======================================================');
  console.log('🎉 TODAS AS INOVAÇÕES TÁTICAS FUNCIONANDO 100% PERFEITAS!');
  console.log('======================================================');
  process.exit(0);
}
