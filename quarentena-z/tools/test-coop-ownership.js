const path = require('path');
const assert = require('assert');
const load = require('./harness');

const { ZTD: Z } = load(path.join(__dirname, '../game.js'));
assert(Z, 'ZTD deve estar exposto');

console.log('--- 1. Inicializando partida Co-op de teste ---');
Z.COOP.active = true;
Z.COOP.isMultiplayer = true;
Z.COOP.maxPlayers = 2;
Z.COOP.mySlot = 0; // Blackfild / Host (P1)
Z.G.mode = 'play';
Z.G.money = 2000;
Z.G.paused = false;

// P1 constrói torre 1 (Atirador)
const t1 = Z.placeTower('gunner', 100, 100, 0, false, 100001);
assert(t1, 'Torre do P1 deve ter sido criada');
assert(t1.ownerSlot === 0, 't1 deve pertencer ao P1 (ownerSlot 0)');

// P2 constrói torre 2 (Domador Jurássico - remota para P1)
const t2 = Z.placeTower('dino', 200, 200, 1, true, 200001);
assert(t2, 'Torre do P2 deve ter sido criada');
assert(t2.ownerSlot === 1, 't2 deve pertencer ao P2 (ownerSlot 1)');

console.log('✓ Torres P1 (Atirador) e P2 (Domador Jurássico) criadas.');

console.log('--- 2. Testando bloqueio: P1 tentando aprimorar torre do P2 ---');
const prevTierT2 = t2.tier;
const prevMoneyP1 = Z.G.money;

// P1 tenta dar upgrade na torre do P2
const upResult = Z.dispatch({ type: 'up', id: t2.id, i: 0, path: 0 });
assert(upResult === false, 'P1 NÃO deve conseguir dar upgrade na torre do P2');
assert(t2.tier === prevTierT2, 'Tier da torre t2 não deve mudar');
assert(Z.G.money === prevMoneyP1, 'Dinheiro do P1 não deve ser gasto');
console.log('✓ Bloqueio confirmado: P1 não conseguiu dar upgrade na torre do P2.');

console.log('--- 3. Testando bloqueio: P1 tentando vender torre do P2 ---');
const sellResult = Z.dispatch({ type: 'sell', id: t2.id });
assert(sellResult === false, 'P1 NÃO deve conseguir vender a torre do P2');
assert(Z.towers.includes(t2), 'Torre t2 do P2 deve continuar no campo');
console.log('✓ Bloqueio confirmado: P1 não conseguiu vender a torre do P2.');

console.log('--- 4. Testando bloqueio: P1 tentando ativar habilidade da torre do P2 ---');
const abilityResult = Z.dispatch({ type: 'ability', id: t2.id });
assert(abilityResult === false, 'P1 NÃO deve conseguir acionar habilidade da torre do P2');
console.log('✓ Bloqueio confirmado: P1 não conseguiu ativar habilidade do Domador Jurássico do P2.');

console.log('--- 5. Testando bloqueio: P2 tentando aprimorar torre do P1 ---');
// Agora simula o cliente do P2 (mySlot = 1)
Z.COOP.mySlot = 1;
const prevTierT1 = t1.tier;
const upP2Result = Z.dispatch({ type: 'up', id: t1.id, i: 0, path: 0 });
assert(upP2Result === false, 'P2 NÃO deve conseguir dar upgrade na torre do P1');
assert(t1.tier === prevTierT1, 'Tier da torre t1 não deve mudar');
console.log('✓ Bloqueio confirmado: P2 não conseguiu dar upgrade na torre do P1.');

console.log('--- 6. Testando permissão legítima: P2 aprimora a sua própria torre ---');
const legitimateUp = Z.dispatch({ type: 'up', id: t2.id, i: 0, path: 0 });
assert(legitimateUp === true, 'P2 DEVE conseguir aprimorar a sua própria torre (t2)');
assert(t2.tier === prevTierT2 + 1, 'Torre t2 deve ter subido de nível');
console.log('✓ Permissão legítima confirmada: P2 aprimorou a sua própria torre.');

console.log('--- 7. Testando sincronização remota: comando vindo do dono legítimo ---');
// Simula comando de upgrade remoto vindo da rede para o P2
const remoteUp = Z.dispatch({ type: 'up', id: t1.id, i: 0, path: 0, remote: true });
assert(remoteUp === true, 'Comando remoto do dono DEVE ser aplicado');
assert(t1.tier === prevTierT1 + 1, 'Torre t1 deve ter sido aprimorada via comando remoto');
console.log('✓ Sincronização de rede confirmada: comandos remotos do dono são aplicados.');

console.log('\n======================================================');
console.log('🎉 TESTE DE PROPRIEDADE CO-OP PASSOU COM 100% DE SUCESSO!');
console.log('======================================================');
