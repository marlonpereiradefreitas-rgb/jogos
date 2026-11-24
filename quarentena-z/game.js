
// Quarentena Z

/* =====================================================================
   ZOMBIE TOWER DEFENSE — game.js
   JavaScript puro + Canvas 2D. Sem dependências externas.

   Índice:
    1. Configuração (balanceamento centralizado)
    2. Caminho do mapa e utilitários
    3. Fundo (pixel art gerada por código)
    4. Estado da partida e entidades
    5. Efeitos visuais (FX) e sons (Snd)
    6. Dano, status e explosões
    7. Zumbi, Torre, Projétil (classes)
    8. Gerenciador de ondas (WM) e poderes (Powers)
    9. Atualização (loop de simulação)
   10. Renderização
   11. Interface (DOM) e entrada do jogador
   12. Loop principal e inicialização
   ===================================================================== */
(function () {
'use strict';

// Blindagem global contra falhas não tratadas, extensões de terceiros ou falhas de áudio
if (typeof window !== 'undefined') {
  window.onerror = function (msg, url, line, col, err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Quarentena-Z Guard]', msg, url, line);
    }
    return true;
  };
  window.addEventListener('unhandledrejection', function (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Quarentena-Z Rejection Guard]', e.reason);
    }
    e.preventDefault();
  });
}

/* ===================== LABORATÓRIO MILITAR ALFA (TECH TREE) ===================== */
const TECH_DEFS = [
  { id: 'initial_coins', name: 'Suprimentos Iniciais', ico: '💰', max: 5, cost: [1, 2, 3, 4, 5], desc: l => 'Comece partidas com +$' + (l * 50) + ' créditos de combate adicionais.' },
  { id: 'sell_refund', name: 'Logística de Desmonte', ico: '♻️', max: 5, cost: [1, 2, 3, 4, 5], desc: l => 'Aumenta o reembolso ao vender torres em +' + (l * 3) + '% (até +15%).' },
  { id: 'crit_chance', name: 'Munição Perfurante', ico: '🎯', max: 5, cost: [2, 3, 4, 5, 6], desc: l => '+' + (l * 2) + '% de chance de acerto crítico (2x dano) para todas as torres.' },
  { id: 'tower_range', name: 'Radares Amplificados', ico: '📡', max: 5, cost: [2, 3, 4, 5, 6], desc: l => '+' + (l * 3) + '% de alcance de detecção e disparo para todas as torres.' },
  { id: 'base_armor', name: 'Bunker Fortificado', ico: '🛡️', max: 5, cost: [1, 2, 3, 4, 5], desc: l => 'Aumenta a vida máxima inicial da base em +' + (l * 5) + ' pontos de blindagem.' },
  { id: 'emergency_cash', name: 'Financiamento de Crise', ico: '🚨', max: 3, cost: [3, 5, 7], desc: l => 'Ao sofrer dano no perímetro, receba imediatamente +$' + (l === 1 ? 75 : l === 2 ? 150 : 250) + ' moedas (1x por onda).' },
  { id: 'elemental_combo', name: 'Sinergia Elemental', ico: '⚡', max: 5, cost: [2, 3, 4, 5, 6], desc: l => '+' + (l * 8) + '% de dano extra em reações de Vapor Tóxico, Supercondutor e Explosão Térmica.' },
  { id: 'callin_cdr', name: 'Comunicações Militares', ico: '📻', max: 5, cost: [2, 3, 4, 5, 6], desc: l => 'Reduz em -' + (l * 5) + '% o tempo de recarga das Chamadas Táticas do Comandante.' }
];

function getTechBonus(id) {
  if (typeof career === 'undefined' || !career.techPerks) return 0;
  return career.techPerks[id] || 0;
}

function resetTechPerks() {
  if (typeof career === 'undefined') return;
  career.techPerks = career.techPerks || {};
  let refunded = 0;
  for (const def of TECH_DEFS) {
    const lvl = career.techPerks[def.id] || 0;
    for (let i = 0; i < lvl; i++) refunded += def.cost[i] || 1;
  }
  career.techPoints = (career.techPoints || 0) + refunded;
  career.techPerks = {};
  saveCareer();
  renderTechScreen();
  updateHomeStats();
  toast('Pesquisa reorganizada: +' + refunded + ' biocélulas devolvidas!', 'good');
}

function buyTechPerk(perkId) {
  if (typeof career === 'undefined') return;
  const def = TECH_DEFS.find(d => d.id === perkId);
  if (!def) return;
  career.techPerks = career.techPerks || {};
  const currentLvl = career.techPerks[perkId] || 0;
  if (currentLvl >= def.max) return;
  const cost = def.cost[currentLvl] || 1;
  if ((career.techPoints || 0) < cost) {
    toast('Biocélulas insuficientes para esta pesquisa!', 'bad');
    return;
  }
  career.techPoints -= cost;
  career.techPerks[perkId] = currentLvl + 1;
  saveCareer();
  renderTechScreen();
  updateHomeStats();
  Snd.play('upgrade');
  toast('Pesquisa concluída: ' + def.name + ' Nível ' + (currentLvl + 1) + '!', 'good');
}

function renderTechScreen() {
  if (typeof document === 'undefined') return;
  const screen = $('techScreen');
  if (!screen) return;
  const tp = (typeof career !== 'undefined' && career.techPoints) ? career.techPoints : 0;
  if ($('techPointsDisplay')) $('techPointsDisplay').textContent = tp + ' 🔬';
  const grid = $('techGrid');
  if (!grid) return;
  const perks = (typeof career !== 'undefined' && career.techPerks) ? career.techPerks : {};
  let html = '';
  for (const def of TECH_DEFS) {
    const curLvl = perks[def.id] || 0;
    const isMax = curLvl >= def.max;
    const nextCost = isMax ? 0 : (def.cost[curLvl] || 1);
    const canAfford = !isMax && tp >= nextCost;

    let pipsHtml = '';
    for (let i = 0; i < def.max; i++) {
      pipsHtml += '<div class="tc-pip' + (i < curLvl ? ' filled' : '') + '"></div>';
    }

    const descTxt = def.desc(Math.max(1, curLvl));
    const btnTxt = isMax ? 'MÁXIMO ALCANÇADO ✓' : ('PESQUISAR (NÍVEL ' + (curLvl + 1) + ') · ' + nextCost + ' 🔬');

    html += '<div class="tech-card' + (isMax ? ' maxed' : '') + '">';
    html += '<div class="tc-top">';
    html += '<div class="tc-icon">' + def.ico + '</div>';
    html += '<div class="tc-title-wrap">';
    html += '<div class="tc-name">' + def.name + '</div>';
    html += '<div class="tc-tier-label">' + (isMax ? 'DOMINADO' : ('NÍVEL ' + curLvl + ' / ' + def.max)) + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="tc-desc">' + descTxt + '</div>';
    html += '<div class="tc-pips-row">' + pipsHtml + '</div>';
    html += '<button type="button" class="tc-btn-buy' + (isMax ? ' maxed-btn' : '') + '" data-tech="' + def.id + '"' + (!canAfford || isMax ? ' disabled' : '') + '>';
    html += btnTxt;
    html += '</button>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

/* ===================== CHAMADAS TÁTICAS DO COMANDANTE ===================== */
const CALLIN_DEFS = {
  napalm: { name: 'Bombardeio Napalm', cd: 40, ico: '🔥' },
  overclock: { name: 'Overclock do Reator', cd: 35, ico: '⚡' },
  barricade: { name: 'Barricada Eletroestática', cd: 30, ico: '🛡️' }
};

const callinState = {
  napalm: { cd: 0 },
  overclock: { cd: 0 },
  barricade: { cd: 0 },
  activeOverclock: 0,
  barricades: []
};

function triggerCommanderCallin(type, remote) {
  if (G.mode !== 'play') return false;
  const def = CALLIN_DEFS[type];
  if (!def) return false;
  if (!remote && callinState[type].cd > 0) {
    toast(def.name + ' em recarga (' + Math.ceil(callinState[type].cd) + 's)', 'bad');
    return false;
  }

  const cdrMult = 1 - getTechBonus('callin_cdr') * 0.05;
  const maxCd = def.cd * cdrMult;
  callinState[type].cd = maxCd;

  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try { window.navigator.vibrate(25); } catch (e) {}
  }

  if (type === 'napalm') {
    Snd.play('bomb');
    G.shake = Math.max(G.shake, 14);
    G.flash = 0.45;
    G.flashCol = 'rgba(249, 115, 22, 0.45)';
    FX.popup(W / 2, H / 2 - 40, '🔥 BOMBARDEIO NAPALM ATIVO!', '#f97316', true);
    toast('Comando Aéreo: Bombardeio Napalm atingiu o campo de batalha!', 'good');
    for (const z of zombies) {
      if (!z.dead && !z.reached) {
        applyDamage(z, 280, 'fire');
        ignite(z, 40, 5);
      }
    }
  } else if (type === 'overclock') {
    Snd.play('shock');
    G.shake = Math.max(G.shake, 6);
    G.flash = 0.35;
    G.flashCol = 'rgba(56, 189, 248, 0.4)';
    callinState.activeOverclock = 8;
    FX.popup(W / 2, H / 2 - 40, '⚡ OVERCLOCK DE REATOR ATIVO (+45% CADÊNCIA)!', '#38bdf8', true);
    toast('Reator Tático: Todas as torres operando com sobrecarga por 8s!', 'good');
  } else if (type === 'barricade') {
    Snd.play('upgrade');
    G.flash = 0.25;
    G.flashCol = 'rgba(168, 85, 247, 0.35)';
    FX.popup(W / 2, H / 2 - 40, '🛡️ BARRICADA ELETROESTÁTICA ATIVADA!', '#a855f7', true);
    toast('Barreira Tática: Bloqueio e contenção de horda erguido por 10s!', 'good');
    const p1 = pathPos(PATH_LEN * 0.35, {});
    const p2 = pathPos(PATH_LEN * 0.65, {});
    callinState.barricades.push({ x: p1.x, y: p1.y, duration: 10, maxDur: 10 });
    callinState.barricades.push({ x: p2.x, y: p2.y, duration: 10, maxDur: 10 });
  }

  updateCallinUI();
  return true;
}

function updateCallinUI() {
  if (typeof document === 'undefined') return;
  const bar = $('tacticalCallinBar');
  if (!bar) return;
  if (G.mode !== 'play') {
    bar.classList.add('hidden');
    bar.classList.remove('open');
    return;
  }
  if (IS_MOBILE) {
    if (!bar.classList.contains('open')) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
    }
  } else {
    bar.classList.remove('hidden');
  }

  const cdrMult = 1 - getTechBonus('callin_cdr') * 0.05;
  const items = [
    { key: 'napalm', btn: $('btnCallinNapalm'), cdLbl: $('cdNapalm'), fill: $('fillNapalm'), maxCd: CALLIN_DEFS.napalm.cd * cdrMult },
    { key: 'overclock', btn: $('btnCallinOverclock'), cdLbl: $('cdOverclock'), fill: $('fillOverclock'), maxCd: CALLIN_DEFS.overclock.cd * cdrMult },
    { key: 'barricade', btn: $('btnCallinBarricade'), cdLbl: $('cdBarricade'), fill: $('fillBarricade'), maxCd: CALLIN_DEFS.barricade.cd * cdrMult }
  ];

  for (const it of items) {
    if (!it.btn) continue;
    const cd = callinState[it.key].cd;
    if (cd > 0) {
      it.btn.classList.add('on-cd');
      it.btn.disabled = true;
      if (it.cdLbl) it.cdLbl.textContent = Math.ceil(cd) + 's';
      if (it.fill) it.fill.style.transform = 'scaleY(' + Math.min(1, cd / it.maxCd) + ')';
    } else {
      it.btn.classList.remove('on-cd');
      it.btn.disabled = false;
      if (it.cdLbl) it.cdLbl.textContent = 'PRONTO';
      if (it.fill) it.fill.style.transform = 'scaleY(0)';
    }
  }
}

/* ===================== EVENTOS CLIMÁTICOS DE BIOMA ===================== */
function updateWeatherUI(weather) {
  if (typeof document === 'undefined') return;
  const banner = $('weatherAlertBanner');
  if (!banner) return;
  if (!weather) {
    banner.classList.add('hidden');
    return;
  }
  const iconEl = $('wabIcon');
  const titleEl = $('wabTitle');
  const descEl = $('wabDesc');

  const DEFS = {
    emp_storm: { ico: '⚡', title: 'TEMPESTADE EMP DETECTADA', desc: 'Sobrecarga de rede: Torres de choque e plasma causam +40% de dano.' },
    acid_rain: { ico: '🌧️', title: 'CHUVA ÁCIDA CORROSIVA', desc: 'Precipitação tóxica: Zumbis sofrem corrosão e perdem 30% da armadura.' },
    blizzard: { ico: '❄️', title: 'NEVASCA CRIOGÊNICA', desc: 'Frio extremo: Velocidade de locomoção dos infectados reduzida em 20%.' },
    toxic_fog: { ico: '🌫️', title: 'NÉVOA BIOLÓGICA TÓXICA', desc: 'Visibilidade afetada: Torres de Sniper e Radares causam +30% de crítico.' }
  };

  const info = DEFS[weather];
  if (!info) {
    banner.classList.add('hidden');
    return;
  }
  if (iconEl) iconEl.textContent = info.ico;
  if (titleEl) titleEl.textContent = info.title;
  if (descEl) descEl.textContent = info.desc;

  banner.classList.remove('hidden');
  banner.style.opacity = '1';
  Snd.play('alarm');

  setTimeout(() => {
    if (banner && G.weather === weather) {
      banner.style.opacity = '0.35';
    }
  }, 6000);
}

/* ===================== 1. CONFIGURAÇÃO E PLATAFORMA HÍBRIDA (PC + MOBILE) ===================== */
const W = 960, H = 640;
const PLATFORM_KEY = 'quarentenaz_platform_pref';
let IS_MOBILE = false;
let CANVAS_DPR = 1;
window.IS_MOBILE = false;

/**
 * Detecta automaticamente se o dispositivo é Mobile/Tablet ou PC/Desktop
 * utilizando navigator.userAgentData?.mobile, navigator.maxTouchPoints e dimensões da tela.
 */
function detectDevice(){
  try{
    const nav=typeof window!=='undefined'&&window.navigator?window.navigator:(typeof navigator!=='undefined'?navigator:null);
    if(nav&&nav.userAgentData&&typeof nav.userAgentData.mobile==='boolean'){
      if(nav.userAgentData.mobile)return true;
    }
    const ua=nav&&nav.userAgent?String(nav.userAgent):'';
    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua))return true;
    const touchPts=nav&&typeof nav.maxTouchPoints==='number'?nav.maxTouchPoints:0;
    const sw=typeof window!=='undefined'?(window.innerWidth||1280):1280;
    const sh=typeof window!=='undefined'?(window.innerHeight||720):720;
    if(touchPts>0&&Math.min(sw,sh)<=920)return true;
  }catch(e){}
  return false;
}

function getPlatformPref(){
  try{
    const v=localStorage.getItem(PLATFORM_KEY);
    if(v==='pc'||v==='mobile'||v==='auto')return v;
  }catch(e){}
  return 'auto';
}

function isPortraitBlocked(){
  if(!IS_MOBILE)return false;
  const sw=typeof window!=='undefined'?(window.innerWidth||1280):1280;
  const sh=typeof window!=='undefined'?(window.innerHeight||720):720;
  return sh>sw;
}

const CFG = {
  startMoney: 750,      // moedas iniciais (ajustado para maior desafio tático)
  baseLife: 100,        // vida da base
  sellRatio: 0.5,       // reembolso na venda (50% do total investido)
  towerR: 15,           // raio de colisão da torre (posicionamento)
  pathClear: 36,        // distância mínima do centro do caminho para construir
  powerCD: 180,         // recarga dos poderes em SEGUNDOS REAIS
  prepTime: 6,          // intervalo entre ondas no modo automático (s de jogo)
  waveBonusBase: 36,    // economia restrita: bônus base reduzido (era 48)
  waveBonusPer: 6,      // economia restrita: bônus por onda reduzido (era 8)
  victoryWave: 40,      // onda que dispara a tela de vitória (depois é modo infinito)
  maxParts: 900         // limite de partículas
};

/* ---- Zumbis: todos os atributos ficam aqui (Hordas fortalecidas + Boss de Alta Velocidade) ---- */
const ZOMBIES = {
  common:   {name:'Zumbi Comum',   hp:52,  speed:40, reward:6,  armor:.04, leak:1,  r:9,  size:1,   anim:7,  skin:'#7fa05a', cloth:'#5b4a3b', pants:'#3b3f4a'},
  runner:   {name:'Corredor',      hp:35,  speed:95, reward:7,  armor:.02, leak:1,  r:8,  size:.9,  anim:14, skin:'#a6b86a', cloth:'#8a3b32', pants:'#2f3440'},
  camo:     {name:'Zumbi Camuflado',hp:76,speed:48,reward:14,armor:.08,leak:2,r:9,size:1,anim:8,skin:'#65736a',cloth:'#424c48',pants:'#303a36',camo:true},
  flyer:    {name:'Zumbi Voador',hp:65,speed:76,reward:16,armor:.06,leak:2,r:9,size:1,anim:12,skin:'#8999a0',cloth:'#42474e',pants:'#30343a',flying:true},
  armored:  {name:'Zumbi Blindado',hp:225, speed:33, reward:15, armor:.58, leak:3,  r:10, size:1.1, anim:6,  skin:'#6f8f55', cloth:'#555a60', pants:'#3a3d44'},
  toxic:    {name:'Zumbi Tóxico',  hp:135, speed:42, reward:12, armor:.06, leak:2,  r:10, size:1.05,anim:7,  skin:'#8fd24a', cloth:'#3f6a2a', pants:'#2e4a22', cloud:{r:68, life:5.5}},
  giant:    {name:'Gigante',       hp:1350,speed:24, reward:64, armor:.34, leak:15, r:17, size:2,   anim:4,  skin:'#6c8a5a', cloth:'#4a3a35', pants:'#2b2b33', big:true},
  healer:   {name:'Curandeiro',    hp:118, speed:37, reward:17, armor:.05, leak:2,  r:9,  size:1,   anim:7,  skin:'#9ac7a0', cloth:'#e8e8e0', pants:'#4a6a7a', heal:12, healR:92},
  explosive:{name:'Zumbi Explosivo',hp:92, speed:49, reward:12, armor:.05, leak:2,  r:10, size:1.05,anim:8,  skin:'#b0874a', cloth:'#7a2a22', pants:'#3a3030', blast:{r:58, dmg:75}},
  brute:    {name:'Brutamontes',hp:560,speed:28,reward:34,armor:.28,leak:8,r:15,size:1.6,anim:4,skin:'#697d4d',cloth:'#4a4540',pants:'#292e35',big:true},
  splitter: {name:'Zumbi Fragmentador',hp:190,speed:50,reward:19,armor:.08,leak:3,r:11,size:1.15,anim:8,skin:'#9b775b',cloth:'#4e3434',pants:'#302a31',split:true},
  screamer: {name:'Gritador',hp:152,speed:38,reward:24,armor:.08,leak:3,r:10,size:1.05,anim:7,skin:'#c4b7a0',cloth:'#5a3d46',pants:'#292e35',screamer:true},
  shielded: {name:'Zumbi com Escudo',hp:350,speed:31,reward:25,armor:.74,leak:5,r:12,size:1.2,anim:5,skin:'#75835b',cloth:'#59636a',pants:'#30343a',shield:true},
  digger:   {name:'Escavador',hp:130,speed:53,reward:18,armor:.18,leak:3,r:10,size:1.05,anim:8,skin:'#806c50',cloth:'#544437',pants:'#292b2d',digger:true},
  parasite: {name:'Zumbi Parasita',hp:98,speed:58,reward:19,armor:.06,leak:2,r:9,size:1,anim:10,skin:'#a0b66a',cloth:'#4e5c31',pants:'#303a25',parasite:true},
  regen:    {name:'Mutante Regenerativo',hp:320,speed:28,reward:29,armor:.22,leak:5,r:12,size:1.25,anim:5,skin:'#6da65a',cloth:'#43573a',pants:'#263525',regen:22},
  jumper:   {name:'Saltador',hp:170,speed:46,reward:22,armor:.08,leak:3,r:10,size:1.05,anim:11,skin:'#c2a16e',cloth:'#68483a',pants:'#342d31',jumper:true},
  commander:{name:'Comandante Zumbi',hp:450,speed:27,reward:48,armor:.28,leak:7,r:14,size:1.4,anim:5,skin:'#b1a66c',cloth:'#443d4a',pants:'#2d2b30',commander:true},
  colossus: {name:'Colosso Blindado',hp:3600,speed:17,reward:145,armor:.70,leak:22,r:22,size:2.5,anim:3,skin:'#687b58',cloth:'#454c4b',pants:'#292e31',big:true},
  speedboss:{name:'PREDADOR VELOZ',hp:4400,speed:74,reward:420,armor:.34,leak:35,r:22,size:2.5,anim:13,skin:'#38bdf8',cloth:'#0f172a',pants:'#1e293b',boss:true,big:true,speedBoss:true,slowResist:0.85},
  nemesis:  {name:'DEVASTADOR',hp:16500,speed:19,reward:1100,armor:.58,leak:65,r:30,size:3.5,anim:2,skin:'#86516f',cloth:'#42283c',pants:'#211923',boss:true,big:true,nemesis:true},
  boss:     {name:'ABOMINAÇÃO',    hp:7500,speed:22, reward:480,armor:.48, leak:40, r:26, size:3.2, anim:3,  skin:'#7a4a6a', cloth:'#4a2a3a', pants:'#241a24', boss:true, big:true}
};

/* ---- Ondas ---- */
const WAVECFG = {
  // onda em que cada tipo passa a aparecer
  unlock:   {common:1, runner:2, camo:5, flyer:7, armored:4, toxic:6, explosive:8, healer:9, giant:12, brute:10, splitter:11, screamer:13, shielded:15, digger:8, parasite:10, regen:14, jumper:12, commander:18, speedboss:15, colossus:25, nemesis:40},
  // "custo de ameaça" usado para dividir o orçamento da onda
  threat:   {common:10, runner:12, camo:24, flyer:26, armored:28, toxic:23, explosive:21, healer:32, giant:145, brute:90, splitter:40, screamer:36, shielded:54, digger:33, parasite:30, regen:70, jumper:45, commander:105, speedboss:420, colossus:300, nemesis:850},
  // intervalo base (s) entre zumbis do mesmo grupo
  interval: {common:.85, runner:.46, camo:1.0, flyer:.8, armored:1.1, toxic:1.05, explosive:.95, healer:1.85, giant:3.2, brute:2.2, splitter:1.2, screamer:1.95, shielded:1.65, digger:1.15, parasite:.85, regen:2.0, jumper:1.0, commander:2.5, speedboss:4.0, colossus:4.2, nemesis:5.5}
};
const hpMult  = w => 1 + 0.078 * (w - 1) + (w > 15 ? 0.042 * (w - 15) : 0) + (w > 28 ? 0.055 * (w - 28) : 0);
const spdMult = w => 1 + Math.min(0.65, 0.014 * (w - 1));

/* ---- Torres ----
   base: atributos iniciais balanceados por função e custo.
   ups: 3 melhorias (a 3ª tem duas especializações).                        */
const TOWERS = {
  gunner: {
    name:'Atirador Automático', cost:150, kind:'bullet', dtype:'Físico', prio:'first',
    short:'Metralhadora rápida e econômica. Forte contra hordas leves.',
    base:{dmg:6, rate:4.6, range:125, pspeed:560, pierce:1},
    ups:[
      {name:'Cano Longo', cost:125, desc:'+15% alcance, +1 dano', apply:s=>{s.range*=1.15; s.dmg+=1;}},
      {name:'Gatilho Rápido', cost:230, desc:'+35% cadência, +1,5 dano', apply:s=>{s.rate*=1.35; s.dmg+=1.5;}},
      {choices:[
        {name:'Balas Perfurantes', cost:440, desc:'Atravessa 3 inimigos, +3 dano', apply:s=>{s.pierce=3; s.dmg+=3;}},
        {name:'Chuva de Balas', cost:460, desc:'Cadência x1,65', apply:s=>{s.rate*=1.65;}}
      ]}
    ]
  },
  sniper: {
    name:'Sniper', cost:320, kind:'bullet', dtype:'Físico', prio:'strong',
    short:'Alcance global e alto dano de precisão contra alvos prioritários.',
    base:{global:true, dmg:72, rate:.68, range:1400, pspeed:1500, pierce:1, crit:0, critMult:2.8, armorPen:.15, bigMult:1.1},
    ups:[
      {name:'Munição Pesada', cost:260, desc:'+42 dano', apply:s=>{s.dmg+=42;}},
      {name:'Mira Térmica', cost:400, desc:'Ignora 50% da armadura (Sniper: alcance global; demais: +30% alcance)', apply:s=>{s.range=s.global?Math.max(s.range,1400):s.range*1.3; s.armorPen=.5;}},
      {choices:[
        {name:'Tiro Crítico', cost:720, desc:'32% de chance de dano x2,8', apply:s=>{s.crit=.32; s.critMult=2.8; s.dmg+=18;}},
        {name:'Perfuração Total', cost:720, desc:'Ignora armadura e barreiras de visão, atravessa 3, x1,5 vs gigantes/chefes', apply:s=>{s.armorPen=1; s.pierce=3; s.bigMult=1.5; s.ignoreLoS=true;}}
      ]}
    ]
  },
  mortar: {
    name:'Morteiro', cost:460, kind:'mortar', dtype:'Explosivo', prio:'first',
    short:'Artilharia em área. Antecipa o movimento da horda.',
    base:{dmg:110, rate:.34, range:205, pspeed:265, splash:45},
    ups:[
      {name:'Pólvora Reforçada', cost:310, desc:'+55 dano', apply:s=>{s.dmg+=55;}},
      {name:'Recarga Rápida', cost:390, desc:'+32% cadência', apply:s=>{s.rate*=1.32;}},
      {choices:[
        {name:'Ogivas Pesadas', cost:660, desc:'Raio +22%, +55 dano', apply:s=>{s.splash*=1.22; s.dmg+=55;}},
        {name:'Rodadas Incendiárias', cost:660, desc:'Explosões incendeiam (20/s por 4s)', apply:s=>{s.burnDps=20; s.burnT=4;}}
      ]}
    ]
  },
  flame: {
    name:'Lança-Chamas', cost:260, kind:'flame', dtype:'Fogo', prio:'close',
    short:'Cone contínuo de fogo curto. Aquece e incendeia grupos.',
    base:{dmg:2.4, rate:11, range:102, cone:.44, burnDps:10, burnT:3, ramp:1.9},
    ups:[
      {name:'Bico Ampliado', cost:190, desc:'+10% alcance, cone maior', apply:s=>{s.range*=1.1; s.cone*=1.18;}},
      {name:'Combustível Aditivado', cost:270, desc:'Queimadura +65%, +1,2s', apply:s=>{s.burnDps*=1.65; s.burnT+=1.2;}},
      {choices:[
        {name:'Napalm', cost:530, desc:'Queimadura x1,5 e dura x1,5, +1,2 dano', apply:s=>{s.burnDps*=1.5; s.burnT*=1.5; s.dmg+=1.2;}},
        {name:'Inferno', cost:530, desc:'Aquece x1,6 mais forte, cadência +25%', apply:s=>{s.ramp*=1.6; s.rate*=1.25;}}
      ]}
    ]
  },
  tesla: {
    name:'Torre Elétrica', cost:390, kind:'tesla', dtype:'Elétrico', prio:'first',
    short:'Descargas em cadeia que saltam entre zumbis e desaceleram.',
    base:{dmg:22, rate:1.18, range:135, chain:3, chainR:58, slow:.26, slowT:1, stun:0},
    ups:[
      {name:'Condensadores', cost:260, desc:'+10 dano, +1 salto', apply:s=>{s.dmg+=10; s.chain+=1;}},
      {name:'Bobina Dupla', cost:370, desc:'+35% cadência, +8% alcance', apply:s=>{s.rate*=1.35; s.range*=1.08;}},
      {choices:[
        {name:'Tempestade', cost:660, desc:'+3 saltos, +15 dano', apply:s=>{s.chain+=3; s.dmg+=15;}},
        {name:'Eletrochoque', cost:660, desc:'Lentidão 58% por 2s + atordoa 0,3s', apply:s=>{s.slow=.58; s.slowT=2.0; s.stun=.3;}}
      ]}
    ]
  },
  ice: {
    name:'Torre de Gelo', cost:310, kind:'ice', dtype:'Gelo', prio:'first',
    short:'Pulso criogênico que desacelera todos os inimigos ao redor.',
    base:{dmg:4, rate:.90, range:114, slow:.28, slowT:1.35, freezeChance:0, freezeT:0},
    ups:[
      {name:'Cristais Amplos', cost:250, desc:'+10% alcance, +2 dano', apply:s=>{s.range*=1.1; s.dmg+=2;}},
      {name:'Geada Profunda', cost:360, desc:'Lentidão 38% por 1,9s', apply:s=>{s.slow=.38; s.slowT=1.9;}},
      {choices:[
        {name:'Congelamento', cost:650, desc:'20% de chance de congelar por 0,85s', apply:s=>{s.freezeChance=.20; s.freezeT=.85;}},
        {name:'Vento Polar', cost:650, desc:'Alcance +12%, lentidão 48%, +6 dano', apply:s=>{s.range*=1.12; s.slow=.48; s.dmg+=6; s.rate*=1.18;}}
      ]}
    ]
  },
  poison: {
    name:'Torre de Veneno', cost:350, kind:'poison', dtype:'Veneno', prio:'first',
    short:'Projéteis bioquímicos com dano contínuo prolongado.',
    base:{dmg:8, rate:1.2, range:132, pspeed:390, poisonDps:11, poisonT:5, spreadR:0},
    ups:[
      {name:'Toxina Concentrada', cost:240, desc:'Veneno +55% dano', apply:s=>{s.poisonDps*=1.55;}},
      {name:'Longa Duração', cost:340, desc:'Veneno dura 7,5s', apply:s=>{s.poisonT=7.5;}},
      {choices:[
        {name:'Contágio', cost:610, desc:'Veneno se espalha para até 4 zumbis próximos', apply:s=>{s.spreadR=48;}},
        {name:'Peçonha Letal', cost:610, desc:'Veneno x2 de dano, +6 dano direto', apply:s=>{s.poisonDps*=2.0; s.dmg+=6;}}
      ]}
    ]
  },
  antitank: {
    name:'Canhão Antitanque', cost:620, kind:'bullet', dtype:'Perfurante', prio:'strong',
    short:'Disparo pesado anti-blindagem contra gigantes e chefes.',
    base:{dmg:340, rate:.36, range:195, pspeed:900, pierce:4, armorPen:1, bigMult:1.5, splash:0},
    ups:[
      {name:'Projétil Reforçado', cost:460, desc:'+180 dano', apply:s=>{s.dmg+=180;}},
      {name:'Carregador Automático', cost:610, desc:'+35% cadência', apply:s=>{s.rate*=1.35;}},
      {choices:[
        {name:'Perfuração Total', cost:920, desc:'Atravessa 8 inimigos, +140 dano', apply:s=>{s.pierce=8; s.dmg+=140;}},
        {name:'Munição Explosiva', cost:920, desc:'Explode ao acertar (raio 38), +95 dano', apply:s=>{s.splash=38; s.dmg+=95;}}
      ]}
    ]
  },
  archer: {
    name:'Arqueiro', cost:190, kind:'bullet', dtype:'Precisão', prio:'first',
    short:'Disparos precisos e econômicos com ótimo alcance inicial.',
    base:{dmg:14,rate:1.75,range:150,pspeed:680,pierce:1},
    ups:[
      {name:'Arco Reforçado',cost:150,desc:'+32% dano',apply:s=>{s.dmg*=1.32;}},
      {name:'Flechas Velozes',cost:230,desc:'+35% cadência',apply:s=>{s.rate*=1.35;}},
      {choices:[
        {name:'Flecha Tripla',cost:460,desc:'Atravessa 3 inimigos, +8 dano',apply:s=>{s.pierce=3;s.dmg+=8;}},
        {name:'Olho de Águia',cost:460,desc:'+25% alcance e +18 dano',apply:s=>{s.range*=1.25;s.dmg+=18;}}
      ]}
    ]
  },
  boomerang: {
    name:'Bumerangue', cost:330, kind:'bullet', dtype:'Cortante', prio:'first',
    short:'Lâmina rotativa que atravessa múltiplos inimigos em linha.',
    base:{dmg:25,rate:1.25,range:145,pspeed:440,pierce:4},
    ups:[
      {name:'Lâmina Afiada',cost:220,desc:'+11 dano',apply:s=>{s.dmg+=11;}},
      {name:'Arremesso Longo',cost:310,desc:'+10% alcance e velocidade',apply:s=>{s.range*=1.1;s.pspeed*=1.2;}},
      {choices:[
        {name:'Bumerangue Duplo',cost:570,desc:'Atravessa 7 inimigos, +12 dano',apply:s=>{s.pierce=7;s.dmg+=12;}},
        {name:'Lâmina Giratória',cost:570,desc:'Cadência x1,65',apply:s=>{s.rate*=1.65;}}
      ]}
    ]
  },
  engineer: {
    name:'Engenheiro', cost:500, kind:'tesla', dtype:'Energia', prio:'first',
    short:'Emite pulsos energéticos em cadeia com controle de grupo.',
    base:{dmg:19,rate:1.15,range:142,chain:4,chainR:54,slow:.22,slowT:1.2,stun:0},
    ups:[
      {name:'Bateria Melhorada',cost:260,desc:'+9 dano e +1 salto',apply:s=>{s.dmg+=9;s.chain++;}},
      {name:'Antena Alta',cost:360,desc:'+10% alcance e salto elétrico mais longo',apply:s=>{s.range*=1.1;s.chainR*=1.08;}},
      {choices:[
        {name:'Pulso Magnético',cost:630,desc:'Lentidão de 46% por 2s',apply:s=>{s.slow=.46;s.slowT=2;}},
        {name:'Sobrecarga',cost:630,desc:'+22 dano e +3 saltos',apply:s=>{s.dmg+=22;s.chain+=3;}}
      ]}
    ]
  }
};
// Unidades táticas especializadas: radar e drone cobrem camuflados e voadores.
TOWERS.radar = Object.assign({}, TOWERS.sniper, {name:'Radar Sentinela',cost:360,kind:'bullet',dtype:'Tecnologia',prio:'first',short:'Revela camuflados e abate zumbis voadores com precisão.',detectCamo:true,canAir:true,base:{dmg:30,rate:1.65,range:180,pspeed:920,pierce:1,armorPen:.2},ups:TOWERS.sniper.ups});
TOWERS.shotgun = Object.assign({}, TOWERS.gunner, {name:'Guarda de Escopeta',cost:240,kind:'bullet',dtype:'Estilhaços',prio:'close',short:'Disparo de curto alcance que atravessa zumbis agrupados.',base:{dmg:15,rate:1.3,range:128,pspeed:520,pierce:3,splash:0},ups:TOWERS.gunner.ups});
TOWERS.drone = Object.assign({}, TOWERS.sniper, {name:'Drone de Patrulha',cost:440,kind:'bullet',dtype:'Aéreo',prio:'first',short:'Unidade aérea rápida que caça camuflados e voadores.',detectCamo:true,canAir:true,base:{dmg:20,rate:3.0,range:168,pspeed:780,pierce:1},ups:TOWERS.sniper.ups});
TOWERS.demolition = Object.assign({}, TOWERS.mortar, {name:'Especialista Demolidor',cost:540,kind:'mortar',dtype:'Demolição',prio:'strong',short:'Artilharia pesada anti-blindagem de alto impacto.',base:{dmg:160,rate:.42,range:200,pspeed:300,splash:48,armorPen:.4},ups:TOWERS.mortar.ups});
TOWERS.railgun = Object.assign({}, TOWERS.antitank, {name:'Canhão Eletromagnético',cost:880,kind:'bullet',dtype:'Eletromagnético',prio:'strong',short:'Disparo hipersônico que perfura blindados em linha.',base:{dmg:290,rate:.48,range:205,pspeed:1400,pierce:5,armorPen:.88,bigMult:1.65},ups:TOWERS.antitank.ups});
TOWERS.medstation = Object.assign({}, TOWERS.engineer, {name:'Estação de Apoio',cost:620,kind:'tesla',dtype:'Suporte',prio:'first',short:'Descargas elétricas de contenção. Habilidade acelera torres.',base:{dmg:14,rate:1.35,range:135,chain:3,chainR:55,slow:.18,slowT:1},ups:TOWERS.engineer.ups});
TOWERS.acid = Object.assign({}, TOWERS.poison, {name:'Lançador Ácido',cost:490,kind:'poison',dtype:'Ácido',prio:'strong',short:'Corrói blindagens pesadas e aplica ácido contínuo.',base:{dmg:30,rate:.88,range:148,pspeed:420,poisonDps:19,poisonT:5,armorPen:.6},ups:TOWERS.poison.ups});
// Torres de Suporte dedicadas (balanceadas para sinergia tática sem trivializar ondas):
TOWERS.beacon = Object.assign({}, TOWERS.radar, {name:'Farol de Comando',cost:400,kind:'bullet',dtype:'Suporte Tático',prio:'first',role:'support',detectCamo:true,canAir:true,short:'Aura: +16% dano, +14% alcance e visão camuflada às torres próximas.',base:{dmg:16,rate:1.4,range:150,pspeed:950,pierce:1,armorPen:.2,auraDmg:.16,auraRange:.14,auraCamo:1},ups:TOWERS.sniper.ups});
TOWERS.supplydepot = Object.assign({}, TOWERS.engineer, {name:'Base de Suprimentos',cost:450,kind:'support_eco',dtype:'Suporte Logístico',prio:'first',role:'support',short:'Gera +18 moedas por ciclo na onda e acelera torres próximas em +12%.',base:{dmg:0,rate:.15,range:135,income:18,auraRate:.12},ups:TOWERS.engineer.ups});
TOWERS.cryogen = Object.assign({}, TOWERS.ice, {name:'Torre de Estase',cost:480,kind:'support_debuff',dtype:'Suporte Criogênico',prio:'first',role:'support',detectCamo:true,canAir:true,short:'Desacelera em área e aplica Vulnerabilidade (+20% dano recebido).',base:{dmg:8,rate:.88,range:135,slow:.35,slowT:2.2,vuln:.20,freezeChance:.08,freezeT:.8},ups:TOWERS.ice.ups});
TOWERS.nanomed = Object.assign({}, TOWERS.engineer, {name:'Estação Nano-Médica',cost:560,kind:'tesla',dtype:'Suporte Médico',prio:'first',role:'support',detectCamo:true,canAir:true,short:'Purifica torres, concede +15% cadência e repara +1 vida da base/onda.',base:{dmg:14,rate:1.25,range:155,chain:3,chainR:58,slow:.18,slowT:1.1,auraRate:.15,auraDmg:.08,purify:1,healBase:1},ups:TOWERS.engineer.ups});
// Novas Torres e Habilidades Estilo Bloons TD 6:
TOWERS.dartgun = Object.assign({}, TOWERS.gunner, {name:'Metralhadora Direcional',cost:340,kind:'dartgun',dtype:'Direcional',prio:'first',detectCamo:true,canAir:true,short:'Mira travada em um ponto fixo do mapa, disparando apenas nessa linha até você mudá-la.',base:{dmg:13,rate:5.6,range:280,pspeed:780,pierce:2,armorPen:.12,spread:.05},ups:TOWERS.gunner.ups});
TOWERS.dino = Object.assign({}, TOWERS.antitank, {name:'Domador Jurássico',cost:520,kind:'summoner',dtype:'Invocação',prio:'strong',short:'Centro bio-tático que comanda um Dinossauro Alfa gigante (mais forte que a torre) e invoca raptores.',base:{dmg:32,rate:.95,range:165,pspeed:560,pierce:2,dinoDmg:68,allyHp:210,stun:.32,armorPen:.35},ups:TOWERS.antitank.ups});
TOWERS.minefactory = Object.assign({}, TOWERS.mortar, {name:'Usina de Minas',cost:430,kind:'minefactory',dtype:'Explosivo/Stun',prio:'first',detectCamo:true,short:'Lança minas terrestres acumuláveis na pista que explodem e atordoam hordas e chefes.',base:{dmg:92,rate:.62,range:150,splash:54,stun:.75,maxStacks:4,armorPen:.35},ups:TOWERS.mortar.ups});
TOWERS.portal = Object.assign({}, TOWERS.engineer, {name:'Torre de Portal Tático',cost:580,kind:'portal',dtype:'Dimensional',prio:'first',role:'support',detectCamo:true,canAir:true,short:'Dispara pulsos dimensionais. Habilidade abre portal que recua os zumbis na pista.',base:{dmg:26,rate:1.45,range:165,pspeed:820,pierce:2,warpBack:190,slow:.24,slowT:1.4,auraRange:.08},ups:TOWERS.engineer.ups});
// ============================================================
// BALANCE v1.0.0 - ajustes centralizados (antes -> depois em CHANGELOG.md)
// Edite SOMENTE aqui para rebalancear torres. Formato: torre:{campo:valor}
// Campos "cost" alteram o custo; os demais alteram TOWERS[torre].base.
// ============================================================
const BALANCE = {
  antitank:{cost:660},   // 620 -> 660 (+6,5%): melhor DPS/custo do jogo
  shotgun:{dmg:16.5},    // 15 -> 16.5 (+10%): pior DPS/custo entre torres de combate basicas
  tesla:{dmg:24},        // 22 -> 24 (+9%): DPS/custo muito abaixo da media
  railgun:{cost:940},    // 880 -> 940 (+6,8%): maior DPS/custo pos-upgrade em endgame
  cryogen:{cost:450}     // 480 -> 450 (-6,2%): suporte criogenico caro no inicio de partida
};
for (const [k, o] of Object.entries(BALANCE)) {
  if (!TOWERS[k]) continue;
  for (const [f, v] of Object.entries(o)) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) continue;
    if (f === 'cost') TOWERS[k].cost = v; else TOWERS[k].base = Object.assign({}, TOWERS[k].base, {[f]: v});
  }
}
// ============================================================
// ASCENSION_BALANCE v1.0.4 - Nerf no Protocolo de Ascensão:
// Custo em moedas aumentado e multiplicador de dano base reduzido
// para exigir planejamento econômico e manter equilíbrio estratégico.
// ============================================================
const ASCENSION_BALANCE = {
  default:     {dmg:2.25, rate:1.42, range:1.14, bigMult:1.48, dot:1.55, splash:1.14, aura:1.28, income:1.95},
  antitank:    {dmg:2.05, rate:1.36, bigMult:1.35, cost:5800},
  railgun:     {dmg:2.00, rate:1.34, bigMult:1.35, cost:6800},
  boomerang:   {dmg:2.18, rate:1.40, bigMult:1.42, cost:4400},
  sniper:      {dmg:2.25, rate:1.40, bigMult:1.50, cost:4300},
  gunner:      {dmg:2.35, rate:1.45, cost:3500},
  archer:      {dmg:2.35, rate:1.45, cost:3600},
  shotgun:     {dmg:2.35, rate:1.45, cost:3800},
  flame:       {dmg:2.35, rate:1.45, dot:1.68, cost:3800},
  poison:      {dmg:2.38, rate:1.45, dot:1.72, cost:3900},
  acid:        {dmg:2.35, rate:1.45, dot:1.65, cost:4500},
  mortar:      {dmg:2.35, rate:1.45, splash:1.15, dot:1.55, cost:4500},
  tesla:       {dmg:2.38, rate:1.45, cost:4100},
  ice:         {dmg:2.30, rate:1.40, cost:3900},
  cryogen:     {dmg:2.30, rate:1.40, aura:1.30, cost:4200},
  supplydepot: {income:1.95, aura:1.30, cost:4400},
  beacon:      {dmg:2.25, rate:1.42, aura:1.28, cost:4300},
  medstation:  {dmg:2.25, rate:1.42, aura:1.28, cost:4700},
  nanomed:     {dmg:2.25, rate:1.42, aura:1.28, cost:4600},
  dartgun:     {dmg:2.30, rate:1.44, cost:4200},
  dino:        {dmg:2.25, rate:1.40, bigMult:1.45, cost:4700},
  minefactory: {dmg:2.28, rate:1.40, splash:1.16, cost:4400},
  portal:      {dmg:2.25, rate:1.42, aura:1.28, cost:4900}
};
// Quarta melhoria: especialização final específica por função da torre.
for (const [key, d] of Object.entries(TOWERS)) {
  d.ups = d.ups.slice(); // cada variante recebe sua própria árvore de melhorias
  if (!d.ups[3]) {
    const finalUp = {
      gunner:{name:'Munição de Tungstênio',cost:620,desc:'+2 dano e perfuração reforçada',apply:s=>{s.dmg+=2;s.pierce=Math.max(2,s.pierce||1);}},
      sniper:{name:'Sistema de Aquisição',cost:760,desc:'+12% alcance e +18% dano',apply:s=>{s.range*=1.12;s.dmg*=1.18;}},
      mortar:{name:'Carga de Demolição',cost:780,desc:'+18% dano e raio de explosão',apply:s=>{s.dmg*=1.18;s.splash=(s.splash||50)*1.18;}},
      flame:{name:'Combustão Pressurizada',cost:580,desc:'+20% alcance e +20% dano de queimadura',apply:s=>{s.range*=1.2;s.burnDps=(s.burnDps||8)*1.2;}},
      tesla:{name:'Condutor de Alta Tensão',cost:760,desc:'+1 salto e +15% alcance',apply:s=>{s.chain=(s.chain||2)+1;s.range*=1.15;}},
      ice:{name:'Núcleo Criogênico',cost:760,desc:'+8% alcance e +0,3s de lentidão',apply:s=>{s.range*=1.08;s.slowT=(s.slowT||1.35)+.3;}},
      poison:{name:'Catalisador Mutagênico',cost:690,desc:'+25% veneno e +1s de duração',apply:s=>{s.poisonDps=(s.poisonDps||8)*1.25;s.poisonT=(s.poisonT||4)+1;}},
      antitank:{name:'Projétil de Cerâmica',cost:1050,desc:'+18% dano contra alvos pesados',apply:s=>{s.dmg*=1.18;s.bigMult=(s.bigMult||1.3)*1.12;}},
      archer:{name:'Ponta de Aço',cost:480,desc:'+20% dano e +1 perfuração',apply:s=>{s.dmg*=1.2;s.pierce=(s.pierce||1)+1;}},
      boomerang:{name:'Lâmina Reforçada',cost:640,desc:'+20% dano e +1 perfuração',apply:s=>{s.dmg*=1.2;s.pierce=(s.pierce||2)+1;}},
      engineer:{name:'Capacitor Tático',cost:720,desc:'+15% alcance e +1 salto',apply:s=>{s.range*=1.15;s.chain=(s.chain||2)+1;}},
      radar:{name:'Matriz de Rastreamento',cost:700,desc:'+12% alcance e +15% dano',apply:s=>{s.range*=1.12;s.dmg*=1.15;}},
      shotgun:{name:'Cartucho de Fragmentação',cost:520,desc:'+20% dano e +1 perfuração',apply:s=>{s.dmg*=1.2;s.pierce=(s.pierce||2)+1;}},
      drone:{name:'Enxame Coordenado',cost:780,desc:'+15% cadência e +10% alcance',apply:s=>{s.rate*=1.15;s.range*=1.1;}},
      demolition:{name:'Ogiva Sísmica',cost:880,desc:'+20% dano e raio de explosão',apply:s=>{s.dmg*=1.2;s.splash=(s.splash||45)*1.2;}},
      railgun:{name:'Bobina de Fusão',cost:1200,desc:'+15% dano e +1 perfuração',apply:s=>{s.dmg*=1.15;s.pierce=(s.pierce||4)+1;}},
      medstation:{name:'Protocolo Avançado',cost:850,desc:'+15% alcance de suporte',apply:s=>{s.range*=1.15;}},
      acid:{name:'Ácido Corrosivo',cost:780,desc:'+25% dano contínuo',apply:s=>{s.poisonDps=(s.poisonDps||12)*1.25;s.dmg*=1.1;}}
    };
    d.ups.push(finalUp[key] || {name:'Kit de Combate Avançado',cost:650,desc:'+12% dano e alcance',apply:s=>{s.dmg*=1.12;s.range*=1.12;}});
  }
}
// Árvores de especialização no estilo BTD6: 3 caminhos, máximo 5-2-0.
// O caminho 1 aproveita as melhorias específicas originais; os caminhos 2 e 3
// oferecem especializações alternativas adaptadas ao tipo de torre.
function makeBranchUpgrade(d, key, branch, level) {
  const scale = [0, .10, .17, .25, .34, .45][level];
  const cost = Math.round((d.cost * ([0, .55, .85, 1.25, 1.8, 2.6][level])) / 10) * 10;
  const variants = [
    {name:['','Mira e calibração','Mecanismo reforçado','Sistema de precisão','Arsenal especializado','Tecnologia de elite'][level],desc:`+${Math.round(scale*100)}% dano`,apply:s=>{s.dmg*=1+scale;}},
    {name:['','Alcance tático','Óptica avançada','Cobertura ampliada','Aquisição de alvos','Rastreamento extremo'][level],desc:`+${Math.round(scale*100)}% alcance`,apply:s=>{s.range*=1+scale;if(key==='sniper')s.range=1400;}},
    {name:['','Ciclo otimizado','Recarga melhorada','Mecanismo rápido','Cadência de combate','Disparo de elite'][level],desc:`+${Math.round(scale*100)}% cadência`,apply:s=>{s.rate*=1+scale;}}
  ];
  const v=variants[branch];
  return {name:v.name,cost,desc:v.desc,apply:v.apply};
}
const TOWER_PATHS = {};
for (const [key,d] of Object.entries(TOWERS)) {
  const original=d.ups;
  const path0=[];
  path0.push(original[0] && !original[0].choices ? original[0] : makeBranchUpgrade(d,key,0,1));
  path0.push(original[1] && !original[1].choices ? original[1] : makeBranchUpgrade(d,key,0,2));
  const spec=original.find(u=>u.choices);
  path0.push(spec ? {choices:spec.choices} : makeBranchUpgrade(d,key,0,3));
  path0.push(d.ups[3] || makeBranchUpgrade(d,key,0,4));
  path0.push(makeBranchUpgrade(d,key,0,5));
  TOWER_PATHS[key]=[path0,[1,2,3,4,5].map(l=>makeBranchUpgrade(d,key,1,l)),[1,2,3,4,5].map(l=>makeBranchUpgrade(d,key,2,l))];
}
const UP_LABEL={dmg:'dano',rate:'cadência',range:'alcance',pierce:'perfuração',splash:'raio de explosão',armorPen:'penetração de armadura',bigMult:'dano contra pesados',crit:'chance de crítico',critMult:'multiplicador de crítico',pspeed:'velocidade do projétil',burnDps:'dano de queimadura',burnT:'duração da queimadura',chain:'saltos',chainR:'alcance do salto',slow:'lentidão',slowT:'duração da lentidão',stun:'atordoamento (s)',poisonDps:'veneno por segundo',poisonT:'duração do veneno',spreadR:'raio de contágio',auraDmg:'bônus de dano na aura',auraRate:'bônus de cadência na aura',auraRange:'bônus de alcance na aura',income:'moedas por ciclo',vuln:'vulnerabilidade nos zumbis',healBase:'reparo da base por onda',dinoDmg:'dano do dinossauro',allyHp:'vida dos aliados',maxStacks:'acúmulo de minas',warpBack:'recuo dimensional'};
function mkUp(d,i,e){ // e = [nome, {campo:'*1.2' | '+1' | '=900'}]
  const sp=e[1],parts=[];
  for(const f in sp){const op=sp[f][0],v=+sp[f].slice(1),L=UP_LABEL[f]||f;
    parts.push(op==='*'?(v>=1?'+':'-')+Math.round(Math.abs(v-1)*100)+'% '+L:op==='+'?'+'+v+' '+L:(f==='range'&&v>=700?'alcance global':L+' = '+v));}
  const costMult=d===TOWERS.ice?1.22:1;
  return {name:e[0],cost:Math.round(d.cost*costMult*[.5,.8,1.2,1.8,2.6][i]/10)*10,desc:parts.join(', '),
    apply:st=>{for(const f in sp){const op=sp[f][0],v=+sp[f].slice(1);st[f]=op==='*'?(st[f]||0)*v:op==='+'?(st[f]||0)+v:v;}}};
}
const UNIQUE_UPS={
 radar:[[['Antena Longa',{range:'*1.2'}],['Varredura Ampla',{range:'*1.2',pierce:'+1'}],['Satélite Tático',{range:'*1.25'}],['Rede de Radares',{range:'*1.3',dmg:'*1.2'}],['Olho Orbital',{range:'=900',pierce:'+2',dmg:'*1.3'}]],
  [['Sinal Pulsante',{crit:'+.1',critMult:'=2'}],['Calibração Fina',{armorPen:'+.2'}],['Sobrecarga de Sinal',{rate:'*1.3'}],['Pulso Dirigido',{crit:'+.1',critMult:'=2.8'}],['Raio Ceifador',{dmg:'*2',armorPen:'=.9',rate:'*.8'}]],
  [['Munição Explosiva',{splash:'=30',dmg:'*1.1'}],['Rastreio Rápido',{pspeed:'*1.5',rate:'*1.15'}],['Salvas Guiadas',{rate:'*1.3'}],['Estilhaços Inteligentes',{splash:'=55',pierce:'+1'}],['Tempestade de Dados',{rate:'*1.5',splash:'=70',dmg:'*1.3'}]]],
 shotgun:[[['Cartucho Duplo',{dmg:'*1.35'}],['Chumbo Grosso',{dmg:'*1.35',range:'*1.1'}],['Cano Serrado',{dmg:'*1.4'}],['Slug de Aço',{armorPen:'=.4',bigMult:'=1.4'}],['Canhão de Mão',{dmg:'*2',pierce:'+3',range:'*1.15'}]],
  [['Pump Rápido',{rate:'*1.25'}],['Gatilho Sensível',{rate:'*1.25'}],['Tambor Extra',{rate:'*1.3'}],['Fogo Contínuo',{rate:'*1.35'}],['Metralha de Cano',{rate:'*1.6',dmg:'*1.2'}]],
  [['Estilhaço',{splash:'=26'}],['Mira Laser',{crit:'+.12',critMult:'=2'}],['Cartucho Explosivo',{splash:'=42',dmg:'*1.2'}],['Choque de Impacto',{pierce:'+3',range:'*1.15'}],['Tempestade de Fragmentos',{splash:'=60',pierce:'+4',dmg:'*1.35'}]]],
 drone:[[['Câmera Térmica',{range:'*1.2'}],['Motores Rápidos',{pspeed:'*1.4',range:'*1.15'}],['Patrulha Estendida',{range:'*1.3'}],['Radar de Bordo',{armorPen:'+.2',dmg:'*1.25'}],['Caça Total',{range:'=700',dmg:'*1.4',rate:'*1.2'}]],
  [['Cano Duplo',{rate:'*1.25'}],['Munição Leve',{rate:'*1.3'}],['Rotor Gêmeo',{rate:'*1.3',pierce:'+1'}],['Fogo Supressivo',{rate:'*1.35',crit:'+.08',critMult:'=2'}],['Enxame de Balas',{rate:'*1.8',dmg:'*1.2'}]],
  [['Mini-Bombas',{splash:'=28'}],['Carga Perfurante',{armorPen:'+.35',dmg:'*1.3'}],['Bombas Maiores',{splash:'=45',dmg:'*1.3'}],['Napalm Aéreo',{splash:'=60',bigMult:'=1.4'}],['Chuva de Fogo',{splash:'=85',dmg:'*1.6',rate:'*.9'}]]],
 demolition:[[['Cabeça Reforçada',{dmg:'*1.25'}],['Carga Pesada',{splash:'*1.2',dmg:'*1.2'}],['Ogiva Perfurante',{armorPen:'=.6'}],['Destruidor de Bunker',{dmg:'*1.5',splash:'*1.15'}],['Terremoto',{dmg:'*2',splash:'*1.4',rate:'*.9'}]],
  [['Fósforo',{burnDps:'=10',burnT:'=3'}],['Napalm Líquido',{burnDps:'=18',burnT:'=4'}],['Gelatina Incendiária',{splash:'*1.2',burnDps:'*1.4'}],['Mar de Chamas',{burnT:'=6',burnDps:'*1.5'}],['Inferno',{burnDps:'=60',burnT:'=8',splash:'*1.3'}]],
  [['Culatra Automática',{rate:'*1.25'}],['Carregador Duplo',{rate:'*1.25',range:'*1.1'}],['Alimentador Rápido',{rate:'*1.3'}],['Salvas Contínuas',{rate:'*1.3',range:'*1.15'}],['Barragem Infinita',{rate:'*1.8',dmg:'*1.2'}]]],
 railgun:[[['Capacitores',{dmg:'*1.25'}],['Bobinas Paralelas',{dmg:'*1.3'}],['Núcleo de Fusão',{dmg:'*1.4'}],['Ruptura de Blindagem',{bigMult:'*1.5',dmg:'*1.3'}],['Disparo Solar',{dmg:'*2.5',rate:'*.85',pierce:'+5'}]],
  [['Ciclo de Recarga',{rate:'*1.3'}],['Trilho Supercondutor',{rate:'*1.3'}],['Resfriamento Criogênico',{rate:'*1.35'}],['Bobinas Gêmeas',{rate:'*1.4'}],['Metralha Magnética',{rate:'*1.7'}]],
  [['Trilho Longo',{range:'*1.25'}],['Mira Balística',{crit:'+.15',critMult:'=2.2'}],['Trilho Estendido',{range:'*1.3',pierce:'+2'}],['Rastreio Preciso',{crit:'+.15',critMult:'=3'}],['Mira Orbital',{range:'=900',crit:'+.1',critMult:'=3.5'}]]],
 medstation:[[['Bobina Extra',{chain:'+1'}],['Alta Voltagem',{dmg:'*1.6'}],['Arco Longo',{chainR:'*1.4',chain:'+1'}],['Tempestade Elétrica',{chain:'+2',dmg:'*1.5'}],['Raio Mestre',{chain:'+3',dmg:'*2.2',range:'*1.2'}]],
  [['Campo Frio',{slow:'=.3',slowT:'=2'}],['Eletrochoque',{stun:'=.15'}],['Pulso Paralisante',{stun:'=.3',slowT:'=2.5'}],['Rede de Contenção',{slow:'=.5',chain:'+1'}],['Congelamento por Pulso',{stun:'=.5',slow:'=.6',slowT:'=4'}]],
  [['Antena de Suporte',{range:'*1.25'}],['Reforço Tático',{rate:'*1.25'}],['Ressonância',{range:'*1.2',rate:'*1.2'}],['Rede Neural',{rate:'*1.3',chain:'+1'}],['Centro de Comando',{range:'*1.3',rate:'*1.4',dmg:'*1.5'}]]],
 acid:[[['Ácido Forte',{armorPen:'+.2'}],['Fórmula Corrosiva',{armorPen:'+.3',dmg:'*1.2'}],['Dissolvente',{poisonDps:'*1.4'}],['Ácido Nítrico',{armorPen:'=1.2',dmg:'*1.3'}],['Derretimento Total',{armorPen:'=2',poisonDps:'*1.8',dmg:'*1.5'}]],
  [['Contágio Ácido',{spreadR:'=40'}],['Esporos',{spreadR:'=60',poisonT:'+1'}],['Praga',{spreadR:'=85'}],['Pandemia',{spreadR:'=110',poisonDps:'*1.3'}],['Apocalipse Tóxico',{spreadR:'=160',poisonT:'+3',poisonDps:'*1.6'}]],
  [['Bomba Viscosa',{rate:'*1.25'}],['Alcance Ampliado',{range:'*1.2'}],['Lançador Duplo',{rate:'*1.3',pspeed:'*1.2'}],['Rajada Ácida',{rate:'*1.35'}],['Chuva Ácida',{rate:'*1.7',range:'*1.2',dmg:'*1.2'}]]],
 beacon:[[['Sinal Tático',{auraDmg:'+.05',range:'*1.08'}],['Comando de Pelotão',{auraDmg:'+.06',auraRange:'+.04'}],['Diretriz de Fogo',{auraDmg:'+.08',dmg:'*1.25'}],['Quartel General',{auraDmg:'+.10',auraRange:'+.06'}],['Comando Supremo',{auraDmg:'=.45',auraRange:'=.28',range:'*1.2'}]],
  [['Antena de Longo Alcance',{range:'*1.16'}],['Radar de Perímetro',{range:'*1.16',auraRange:'+.05'}],['Link via Satélite',{range:'*1.2',pierce:'+1'}],['Rede Estratégica',{range:'*1.2',auraDmg:'+.08'}],['Domo de Comando',{range:'=290',auraRange:'=.32'}]],
  [['Laser Guia',{rate:'*1.2',dmg:'*1.2'}],['Sincronia de Tiro',{auraRate:'+.08'}],['Telemetria Rápida',{auraRate:'+.10',rate:'*1.25'}],['Overclock Tático',{auraRate:'+.12',dmg:'*1.3'}],['Sinergia Total',{auraRate:'=.38',auraDmg:'+.12',rate:'*1.4'}]]],
 supplydepot:[[['Comboio Blindado',{income:'+6'}],['Fábrica de Munição',{income:'+9'}],['Cofre Militar',{income:'+14'}],['Refinaria Tática',{income:'+20'}],['Reserva Federal',{income:'+38',range:'*1.15'}]],
  [['Esteira Rápida',{rate:'*1.15',auraRate:'+.04'}],['Logística Expressa',{rate:'*1.16',income:'+5'}],['Distribuição Automática',{rate:'*1.18',auraRate:'+.06'}],['Trem de Carga',{rate:'*1.22',income:'+11'}],['Suprimento Contínuo',{rate:'*1.35',income:'+20',auraRate:'=.32'}]],
  [['Pátio Ampliado',{range:'*1.15',auraRate:'+.04'}],['Munição Calibrada',{auraDmg:'+.08'}],['Arsenal de Apoio',{range:'*1.18',auraDmg:'+.08'}],['Depósito Central',{range:'*1.2',auraRate:'+.08'}],['Complexo Industrial',{range:'*1.28',auraDmg:'=.28',auraRate:'=.28'}]]],
 cryogen:[[['Frequência de Ruptura',{vuln:'+.06'}],['Ressonância Fragilizante',{vuln:'+.08',dmg:'*1.25'}],['Quebra Molecular',{vuln:'+.10'}],['Singularidade Fria',{vuln:'+.12',slow:'=.52'}],['Colapso Absoluto',{vuln:'=.60',slow:'=.68',dmg:'*1.8'}]],
  [['Campo Estendido',{range:'*1.15'}],['Onda de Estase',{slow:'=.46',slowT:'+.6'}],['Domo Gravitacional',{range:'*1.18',freezeChance:'=.18'}],['Prisão Criogênica',{freezeChance:'=.28',freezeT:'=1.3'}],['Horizonte de Eventos',{range:'*1.28',freezeChance:'=.42',freezeT:'=1.9'}]],
  [['Pulso Acelerado',{rate:'*1.2'}],['Bobina de Fase',{rate:'*1.2',dmg:'*1.25'}],['Descarga Dupla',{rate:'*1.25',vuln:'+.06'}],['Ciclo Contínuo',{rate:'*1.28',slowT:'+.6'}],['Tempestade de Estase',{rate:'*1.5',dmg:'*1.6',vuln:'+.12'}]]],
 nanomed:[[['Enxame Reparador',{auraRate:'+.05',healBase:'+1'}],['Nano-Injetores',{auraRate:'+.07',auraDmg:'+.05'}],['Matriz Regenerativa',{healBase:'+1',auraRate:'+.08'}],['Protocolo Vital',{healBase:'+2',auraDmg:'+.10'}],['Arca da Salvação',{healBase:'+3',auraRate:'=.40',auraDmg:'=.30'}]],
  [['Feixe Bio-Elétrico',{dmg:'*1.3',chain:'+1'}],['Descarga Purificadora',{dmg:'*1.35',chainR:'*1.2'}],['Arco Cirúrgico',{chain:'+2',dmg:'*1.35'}],['Sobrecarga Celular',{dmg:'*1.5',slow:'=.38'}],['Julgamento Bio-Médico',{dmg:'*2.1',chain:'+3',range:'*1.18'}]],
  [['Domo de Proteção',{range:'*1.16'}],['Sensores Médicos',{range:'*1.16',auraRange:'+.08'}],['Rede Nano-Tática',{range:'*1.18',auraRate:'+.07'}],['Escudo de Perímetro',{range:'*1.2',healBase:'+1'}],['Santuário Global',{range:'=280',auraRange:'=.25',healBase:'+2'}]]],
 dartgun:[[['Cano Giroscópico',{dmg:'*1.25',range:'*1.15'}],['Calibre Perfurante',{pierce:'+2',armorPen:'+.2'}],['Raios de Plasma',{dmg:'*1.45',pspeed:'*1.25'}],['Acelerador Linear',{dmg:'*1.55',pierce:'+3'}],['Canhão da Perdição',{dmg:'*2.2',pierce:'+5',armorPen:'=.95'}]],
  [['Rotores Triplos',{rate:'*1.25'}],['Gatilho Ciclônico',{rate:'*1.28'}],['Dardos de Tálio',{rate:'*1.3',crit:'+.12',critMult:'=2.2'}],['Barragem de Mísseis',{splash:'=32',dmg:'*1.3'}],['Tempestade Direcional',{rate:'*1.65',splash:'=48',dmg:'*1.45'}]],
  [['Trava Balística',{range:'*1.2',armorPen:'+.15'}],['Rolamentos de Titânio',{pspeed:'*1.35',dmg:'*1.2'}],['Escudo de Chumbo',{bigMult:'=1.45',pierce:'+2'}],['Bateria Autônoma',{rate:'*1.35',range:'*1.2'}],['Zona de Exclusão',{dmg:'*1.8',bigMult:'=1.85',range:'=520'}]]],
 dino:[[['Garras de Velociraptor',{dinoDmg:'*1.3',dmg:'*1.2'}],['Presas de Alossauro',{dinoDmg:'*1.35',armorPen:'+.25'}],['Couraça Jurássica',{allyHp:'*1.4',dinoDmg:'*1.35'}],['Fúria do Tirano',{dinoDmg:'*1.5',stun:'+.25'}],['Rei T-Rex Alfa',{dinoDmg:'*2.2',dmg:'*1.8',stun:'=.85'}]],
  [['Ninho de Patrulha',{rate:'*1.22',allyHp:'*1.25'}],['Bando Coordenado',{rate:'*1.25',pierce:'+1'}],['Instinto de Caça',{rate:'*1.3',crit:'+.15',critMult:'=2.4'}],['Investida Pré-Histórica',{rate:'*1.35',dinoDmg:'*1.3'}],['Manada Implacável',{rate:'*1.7',allyHp:'*2',dmg:'*1.5'}]],
  [['Rugido Sísmico',{range:'*1.18',stun:'+.15'}],['Veneno Dilofossauro',{burnDps:'=18',burnT:'=4'}],['Pele Escamosa',{range:'*1.2',bigMult:'=1.4'}],['Vínculo Primitivo',{range:'*1.22',dinoDmg:'*1.4'}],['Avatar Mesozoico',{range:'*1.35',bigMult:'=1.9',dmg:'*1.75'}]]],
 minefactory:[[['Pilha Reforçada',{maxStacks:'+2',dmg:'*1.2'}],['Explosivo Plástico',{dmg:'*1.3',splash:'*1.15'}],['Minas de Fragmentação',{dmg:'*1.35',armorPen:'+.25'}],['Cargas Termobáricas',{dmg:'*1.5',burnDps:'=28',burnT:'=4'}],['Superminas Cataclísmicas',{dmg:'*2.3',splash:'*1.4',maxStacks:'+4'}]],
  [['Esteira Industrial',{rate:'*1.25'}],['Injetor Pneumático',{rate:'*1.28',range:'*1.12'}],['Produção em Massa',{rate:'*1.32',maxStacks:'+1'}],['Tapete de Minas',{rate:'*1.4',dmg:'*1.25'}],['Fábrica Hipercibernética',{rate:'*1.85',dmg:'*1.4'}]],
  [['Bobina de Choque',{stun:'+.35'}],['Pulso Eletromagnético',{stun:'+.45',armorPen:'+.2'}],['Sensores de Longa Vida',{range:'*1.25',stun:'+.35'}],['Campo Paralisante',{stun:'+.6',splash:'*1.2'}],['Fortaleza de Estase',{stun:'=2.6',dmg:'*1.7',range:'*1.3'}]]],
 portal:[[['Fenda Instável',{dmg:'*1.3',warpBack:'+45'}],['Vórtice Gravitacional',{dmg:'*1.35',pierce:'+2'}],['Horizonte Quântico',{dmg:'*1.45',warpBack:'+65'}],['Ruptura do Espaço',{dmg:'*1.6',armorPen:'=.75'}],['Singularidade Dimensional',{dmg:'*2.3',warpBack:'+140',pierce:'+4'}]],
  [['Recarga de Fase',{rate:'*1.25'}],['Condutor de Dobra',{rate:'*1.28',pspeed:'*1.25'}],['Fluxo Taquiônico',{rate:'*1.32',auraRate:'+.10'}],['Portais Gêmeos',{rate:'*1.38',warpBack:'+55'}],['Malha de Teleporte',{rate:'*1.75',auraRate:'=.28',dmg:'*1.45'}]],
  [['Âncora Espacial',{range:'*1.18',slow:'+.10'}],['Distorção Temporal',{slow:'=.42',slowT:'=2.4'}],['Eco Astral',{range:'*1.22',auraDmg:'+.12'}],['Prisão do Vazio',{stun:'=.35',range:'*1.2'}],['Labirinto Infinito',{range:'=285',auraDmg:'=.26',slow:'=.58'}]]]
};
for(const k in UNIQUE_UPS)TOWER_PATHS[k]=UNIQUE_UPS[k].map(path=>path.map((e,i)=>mkUp(TOWERS[k],i,e)));
const UNIQUE_UPS2={
 gunner:[[['Gatilho Leve',{rate:'*1.2'}],['Pente Estendido',{rate:'*1.2',range:'*1.1'}],['Rajada de Cobertura',{rate:'*1.25',pierce:'+1'}],['Metralhadora Pesada',{rate:'*1.3',dmg:'*1.3'}],['Chuva de Chumbo',{rate:'*1.6',dmg:'*1.4',pierce:'+1'}]],
  [['Ponta Oca',{crit:'+.1',critMult:'=2'}],['Munição Perfurante',{armorPen:'+.3'}],['Traçadoras Explosivas',{splash:'=22'}],['Cartuchos Incendiários',{dmg:'*1.4'}],['Bala de Urânio',{armorPen:'=.8',dmg:'*1.8',bigMult:'=1.5'}]]],
 sniper:[[['Cano Flutuante',{rate:'*1.2'}],['Ferrolho Rápido',{rate:'*1.25'}],['Carregador Semiautomático',{rate:'*1.3'}],['Tiro Duplo',{rate:'*1.4',pierce:'+1'}],['Fuzilamento',{rate:'*1.8',dmg:'*1.2'}]],
  [['Munição Anti-Blindagem',{armorPen:'+.3'}],['Núcleo de Tungstênio',{bigMult:'*1.4'}],['Disparo Letal',{crit:'+.15',critMult:'=3.5'}],['Perfuração Máxima',{pierce:'+2',armorPen:'=.6'}],['Tiro Mortal',{dmg:'*2',bigMult:'*1.5',crit:'+.2'}]]],
 mortar:[[['Recarga Manual',{rate:'*1.25'}],['Alimentador Automático',{rate:'*1.3'}],['Cano de Artilharia',{range:'*1.2',rate:'*1.15'}],['Fogo Rápido',{rate:'*1.35'}],['Barragem Contínua',{rate:'*1.8',splash:'*1.1'}]],
  [['Pólvora Quente',{burnDps:'=8',burnT:'=3'}],['Fogo Grego',{burnDps:'=16',burnT:'=4'}],['Chuva Incendiária',{splash:'*1.25',burnDps:'*1.3'}],['Napalm Pesado',{burnT:'=6',burnDps:'*1.5'}],['Inferno Líquido',{burnDps:'=45',burnT:'=8',splash:'*1.3'}]]],
 flame:[[['Bico Largo',{cone:'*1.3'}],['Leque de Fogo',{cone:'*1.3',range:'*1.1'}],['Muralha de Fogo',{cone:'*1.4'}],['Vórtice Ígneo',{cone:'*1.4',range:'*1.15'}],['Tornado de Fogo',{cone:'*1.5',rate:'*1.2'}]],
  [['Gasolina Aditivada',{burnDps:'*1.4'}],['Napalm em Gel',{burnT:'+2'}],['Termite',{burnDps:'*1.5',dmg:'*1.3'}],['Magma',{burnDps:'*1.6',burnT:'+2'}],['Sol Líquido',{burnDps:'*2',ramp:'*1.5',dmg:'*1.5'}]]],
 tesla:[[['Campo Estático',{slow:'=.45'}],['Choque Leve',{stun:'=.12'}],['Paralisia',{stun:'=.22',slowT:'=2'}],['Gaiola de Faraday',{stun:'=.3',slow:'=.6',chain:'+1'}],['Congelamento Elétrico',{stun:'=.45',slowT:'=3'}]],
  [['Cabos Longos',{chainR:'*1.3'}],['Condutores Duplos',{chain:'+1'}],['Rede Elétrica',{chain:'+2',chainR:'*1.2'}],['Supercondutor',{chain:'+2',range:'*1.2'}],['Tempestade Infinita',{chain:'+4',chainR:'*1.4',dmg:'*1.3'}]]],
 ice:[[['Gelo Denso',{slow:'=.42'}],['Neve Compactada',{slowT:'=2.1',range:'*1.08'}],['Ar Ártico',{slow:'=.50',range:'*1.12'}],['Zero Absoluto',{slow:'=.60',slowT:'=2.6'}],['Era Glacial',{slow:'=.68',range:'*1.22',dmg:'*2.4'}]],
  [['Cristais',{freezeChance:'=.10',freezeT:'=.65'}],['Flocos Cortantes',{dmg:'*1.8',freezeChance:'=.15'}],['Tempestade de Gelo',{freezeChance:'=.22',freezeT:'=1.05',rate:'*1.15'}],['Nitrogênio Líquido',{freezeChance:'=.32',freezeT:'=1.35'}],['Estilhaço Total',{freezeChance:'=.42',freezeT:'=1.65',dmg:'*2.4'}]]],
 poison:[[['Veneno Forte',{poisonDps:'*1.3'}],['Neurotoxina',{poisonDps:'*1.3',poisonT:'+1'}],['Cianeto',{poisonDps:'*1.4'}],['Peste Negra',{poisonDps:'*1.5',poisonT:'+2'}],['Veneno Letal',{poisonDps:'*2.2',armorPen:'=.5'}]],
  [['Esporos Tóxicos',{spreadR:'=35'}],['Nuvem Tóxica',{spreadR:'=55',poisonT:'+1'}],['Surto Infeccioso',{spreadR:'=80'}],['Epidemia Global',{spreadR:'=110',rate:'*1.2'}],['Peste Zumbi',{spreadR:'=150',poisonT:'+3',poisonDps:'*1.4'}]]],
 antitank:[[['Ferrolho Hidráulico',{rate:'*1.25'}],['Autoloader',{rate:'*1.3'}],['Magazine Duplo',{rate:'*1.3'}],['Cano Resfriado',{rate:'*1.35'}],['Metralha Antitanque',{rate:'*1.7'}]],
  [['Ogiva Estilhaço',{splash:'=28'}],['Carga Oca',{dmg:'*1.3',splash:'*1.3'}],['Ogiva HEAT',{dmg:'*1.3',bigMult:'*1.3'}],['Projétil Térmico',{splash:'*1.4',dmg:'*1.3'}],['Bomba Anti-Chefe',{splash:'*1.5',dmg:'*1.8',bigMult:'*1.4'}]]],
 archer:[[['Corda Leve',{rate:'*1.2'}],['Aljava Ampliada',{rate:'*1.25'}],['Tiro Triplo',{rate:'*1.3'}],['Chuva de Flechas',{rate:'*1.35',pierce:'+1'}],['Tempestade de Flechas',{rate:'*1.8',dmg:'*1.2'}]],
  [['Flecha Farpada',{crit:'+.12',critMult:'=2'}],['Ponta de Aço Temperado',{armorPen:'+.25',dmg:'*1.3'}],['Arco Composto',{range:'*1.25',pspeed:'*1.3'}],['Flecha Explosiva',{splash:'=24',dmg:'*1.3'}],['Flecha do Dragão',{dmg:'*2',pierce:'+3',crit:'+.2',critMult:'=3'}]]],
 boomerang:[[['Lâmina Leve',{rate:'*1.2'}],['Retorno Veloz',{rate:'*1.25',pspeed:'*1.2'}],['Giro Duplo',{rate:'*1.3'}],['Serra Voadora',{rate:'*1.35',pierce:'+2'}],['Ciclone de Lâminas',{rate:'*1.7',dmg:'*1.2'}]],
  [['Lâmina Larga',{pierce:'+2'}],['Fio de Aço',{dmg:'*1.3',armorPen:'+.25'}],['Foice',{dmg:'*1.4',pierce:'+2',range:'*1.15'}],['Guilhotina',{dmg:'*1.6',bigMult:'=1.4'}],['Lâmina Cósmica',{dmg:'*2',pierce:'+6',range:'*1.2'}]]],
 engineer:[[['Fusíveis Novos',{rate:'*1.2'}],['Bateria Extra',{dmg:'*1.3'}],['Gerador',{dmg:'*1.4',rate:'*1.15'}],['Reator',{dmg:'*1.5',chain:'+1'}],['Fusão Controlada',{dmg:'*2.2',rate:'*1.3',chain:'+2'}]],
  [['Antena de Campo',{range:'*1.15'}],['Repetidor',{range:'*1.2',chainR:'*1.2'}],['Torre de Transmissão',{range:'*1.25',chain:'+1'}],['Estação Orbital',{range:'*1.3',chainR:'*1.3'}],['Rede Global',{range:'*1.5',chain:'+3',rate:'*1.2'}]]]
};
for(const k in UNIQUE_UPS2){UNIQUE_UPS2[k].forEach((path,j)=>{TOWER_PATHS[k][j+1]=path.map((e,i)=>mkUp(TOWERS[k],i,e));});}
const FINAL5={gunner:['Canhão Rotativo',{dmg:'*1.5',rate:'*1.3',pierce:'+1'}],sniper:['Mira Satélite',{dmg:'*1.8',crit:'+.2',critMult:'=4'}],mortar:['Artilharia Pesada',{dmg:'*1.6',splash:'*1.25'}],flame:['Lança-Chamas de Plasma',{dmg:'*1.6',burnDps:'*1.4',range:'*1.15'}],tesla:['Bobina Mestre',{dmg:'*1.5',chain:'+2'}],ice:['Câmara Criogênica',{slow:'=.62',freezeChance:'+.08',dmg:'*1.8'}],poison:['Toxina Suprema',{poisonDps:'*1.6',poisonT:'+2'}],antitank:['Canhão de Cerco',{dmg:'*1.6',pierce:'+2'}],archer:['Arco Lendário',{dmg:'*1.6',rate:'*1.25'}],boomerang:['Lâmina Eterna',{dmg:'*1.5',pierce:'+3'}],engineer:['Núcleo Experimental',{dmg:'*1.6',chain:'+2',range:'*1.15'}]};
for(const k in FINAL5)TOWER_PATHS[k][0][4]=mkUp(TOWERS[k],4,FINAL5[k]);
const COMBAT_ORDER = ['gunner','dartgun','dino','minefactory','sniper','mortar','flame','tesla','ice','poison','antitank','archer','boomerang','engineer','radar','shotgun','drone','demolition','railgun','medstation','acid'];
const SUPPORT_ORDER = ['portal','beacon','supplydepot','cryogen','nanomed'];
const TOWER_ORDER = [...COMBAT_ORDER, ...SUPPORT_ORDER];
const TOWER_ABILITIES = {
  mortar:{name:'Barragem Explosiva',cost:200,cd:28,desc:'Dispara uma barragem na área selecionada.'},
  tesla:{name:'Sobrecarga',cost:140,cd:25,desc:'Dobra o dano elétrico por 6 segundos.'},
  drone:{name:'Enxame de Drones',cost:175,cd:30,desc:'Pulso de ataque aéreo contra inimigos próximos.'},
  medstation:{name:'Protocolo de Combate',cost:160,cd:32,desc:'Acelera torres próximas por 7 segundos.'},
  flame:{name:'Jato de Napalm',cost:145,cd:26,desc:'Aplica queimadura intensa em inimigos próximos.'},
  beacon:{name:'Ordem de Fogo Total',cost:180,cd:32,desc:'+40% dano e cadência para as torres no alcance por 7s.'},
  supplydepot:{name:'Entrega Aérea',cost:120,cd:40,desc:'Lança um pacote imediato de +280 moedas.'},
  cryogen:{name:'Colapso Temporal',cost:190,cd:34,desc:'Congela os zumbis no alcance por 2,2s e amplifica o dano.'},
  nanomed:{name:'Escudo Nano-Regenerativo',cost:220,cd:38,desc:'Restaura +10 de vida da base e purifica todas as torres.'},
  portal:{name:'Portal Tático',cost:150,cd:24,desc:'Abre portal de entrada no alcance e recua zumbis até o portal de saída na pista.'},
  dino:{name:'Investida Jurássica',cost:165,cd:28,desc:'O Dinossauro solta um rugido sísmico que atordoa e devora inimigos próximos.'}
};
const PRIO_LABEL = {first:'Primeiro', last:'Último', strong:'Forte', close:'Próximo'};
const LVL_COL = ['#9aa0a6','#e0b84a','#e0802a','#d84040'];
const SPEC_COL = ['#ff6a5a','#5ad0ff'];

/* ---- Poderes especiais ---- */
const POWERS = {
  repair:{name:'Reparar Base',cost:500,r:0,desc:'Compra a cada uso: recupera 25 pontos de vida da base.'},
  supply:{name:'Suprimentos',cost:250,r:0,desc:'Recebe +1500 moedas. Só pode ser usado 1 vez a cada 5 minutos, no máximo 3 vezes por partida.'},
  pulse:{name:'Pulso de Contenção',cost:650,r:230,desc:'Compra a cada uso: desacelera todos os zumbis por 5 segundos.'}
};
const POWER_ORDER = ['repair','supply','pulse'];

/* ===================== 2. CAMINHO E UTILITÁRIOS ===================== */
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const rand  = (a,b) => a + Math.random()*(b-a);
const dist  = (ax,ay,bx,by) => Math.hypot(ax-bx, ay-by);
const $ = id => document.getElementById(id);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function angDiff(a,b){let d=a-b;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;}
function fmtTime(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function pruneArr(a,keep){let j=0;for(let i=0;i<a.length;i++){const e=a[i];if(keep(e))a[j++]=e;}a.length=j;}

// distância ao quadrado de um ponto a um segmento (para colisão "varrida" de projéteis)
function segDist2(ax,ay,bx,by,px,py){
  const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
  let t=l2?((px-ax)*dx+(py-ay)*dy)/l2:0; t=t<0?0:t>1?1:t;
  const cx=ax+dx*t-px, cy=ay+dy*t-py; return cx*cx+cy*cy;
}

// Caminho sinuoso (pixels). Entra pela esquerda, termina na base à direita.
const PATH_PTS = (()=>{
  // Quatro rotatórias circulares conectadas, como um distrito urbano abandonado.
  const pts=[[-25,150],[110,150],[150,150]];
  const circles=[{x:245,y:165,r:72},{x:475,y:165,r:72},{x:705,y:365,r:72},{x:475,y:475,r:72}];
  circles.forEach((c,i)=>{
    const startA=i===0?Math.PI:Math.PI;
    for(let j=0;j<=40;j++){const a=startA+j*(Math.PI*2/40);pts.push([Math.round(c.x+c.r*Math.cos(a)),Math.round(c.y+c.r*Math.sin(a))]);}
    if(i<circles.length-1){const n=circles[i+1];pts.push([Math.round((c.x+n.x)/2),Math.round((c.y+n.y)/2)]);pts.push([Math.round(n.x-n.r),Math.round(n.y)]);}
  });
  pts.push([590,475],[790,475],[850,420],[850,320]);
  return pts;
})();
const PATH = []; let PATH_LEN = 0;
(function(){
  for(let i=0;i<PATH_PTS.length-1;i++){
    const a=PATH_PTS[i], b=PATH_PTS[i+1], len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    PATH.push({ax:a[0],ay:a[1],bx:b[0],by:b[1],len,start:PATH_LEN,dx:(b[0]-a[0])/len,dy:(b[1]-a[1])/len});
    PATH_LEN+=len;
  }
})();
const MAPS = {
  four: {name:'Cidade Abandonada', points:null},
  forest: {name:'Floresta Contaminada', points:[[-25,110],[95,110],[155,195],[260,215],[325,105],[465,85],[535,190],[510,330],[655,345],[715,495],[545,535],[420,425],[275,455],[295,555],[745,555],[820,445],[850,320]]},
  industrial: {name:'Complexo Industrial', points:[[-25,175],[140,175],[200,85],[375,85],[430,245],[565,245],[615,95],[775,95],[795,245],[675,295],[675,455],[815,455],[850,320]]},
  metro: {name:'Metrô Subterrâneo', points:[[-25,320],[110,320],[150,125],[315,125],[355,505],[505,505],[545,170],[710,170],[740,395],[830,395],[850,320]]},
  highway: {name:'Rodovia do Apocalipse', points:[[-25,115],[175,115],[265,245],[415,245],[475,110],[660,110],[705,285],[640,495],[415,495],[380,375],[735,365],[850,320]]}
};
// v19: 18 mapas com traçados geométricos/orgânicos distintos e identidades visuais próprias.
(function(){
  const ring=[[-25,320]];for(let j=0;j<=100;j++){const a=Math.PI+j/100*Math.PI*4.5,r=250-j*1.7;ring.push([Math.round(450+r*Math.cos(a)),Math.round(320+r*Math.sin(a))]);}ring.push([850,320]);
  // Subúrbio: avenida residencial com duas rotatórias (cul-de-sacs)
  const subPts=[[-25,310],[120,310]];
  for(let j=0;j<=24;j++){const a=Math.PI+j/24*Math.PI*1.65;subPts.push([Math.round(235+85*Math.cos(a)),Math.round(215+85*Math.sin(a))]);}
  subPts.push([360,460]);
  for(let j=0;j<=24;j++){const a=Math.PI*.8-j/24*Math.PI*1.65;subPts.push([Math.round(525+90*Math.cos(a)),Math.round(425+90*Math.sin(a))]);}
  subPts.push([685,185],[775,185],[815,320],[850,320]);

  // Espiral Hexagonal/Octogonal de Quarentena
  const hexSpiral=[[-25,75],[750,75],[805,140],[805,515],[740,575],[145,575],[90,515],[90,185],[155,140],[645,140],[700,200],[700,445],[640,495],[250,495],[200,440],[200,255],[260,215],[545,215],[585,270],[585,375],[520,410],[350,410],[350,320],[850,320]];

  MAPS.suburbio={name:'Subúrbio Silencioso',skin:'four',diff:'easy',desc:'Cul-de-sacs residenciais e jardins',points:subPts};
  MAPS.clareira={name:'Clareira dos Corvos',skin:'forest',diff:'easy',desc:'Santuário místico ao redor do lago',blocked:[[310,190,190,240]],points:[[-25,490],[175,490],[235,380],[235,165],[315,95],[505,95],[595,165],[615,310],[595,485],[510,555],[725,545],[785,435],[785,320],[850,320]]};
  MAPS.ferrovia={name:'Pátio Ferroviário',skin:'industrial',diff:'easy',desc:'Manobras diagonais entre trens de carga',points:[[-25,140],[640,140],[725,205],[640,275],[185,315],[115,390],[195,475],[715,475],[785,405],[785,320],[850,320]]};
  MAPS.espiral={name:'Espiral da Quarentena',skin:'industrial',diff:'normal',desc:'Vórtice octogonal de contenção bio',points:hexSpiral};
  MAPS.cruzamento={name:'Cruzamento Sinuoso',skin:'metro',diff:'normal',desc:'Viaduto em 8 com pontes elevadas',points:[[-25,150],[250,150],[380,260],[500,490],[650,510],[735,410],[710,235],[550,185],[360,310],[215,475],[125,410],[140,235],[320,105],[690,105],[785,200],[785,320],[850,320]]};
  MAPS.porto={name:'Porto de Contenção',skin:'harbor',diff:'normal',desc:'Cais marítimo, navios e guindastes',blocked:[[210,190,140,220],[520,150,140,220]],points:[[-25,110],[355,110],[410,175],[410,455],[340,515],[135,515],[135,575],[695,575],[745,510],[745,95],[465,95],[450,395],[690,435],[790,385],[850,320]]};
  MAPS.artico={name:'Estação Glacial Ômega',skin:'arctic',diff:'normal',desc:'Geleira polar e fendas de cristal',blocked:[[280,250,150,140]],points:[[-25,105],[190,105],[235,235],[185,495],[315,545],[485,515],[505,135],[635,95],[705,225],[655,485],[775,495],[805,320],[850,320]]};
  MAPS.pantano={name:'Pântano Bio-Tóxico',skin:'forest',diff:'normal',desc:'Passarelas de madeira sobre lodo ácido',blocked:[[160,180,150,160],[490,280,150,160]],points:[[-25,445],[95,445],[115,115],[265,85],[395,135],[395,485],[535,545],[715,505],[735,165],[575,145],[555,220],[785,235],[795,320],[850,320]]};
  MAPS.zigzag={name:'Zigue-Zague de Concreto',skin:'highway',diff:'hard',desc:'Trincheiras em dente-de-serra e bunkers',points:[[-25,300],[85,300],[135,85],[225,550],[320,85],[415,550],[510,85],[605,550],[700,85],[775,445],[805,320],[850,320]]};
  MAPS.aneis={name:'Anéis de Aço',skin:'industrial',diff:'hard',desc:'Coliseu de forja nuclear concêntrica',blocked:[[410,280,80,80]],points:ring};
  MAPS.laboratorio={name:'Complexo Bio-Lab Zero',skin:'lab',diff:'hard',desc:'Câmaras hexagonais e cápsulas crio',blocked:[[240,220,110,190],[520,220,110,190]],points:[[-25,90],[700,90],[760,165],[760,485],[690,550],[440,550],[410,445],[410,165],[350,130],[165,130],[125,215],[125,465],[195,525],[355,505],[790,485],[805,320],[850,320]]};
  MAPS.cratera={name:'Cratera Vulcânica',skin:'volcano',diff:'hard',desc:'Caldeiras de lava e pontes de obsidiana',blocked:[[220,210,140,200],[500,210,140,200]],points:[[-25,515],[125,515],[165,365],[155,135],[285,85],[430,135],[445,485],[575,545],[715,495],[740,135],[800,185],[800,320],[850,320]]};
  MAPS.labirinto={name:'Corredor da Morte',skin:'metro',diff:'hard',desc:'Catacumbas arcanas e fogo fátuo',points:[[-25,235],[235,235],[285,90],[615,90],[670,165],[655,395],[565,425],[155,395],[115,475],[165,555],[735,555],[775,465],[760,240],[455,240],[435,320],[850,320]]};
})();
const EXTRA_MAP_IDS=['suburbio','clareira','ferrovia','espiral','cruzamento','porto','artico','pantano','zigzag','aneis','laboratorio','cratera','labirinto'];
let activeMap='four', activeDifficulty='normal';
function rebuildPath(){
  if(activeMap==='four') return; // retain original hand-built quatro círculos route
  const pts=MAPS[activeMap].points;
  PATH_PTS.splice(0,PATH_PTS.length,...pts.map(p=>p.slice()));
  PATH.length=0; PATH_LEN=0;
  for(let i=0;i<PATH_PTS.length-1;i++){
    const a=PATH_PTS[i],b=PATH_PTS[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!len)continue;
    PATH.push({ax:a[0],ay:a[1],bx:b[0],by:b[1],len,start:PATH_LEN,dx:(b[0]-a[0])/len,dy:(b[1]-a[1])/len});PATH_LEN+=len;
  }
}
function selectMap(id){
  activeMap=MAPS[id]?id:'four';
  if(activeMap==='four'){
    // Recreate the original quatro círculos polyline after another map was selected.
    const pts=[[-25,150],[110,150],[150,150]];
    const circles=[{x:245,y:165,r:72},{x:475,y:165,r:72},{x:705,y:365,r:72},{x:475,y:475,r:72}];
    circles.forEach((c,i)=>{for(let j=0;j<=40;j++){const a=Math.PI+j*(Math.PI*2/40);pts.push([Math.round(c.x+c.r*Math.cos(a)),Math.round(c.y+c.r*Math.sin(a))]);}if(i<circles.length-1){const n=circles[i+1];pts.push([Math.round((c.x+n.x)/2),Math.round((c.y+n.y)/2)]);pts.push([Math.round(n.x-n.r),Math.round(n.y)]);}});
    pts.push([590,475],[790,475],[850,420],[850,320]);
    PATH_PTS.splice(0,PATH_PTS.length,...pts);
    PATH.length=0;PATH_LEN=0;
    for(let i=0;i<PATH_PTS.length-1;i++){const a=PATH_PTS[i],b=PATH_PTS[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);PATH.push({ax:a[0],ay:a[1],bx:b[0],by:b[1],len,start:PATH_LEN,dx:(b[0]-a[0])/len,dy:(b[1]-a[1])/len});PATH_LEN+=len;}
  } else rebuildPath();
  buildBackground();initWeather();
}
function difficultySettings(){return ({easy:{hp:.85,speed:.92,reward:1.12},normal:{hp:1.08,speed:1.03,reward:.96},hard:{hp:1.48,speed:1.16,reward:1.05},apocalypse:{hp:2.05,speed:1.32,reward:1.15}})[activeDifficulty]||{hp:1.08,speed:1.03,reward:.96};}

function pathPos(d,o){
  o=o||{};
  if(d<0)d=0; let s=PATH[PATH.length-1];
  for(let i=0;i<PATH.length;i++){ if(d<=PATH[i].start+PATH[i].len){s=PATH[i];break;} }
  const t=Math.min(d-s.start,s.len);
  o.x=s.ax+s.dx*t; o.y=s.ay+s.dy*t; o.dx=s.dx; o.dy=s.dy; return o;
}
function distToPath(x,y){
  let m=1e9;
  for(const s of PATH){
    const t=clamp((x-s.ax)*s.dx+(y-s.ay)*s.dy,0,s.len);
    const d=Math.hypot(x-(s.ax+s.dx*t), y-(s.ay+s.dy*t)); if(d<m)m=d;
  }
  return m;
}
function nearestPathProg(x,y){ // progresso (distância ao longo do caminho) do ponto mais próximo
  let best={d:0,dist:1e9};
  for(const s of PATH){
    const t=clamp((x-s.ax)*s.dx+(y-s.ay)*s.dy,0,s.len);
    const d=Math.hypot(x-(s.ax+s.dx*t), y-(s.ay+s.dy*t));
    if(d<best.dist){best.dist=d;best.d=s.start+t;}
  }
  return best;
}

/* ===================== 3. FUNDO TÁTICO HD (GERADO POR CÓDIGO — 18 MAPAS ÚNICOS) ===================== */
let BG = null;
function buildBackground(){
  const bgSkin=(MAPS[activeMap]&&MAPS[activeMap].skin)||activeMap;
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d');
  const rng=mulberry32(20261028 + (Object.keys(MAPS).indexOf(activeMap)+1)*137);
  const rr=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};

  // Paleta e estilo de pista exclusivos para cada um dos 18 mapas
  const mapThemes={
    four:       {bg0:'#252c34',bg1:'#14191f',patches:['#2e3740','#1d242b','#353f49'],curb:'#11151a',edge:'#64748b',road:'#2b323b',lane:'#363f4a',detail:'#facc15',roadStyle:'urban'},
    forest:     {bg0:'#1a3620',bg1:'#0d1e11',patches:['#24472b','#142b19','#2f5733'],curb:'#142416',edge:'#4d3822',road:'#664b30',lane:'#7a5b3b',detail:'#a88e58',roadStyle:'dirt'},
    industrial: {bg0:'#332822',bg1:'#1c1512',patches:['#40322a','#261d18','#4a3a30'],curb:'#171210',edge:'#eab308',road:'#333638',lane:'#43474a',detail:'#f59e0b',roadStyle:'hazard'},
    metro:      {bg0:'#131e30',bg1:'#090f19',patches:['#1b2940','#0e1624','#22334f'],curb:'#080c14',edge:'#38bdf8',road:'#1b222c',lane:'#252f3d',detail:'#38bdf8',roadStyle:'rails'},
    highway:    {bg0:'#783f24',bg1:'#472211',patches:['#8c4c2d','#5e2f18','#9e5936'],curb:'#3b1d0e',edge:'#d6b88e',road:'#2d2f33',lane:'#3b3e44',detail:'#facc15',roadStyle:'highway'},
    suburbio:   {bg0:'#2f5e29',bg1:'#1d3d19',patches:['#3b7034','#254d20','#46803e'],curb:'#cbd5e1',edge:'#94a3b8',road:'#475569',lane:'#56657a',detail:'#f8fafc',roadStyle:'suburb'},
    clareira:   {bg0:'#281e42',bg1:'#140e24',patches:['#342754','#1d1533','#413166'],curb:'#1e1b2e',edge:'#a8a29e',road:'#57534e',lane:'#78716c',detail:'#c084fc',roadStyle:'cobble'},
    ferrovia:   {bg0:'#4d3e2e',bg1:'#2e241a',patches:['#5c4a38','#3b2f22','#6b5742'],curb:'#211a12',edge:'#78716c',road:'#44403c',lane:'#57534e',detail:'#f59e0b',roadStyle:'rails'},
    espiral:    {bg0:'#2e2816',bg1:'#17140a',patches:['#3d351d','#241f10','#4a4023'],curb:'#141108',edge:'#facc15',road:'#383322',lane:'#4a432d',detail:'#fde047',roadStyle:'hazard'},
    cruzamento: {bg0:'#1b362c',bg1:'#0f211a',patches:['#244539','#152b23','#2d5446'],curb:'#1e293b',edge:'#cbd5e1',road:'#334155',lane:'#475569',detail:'#38bdf8',roadStyle:'viaduct'},
    porto:      {bg0:'#162c40',bg1:'#0b1724',patches:['#1e3a52','#102233','#254663'],curb:'#0c1622',edge:'#eab308',road:'#334155',lane:'#475569',detail:'#38bdf8',roadStyle:'dock'},
    artico:     {bg0:'#c8e3f6',bg1:'#88b3d4',patches:['#dcf0fc','#a3cae6','#e8f6ff'],curb:'#1e293b',edge:'#f97316',road:'#2b394a',lane:'#394b61',detail:'#7dd3fc',roadStyle:'arctic'},
    pantano:    {bg0:'#263314',bg1:'#141c09',patches:['#32421b','#1c260e','#3f5223'],curb:'#291d12',edge:'#785536',road:'#4a331f',lane:'#5c4028',detail:'#a3e635',roadStyle:'boardwalk'},
    zigzag:     {bg0:'#3d3024',bg1:'#211912',patches:['#4d3d2e','#2e231a','#594736'],curb:'#8c734b',edge:'#b59b6d',road:'#3f3a34',lane:'#4f4942',detail:'#d6c39c',roadStyle:'trench'},
    aneis:      {bg0:'#38181b',bg1:'#1c0b0d',patches:['#4a2024','#291114','#59272c'],curb:'#18181b',edge:'#f59e0b',road:'#3f3f46',lane:'#52525b',detail:'#38bdf8',roadStyle:'forge'},
    laboratorio:{bg0:'#16303b',bg1:'#0b1921',patches:['#1e3f4d','#10242e','#254d5e'],curb:'#064e3b',edge:'#2be3a1',road:'#0f172a',lane:'#1e293b',detail:'#38bdf8',roadStyle:'circuit'},
    cratera:    {bg0:'#240e0a',bg1:'#0f0503',patches:['#33140e','#1a0906','#421a12'],curb:'#450a0a',edge:'#f97316',road:'#261c1a',lane:'#362825',detail:'#fde047',roadStyle:'lava'},
    labirinto:  {bg0:'#241a36',bg1:'#120c1c',patches:['#302347','#1a1229','#3d2c59'],curb:'#1a1126',edge:'#a855f7',road:'#352c47',lane:'#463b5c',detail:'#e879f9',roadStyle:'crypt'}
  };
  const th=mapThemes[activeMap]||mapThemes.four;

  // 1. Base do terreno com gradiente radial e manchas orgânicas
  const baseGrd=g.createRadialGradient(W*.48,H*.45,40,W*.5,H*.5,W*.75);
  baseGrd.addColorStop(0,th.bg0);baseGrd.addColorStop(1,th.bg1);
  g.fillStyle=baseGrd;g.fillRect(0,0,W,H);

  for(let i=0;i<90;i++){
    const px=rng()*W,py=rng()*H,rx=24+rng()*65,ry=16+rng()*45;
    g.fillStyle=th.patches[(rng()*th.patches.length)|0];
    g.globalAlpha=.34+rng()*.28;
    g.beginPath();g.ellipse(px,py,rx,ry,rng()*3.14,0,6.283);g.fill();
  }
  g.globalAlpha=1;

  // Grão fino de superfície
  for(let i=0;i<1100;i++){
    const gx=rng()*W,gy=rng()*H;
    g.fillStyle=rng()<.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.12)';
    g.fillRect(gx,gy,rng()<.3?3:2,2);
  }

  // 1B. Texturas de solo exclusivas de cada mapa (antes da pista)
  if(activeMap==='four'){
    for(let y=64;y<H;y+=128){rr(0,y,W,2,'rgba(255,255,255,.05)');rr(0,y+2,W,1,'rgba(0,0,0,.35)');}
    for(let x=80;x<W;x+=160){rr(x,0,2,H,'rgba(255,255,255,.05)');rr(x+2,0,1,H,'rgba(0,0,0,.35)');}
  } else if(activeMap==='suburbio'){
    // Lotes gramados residenciais com cercas brancas e piscinas azuis
    for(const [lx,ly,lw,lh] of [[28,28,125,115],[340,28,155,110],[535,28,135,120],[28,365,155,225],[655,355,155,235]]){
      g.fillStyle='rgba(74,145,62,.35)';g.fillRect(lx,ly,lw,lh);
      g.strokeStyle='rgba(241,245,249,.45)';g.lineWidth=1.5;g.setLineDash([6,4]);g.strokeRect(lx,ly,lw,lh);g.setLineDash([]);
    }
    // Duas piscinas residenciais iluminadas
    for(const [px,py,pw,ph] of [[68,48,54,32],[695,495,62,36]]){
      if(distToPath(px+pw/2,py+ph/2)>46){
        rr(px-3,py-3,pw+6,ph+6,'#e2e8f0');rr(px,py,pw,ph,'#0ea5e9');rr(px+4,py+4,pw-8,ph-8,'#38bdf8');
      }
    }
  } else if(activeMap==='forest'){
    // Folhas de outono e clareiras de musgo
    for(let i=0;i<150;i++){
      const x=rng()*W,y=rng()*H;
      if(distToPath(x,y)>38){
        g.fillStyle=rng()<.35?'rgba(217,119,6,.32)':rng()<.7?'rgba(77,124,15,.35)':'rgba(34,84,42,.4)';
        g.beginPath();g.ellipse(x,y,4+rng()*9,3+rng()*6,rng()*3,0,6.283);g.fill();
      }
    }
  } else if(activeMap==='clareira'){
    // Círculos místicos e névoa violeta ao redor do lago
    for(let r=130;r<=260;r+=65){
      g.strokeStyle='rgba(192,132,252,.14)';g.lineWidth=1.5;
      g.beginPath();g.arc(405,310,r,0,6.283);g.stroke();
    }
  } else if(activeMap==='industrial'){
    // Dutos industriais no chão e manchas de óleo
    for(let y=48;y<H;y+=96){rr(0,y,W,1,'rgba(255,255,255,.06)');rr(0,y+1,W,1,'rgba(0,0,0,.45)');}
    for(let i=0;i<14;i++){
      const ox=rng()*W,oy=rng()*H;
      if(distToPath(ox,oy)>45){g.fillStyle='rgba(10,10,12,.55)';g.beginPath();g.ellipse(ox,oy,14+rng()*14,8+rng()*9,rng()*3,0,6.283);g.fill();}
    }
  } else if(activeMap==='ferrovia'){
    // Linhas férreas auxiliares paralelas atravessando o pátio
    for(const ry of [62, 562]){
      rr(20,ry-6,760,12,'#29221a');
      for(let tx=28;tx<770;tx+=14)rr(tx,ry-5,4,10,'#4a3728');
      rr(20,ry-3,760,2,'#94a3b8');rr(20,ry+2,760,2,'#94a3b8');
    }
  } else if(activeMap==='espiral'){
    // Teia octogonal de contenção amarela/preta
    g.strokeStyle='rgba(250,204,21,.12)';g.lineWidth=1.5;
    for(let r=60;r<=320;r+=52){g.beginPath();g.arc(450,320,r,0,6.283);g.stroke();}
  } else if(activeMap==='metro'){
    // Ladrilhos táticos de estação subterrânea, canaletas de drenagem e iluminação neon de plataforma
    for(let y=32;y<H;y+=64){rr(0,y,W,1,'#293548');rr(0,y+1,W,1,'rgba(0,0,0,.45)');}
    for(let x=48;x<W;x+=96){rr(x,0,1,H,'#222d3d');rr(x+1,0,1,H,'rgba(0,0,0,.4)');}
    for(let i=0;i<10;i++){
      const x=36+i*94;
      rr(x,10,46,6,'#0f172a');rr(x+2,12,42,3,'rgba(56,189,248,.75)');
      rr(x,H-18,46,6,'#0f172a');rr(x+2,H-16,42,3,'rgba(56,189,248,.55)');
    }
    // Faixas amarelas de segurança de embarque nas plataformas subterrâneas
    for(const [px,py,pw,ph] of [[175,55,120,34],[380,545,115,32],[565,95,125,34]]){
      if(distToPath(px+pw/2,py+ph/2)>44){
        rr(px,py,pw,ph,'#1e293b');
        g.strokeStyle='#38bdf8';g.lineWidth=1;g.strokeRect(px,py,pw,ph);
        for(let sx=px+4;sx<px+pw-6;sx+=10)rr(sx,py+ph-5,6,3,'#facc15');
      }
    }
  } else if(activeMap==='cruzamento'){
    // Canteiros verdes de rodovia expressa e faixas de drenagem
    for(let x=64;x<W;x+=128)rr(x,0,1,H,'rgba(148,163,184,.08)');
    for(let y=64;y<H;y+=128)rr(0,y,W,1,'rgba(148,163,184,.08)');
  } else if(activeMap==='highway'){
    // Falésias e estratos de cânion vermelho-terracota
    for(let i=0;i<65;i++){
      const x=rng()*W,y=rng()*H;
      if(distToPath(x,y)>36){
        g.strokeStyle=rng()<.5?'rgba(254,215,170,.22)':'rgba(67,20,7,.45)';
        g.lineWidth=2;g.beginPath();g.moveTo(x,y);g.lineTo(x+16+rng()*28,y+(rng()-.5)*6);g.stroke();
      }
    }
  } else if(activeMap==='zigzag'){
    // Crateras de artilharia no campo de batalha e marcas de lama
    for(let i=0;i<18;i++){
      const cx=40+rng()*(W-140),cy=40+rng()*(H-80);
      if(distToPath(cx,cy)>44){
        g.fillStyle='rgba(15,12,10,.55)';g.beginPath();g.ellipse(cx,cy,14+rng()*10,10+rng()*7,0,0,6.283);g.fill();
        g.strokeStyle='rgba(120,100,75,.35)';g.lineWidth=2;g.stroke();
      }
    }
  } else if(activeMap==='aneis'){
    // Nervuras radiais de aço do Coliseu Nuclear convergindo para o reator central (450,320)
    g.strokeStyle='rgba(245,158,11,.22)';g.lineWidth=3;
    for(let a=0;a<6.283;a+=Math.PI/6){
      g.beginPath();g.moveTo(450+Math.cos(a)*55,320+Math.sin(a)*55);
      g.lineTo(450+Math.cos(a)*340,320+Math.sin(a)*340);g.stroke();
    }
  } else if(activeMap==='laboratorio'){
    // Piso modular hexagonal/cibernético verde-ciano de laboratório
    for(let y=32;y<H;y+=48)rr(0,y,W,1,'rgba(43,227,161,.16)');
    for(let x=32;x<W;x+=48)rr(x,0,1,H,'rgba(56,189,248,.16)');
  } else if(activeMap==='cratera'){
    // Veios de magma incandescente cortando a rocha obsidiana
    for(let i=0;i<95;i++){
      const x=rng()*W,y=rng()*H;
      if(distToPath(x,y)>36){
        g.strokeStyle=rng()<.55?'rgba(249,115,22,.6)':'rgba(253,224,71,.45)';
        g.lineWidth=rng()<.4?2.2:1.2;g.beginPath();g.moveTo(x,y);g.lineTo(x+10+rng()*22,y+(rng()-.5)*16);g.stroke();
      }
    }
  } else if(activeMap==='labirinto'){
    // Lajes de catacumba arcana e círculos rúnicos roxos no chão
    for(let y=40;y<H;y+=40)rr(0,y,W,1,'rgba(168,85,247,.12)');
    for(let x=40;x<W;x+=40)rr(x,0,1,H,'rgba(168,85,247,.12)');
    for(const [rx,ry] of [[210,165],[455,165],[285,475],[615,475]]){
      if(distToPath(rx,ry)>42){
        g.strokeStyle='rgba(232,121,249,.35)';g.lineWidth=1.5;
        g.beginPath();g.arc(rx,ry,22,0,6.283);g.stroke();
        g.beginPath();g.arc(rx,ry,14,0,6.283);g.stroke();
      }
    }
  } else if(activeMap==='pantano'){
    // Poças de lodo ácido borbulhante espalhadas pelo manguezal
    for(let i=0;i<22;i++){
      const x=rng()*W,y=rng()*H;
      if(distToPath(x,y)>44){
        const rx=12+rng()*18,ry=8+rng()*12;
        const pg=g.createRadialGradient(x,y,2,x,y,rx);
        pg.addColorStop(0,'rgba(163,230,53,.55)');pg.addColorStop(.65,'rgba(77,124,15,.35)');pg.addColorStop(1,'rgba(20,40,10,0)');
        g.fillStyle=pg;g.beginPath();g.ellipse(x,y,rx,ry,rng(),0,6.283);g.fill();
      }
    }
  } else if(activeMap==='artico'){
    // Placas de gelo translúcido e fendas glaciais azul-profundo
    for(let i=0;i<80;i++){
      const x=rng()*W,y=rng()*H;
      if(distToPath(x,y)>38){
        g.strokeStyle=rng()<.5?'rgba(255,255,255,.55)':'rgba(2,132,199,.35)';
        g.lineWidth=1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+12+rng()*22,y+(rng()-.5)*12);g.stroke();
      }
    }
  }

  // 2. Zonas Bloqueadas (Lago Místico, Bacias Portuárias, Gelo, Lodo Ácido, Reator Nuclear, Crio-Tanques e Caldeiras de Lava)
  for(const [bx,by,bw,bh] of (MAPS[activeMap].blocked||[])){
    const cx=bx+bw/2,cy=by+bh/2;
    g.fillStyle='rgba(0,0,0,.52)';g.beginPath();g.roundRect?g.roundRect(bx-10,by-10,bw+20,bh+20,18):g.fillRect(bx-10,by-10,bw+20,bh+20);g.fill();
    g.fillStyle=activeMap==='cratera'?'#450a0a':activeMap==='artico'?'#bae6fd':activeMap==='laboratorio'?'#0f172a':activeMap==='pantano'?'#365314':activeMap==='aneis'?'#27272a':activeMap==='clareira'?'#312e81':'#475569';
    g.beginPath();g.roundRect?g.roundRect(bx-6,by-6,bw+12,bh+12,14):g.fillRect(bx-6,by-6,bw+12,bh+12);g.fill();
    const wg=g.createRadialGradient(cx-bw*.15,cy-bh*.15,6,cx,cy,Math.max(bw,bh)*.75);
    if(activeMap==='cratera'){
      wg.addColorStop(0,'#fef08a');wg.addColorStop(.32,'#f97316');wg.addColorStop(.72,'#dc2626');wg.addColorStop(1,'#450a0a');
    } else if(activeMap==='artico'){
      wg.addColorStop(0,'#f0f9ff');wg.addColorStop(.5,'#7dd3fc');wg.addColorStop(1,'#0369a1');
    } else if(activeMap==='laboratorio'){
      wg.addColorStop(0,'#a7f3d0');wg.addColorStop(.45,'#10b981');wg.addColorStop(1,'#064e3b');
    } else if(activeMap==='pantano'){
      wg.addColorStop(0,'#bef264');wg.addColorStop(.5,'#65a30d');wg.addColorStop(1,'#1a2e05');
    } else if(activeMap==='aneis'){
      wg.addColorStop(0,'#e0f2fe');wg.addColorStop(.4,'#38bdf8');wg.addColorStop(.8,'#0284c7');wg.addColorStop(1,'#1e1b4b');
    } else if(activeMap==='clareira'){
      wg.addColorStop(0,'#67e8f9');wg.addColorStop(.5,'#0284c7');wg.addColorStop(1,'#1e1b4b');
    } else {
      wg.addColorStop(0,'#0284c7');wg.addColorStop(.6,'#075985');wg.addColorStop(1,'#082f49');
    }
    g.fillStyle=wg;
    g.beginPath();g.roundRect?g.roundRect(bx,by,bw,bh,10):g.fillRect(bx,by,bw,bh);g.fill();

    // Detalhes internos específicos da zona bloqueada de cada mapa
    if(activeMap==='porto'){
      // Barcos rebocadores/chatas atracados nas bacias do porto
      rr(cx-24,cy-45,48,90,'#1e293b');rr(cx-20,cy-40,40,80,'#334155');
      rr(cx-14,cy-28,28,24,'#dc2626');rr(cx-14,cy+4,28,24,'#2563eb');
      rr(cx-10,cy-6,20,10,'#f8fafc');
    } else if(activeMap==='clareira'){
      // Píer de madeira místico avançando sobre o lago central
      rr(bx,cy-12,48,24,'#5c4028');
      for(let px=bx+4;px<bx+46;px+=7)rr(px,cy-11,4,22,'#7c5836');
    } else if(activeMap==='laboratorio'){
      // Cápsulas criogênicas circulares brilhantes dentro dos tanques
      for(const py of [by+50, by+bh-50]){
        g.strokeStyle='#a7f3d0';g.lineWidth=2;g.beginPath();g.arc(cx,py,24,0,6.283);g.stroke();
        g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.arc(cx-6,py-6,8,0,6.283);g.fill();
      }
    } else if(activeMap==='aneis'){
      // Bobina de fusão nuclear no centro dos Anéis de Aço
      g.strokeStyle='#fde047';g.lineWidth=2.5;g.beginPath();g.arc(cx,cy,26,0,6.283);g.stroke();
      g.fillStyle='#ffffff';g.beginPath();g.arc(cx,cy,10,0,6.283);g.fill();
    } else if(activeMap==='pantano'){
      // Bolhas ácidas e barris bio-tóxicos afundados no charco
      for(let b=0;b<6;b++){
        g.fillStyle='rgba(217,249,157,.65)';g.beginPath();g.arc(bx+25+b*20,cy+((b%2)*30-15),5+(b%3)*3,0,6.283);g.fill();
      }
    } else {
      g.strokeStyle=activeMap==='cratera'?'rgba(254,240,138,.55)':'rgba(186,230,253,.35)';g.lineWidth=1.3;
      for(let ry=by+14;ry<by+bh-10;ry+=16){
        g.beginPath();g.moveTo(bx+12,ry);g.quadraticCurveTo(cx,ry+(ry%32===0?5:-5),bx+bw-12,ry);g.stroke();
      }
    }
    g.strokeStyle=th.edge;g.lineWidth=2.5;g.strokeRect(bx,by,bw,bh);
  }

  // 3. Traçado Principal da Estrada / Caminho com Textura Exclusiva por Mapa
  g.lineJoin='round';g.lineCap='round';
  const strokePath=(col,w,dash)=>{
    g.beginPath();g.moveTo(PATH_PTS[0][0],PATH_PTS[0][1]);
    for(let i=1;i<PATH_PTS.length;i++)g.lineTo(PATH_PTS[i][0],PATH_PTS[i][1]);
    g.strokeStyle=col;g.lineWidth=w;
    if(dash)g.setLineDash(dash);else g.setLineDash([]);
    g.stroke();g.setLineDash([]);
  };
  strokePath('rgba(0,0,0,.48)',70);
  strokePath(th.curb,62);
  strokePath(th.edge,56);
  strokePath(th.road,48);
  strokePath(th.lane,34);

  const tmp={};
  if(th.roadStyle==='rails'){
    // Dormentes de madeira e trilhos de aço ferroviários/metrô
    for(let d=10;d<PATH_LEN;d+=18){
      pathPos(d,tmp);
      g.save();g.translate(tmp.x,tmp.y);g.rotate(Math.atan2(tmp.dy,tmp.dx));
      rr(-3,-19,6,38,'#1c1917');rr(-2,-18,3,36,'#4a3728');
      rr(-3,-12,6,2.2,'#cbd5e1');rr(-3,10,6,2.2,'#cbd5e1');
      g.restore();
    }
    if(activeMap==='metro')strokePath('rgba(56,189,248,.45)',2,[10,14]);
  } else if(th.roadStyle==='boardwalk'){
    // Passarela de tábuas de madeira suspensa sobre o pântano
    for(let d=8;d<PATH_LEN;d+=14){
      pathPos(d,tmp);
      g.save();g.translate(tmp.x,tmp.y);g.rotate(Math.atan2(tmp.dy,tmp.dx));
      rr(-4,-24,8,48,'#3b2614');rr(-3,-22,5,44,'#6b482a');
      rr(-2,-24,3,3,'#a3e635');rr(-2,21,3,3,'#a3e635');
      g.restore();
    }
  } else if(th.roadStyle==='trench'){
    // Trincheira militar fortificada com sacos de areia nas duas bordas e tábuas de piso
    strokePath('rgba(30,25,20,.55)',20,[8,8]);
    for(let d=14;d<PATH_LEN;d+=22){
      pathPos(d,tmp);
      g.save();g.translate(tmp.x,tmp.y);g.rotate(Math.atan2(tmp.dy,tmp.dx));
      rr(-6,-28,12,6,'#a89068');rr(-5,-27,10,4,'#c2ab82');
      rr(-6,22,12,6,'#a89068');rr(-5,23,10,4,'#c2ab82');
      g.restore();
    }
  } else if(th.roadStyle==='cobble'){
    // Calçamento de pedras místicas na Clareira dos Corvos
    strokePath('rgba(214,211,209,.28)',26,[10,8]);
    strokePath('rgba(192,132,252,.45)',2,[6,12]);
  } else if(th.roadStyle==='circuit'){
    // Trilha cibernética de laboratório com feixes neon duplos
    strokePath('rgba(43,227,161,.55)',26,[18,10]);
    strokePath('#38bdf8',2.5);
  } else if(th.roadStyle==='lava'){
    // Calçada de basalto vulcânico com fendas de magma laranja brilhante
    strokePath('rgba(249,115,22,.65)',44,[14,10]);
    strokePath(th.road,36);
    strokePath('rgba(253,224,71,.7)',2,[8,14]);
  } else if(th.roadStyle==='crypt'){
    // Lajes de pedra de catacumba com runas violeta
    strokePath('rgba(168,85,247,.38)',38,[16,8]);
    strokePath('rgba(232,121,249,.65)',2,[4,12]);
  } else if(th.roadStyle==='arctic'){
    // Estrada glacial com balizas polares laranja nas margens
    strokePath('rgba(186,230,253,.35)',18,[16,12]);
    for(let d=30;d<PATH_LEN;d+=65){
      pathPos(d,tmp);
      rr(tmp.x-tmp.dy*26-2,tmp.y+tmp.dx*26-6,4,8,'#f97316');
      rr(tmp.x+tmp.dy*26-2,tmp.y-tmp.dx*26-6,4,8,'#f97316');
    }
  } else if(th.roadStyle==='hazard'){
    // Pista industrial/quarentena com faixas zebradas amarelas de alerta
    strokePath('rgba(250,204,21,.75)',5,[12,8]);
    strokePath(th.road,1.5);
  } else if(th.roadStyle==='suburb'){
    // Rua residencial clara com calçadas brancas e faixa tracejada suave
    strokePath('rgba(248,250,252,.65)',2,[12,14]);
  } else if(th.roadStyle==='viaduct'){
    // Viaduto elevado com muretas laterais brancas/azuis e ponte central no cruzamento
    strokePath('rgba(56,189,248,.6)',2,[14,10]);
    // Desenha viaduto superior onde a pista se cruza (x~365, y~285)
    g.save();g.translate(368,295);g.rotate(-0.62);
    rr(-42,-34,84,68,'rgba(0,0,0,.45)');
    rr(-40,-28,80,56,'#cbd5e1');rr(-40,-22,80,44,'#334155');
    rr(-38,-1,76,2,'#38bdf8');
    g.restore();
  } else if(th.roadStyle==='forge'){
    // Anéis de Aço com condutores de plasma dourado/ciano
    strokePath('rgba(245,158,11,.65)',3,[10,8]);
  } else if(th.roadStyle==='dirt'){
    strokePath('rgba(40,28,16,.48)',22,[18,10]);
    strokePath('rgba(217,185,130,.38)',2,[6,14]);
  } else {
    strokePath('rgba(250,204,21,.78)',2.5,[14,12]);
  }

  // Setas táticas sutis indicando o fluxo da horda ao longo do caminho
  for(let d=70;d<PATH_LEN-60;d+=140){
    pathPos(d,tmp);
    g.save();g.translate(tmp.x,tmp.y);g.rotate(Math.atan2(tmp.dy,tmp.dx));
    g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;
    g.beginPath();g.moveTo(-5,-6);g.lineTo(3,0);g.lineTo(-5,6);g.stroke();
    g.restore();
  }

  // 4. Monumentos, Arquitetura e Elementos Cenográficos Exclusivos de Cada Mapa
  const items=[];
  const free=(x,y,r)=>{
    if(distToPath(x,y)<r+32)return false;
    if(x>795&&y>165&&y<345)return false;
    if(x<65&&y>25&&y<160)return false;
    for(const [bx,by,bw,bh] of (MAPS[activeMap].blocked||[]))if(x>bx-r-12&&x<bx+bw+r+12&&y>by-r-12&&y<by+bh+r+12)return false;
    for(const it of items)if(Math.hypot(it.x-x,it.y-y)<it.r+r)return false;
    return true;
  };

  // Funções de objetos cenográficos customizados por bioma
  const dTree=(x,y)=>{
    const r=14+rng()*6;
    g.fillStyle='rgba(0,0,0,.36)';g.beginPath();g.ellipse(x+7,y+6,r*1.15,r*.65,.3,0,6.283);g.fill();
    rr(x-3,y-6,6,11,'#3d2b1d');
    const isAutumn=activeMap==='forest'&&rng()<.32;
    const isMystic=activeMap==='clareira';
    const cg=g.createRadialGradient(x-r*.3,y-12-r*.3,2,x,y-10,r*1.1);
    if(isMystic){cg.addColorStop(0,'#e879f9');cg.addColorStop(.55,'#9333ea');cg.addColorStop(1,'#3b0764');}
    else if(isAutumn){cg.addColorStop(0,'#fb923c');cg.addColorStop(.55,'#c2410c');cg.addColorStop(1,'#431407');}
    else {cg.addColorStop(0,'#65a34e');cg.addColorStop(.55,'#2e6934');cg.addColorStop(1,'#16381d');}
    g.fillStyle=cg;g.beginPath();g.arc(x,y-10,r,0,6.283);g.fill();
  };
  const dSnowPine=(x,y)=>{
    g.fillStyle='rgba(0,30,60,.28)';g.beginPath();g.ellipse(x+5,y+4,13,6,0,0,6.283);g.fill();
    rr(x-2,y-4,4,8,'#451a03');
    for(let l=0;l<3;l++){
      const w=15-l*3.5,py=y-6-l*6;
      g.fillStyle='#1e3a2f';g.beginPath();g.moveTo(x-w,py);g.lineTo(x,py-11);g.lineTo(x+w,py);g.closePath();g.fill();
      g.fillStyle='#f0f9ff';g.beginPath();g.moveTo(x-w*.7,py-3);g.lineTo(x,py-11);g.lineTo(x+w*.7,py-3);g.closePath();g.fill();
    }
  };
  const dIceCrystal=(x,y)=>{
    g.fillStyle='rgba(2,132,199,.32)';g.beginPath();g.ellipse(x+3,y+3,12,6,0,0,6.283);g.fill();
    g.fillStyle='#38bdf8';g.beginPath();g.moveTo(x-7,y+2);g.lineTo(x-2,y-16);g.lineTo(x+5,y+2);g.closePath();g.fill();
    g.fillStyle='#bae6fd';g.beginPath();g.moveTo(x,y+3);g.lineTo(x+6,y-12);g.lineTo(x+10,y+3);g.closePath();g.fill();
    g.fillStyle='#ffffff';g.beginPath();g.moveTo(x-2,y-16);g.lineTo(x+1,y-4);g.lineTo(x-4,y-4);g.closePath();g.fill();
  };
  const dSwampSpore=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.38)';g.beginPath();g.ellipse(x+3,y+3,12,6,0,0,6.283);g.fill();
    rr(x-3,y-7,6,10,'#d6d3d1');
    g.fillStyle='#84cc16';g.beginPath();g.ellipse(x,y-9,12,7,0,Math.PI,6.283);g.fill();
    g.fillStyle='#bef264';g.beginPath();g.arc(x-4,y-12,2.5,0,6.283);g.arc(x+4,y-11,2,0,6.283);g.fill();
  };
  const dCactus=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.32)';g.beginPath();g.ellipse(x+5,y+3,9,4,0,0,6.283);g.fill();
    rr(x-3,y-18,6,21,'#15803d');rr(x-9,y-13,6,3,'#15803d');rr(x-9,y-18,3,6,'#15803d');
    rr(x+3,y-11,6,3,'#15803d');rr(x+6,y-16,3,6,'#15803d');
    rr(x-1,y-17,2,19,'#4ade80');
  };
  const dMesa=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.38)';g.beginPath();g.ellipse(x+6,y+5,20,10,0,0,6.283);g.fill();
    g.fillStyle='#7c2d12';g.beginPath();g.moveTo(x-18,y+6);g.lineTo(x-12,y-10);g.lineTo(x+12,y-10);g.lineTo(x+18,y+6);g.closePath();g.fill();
    g.fillStyle='#c2410c';g.beginPath();g.moveTo(x-12,y-10);g.lineTo(x+12,y-10);g.lineTo(x+9,y-4);g.lineTo(x-9,y-4);g.closePath();g.fill();
  };
  const dContainer=(x,y)=>{
    const col=['#dc2626','#2563eb','#16a34a','#d97706'][(rng()*4)|0];
    rr(x-16,y-6,36,16,'rgba(0,0,0,.42)');
    rr(x-18,y-9,36,15,col);rr(x-18,y-9,36,3,'rgba(255,255,255,.22)');
    for(let cx=x-14;cx<x+15;cx+=5)rr(cx,y-6,2,10,'rgba(0,0,0,.22)');
  };
  const dTankTrap=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.ellipse(x+2,y+3,10,5,0,0,6.283);g.fill();
    g.strokeStyle='#334155';g.lineWidth=3.5;
    g.beginPath();g.moveTo(x-8,y+4);g.lineTo(x+8,y-8);g.moveTo(x-8,y-6);g.lineTo(x+8,y+4);g.moveTo(x,y-10);g.lineTo(x,y+6);g.stroke();
    g.strokeStyle='#94a3b8';g.lineWidth=1.2;
    g.beginPath();g.moveTo(x-7,y+3);g.lineTo(x+7,y-7);g.stroke();
  };
  const dObsidian=(x,y)=>{
    g.fillStyle='rgba(249,115,22,.28)';g.beginPath();g.ellipse(x,y+2,13,6,0,0,6.283);g.fill();
    g.fillStyle='#18181b';g.beginPath();g.moveTo(x-9,y+3);g.lineTo(x-3,y-15);g.lineTo(x+7,y+3);g.closePath();g.fill();
    g.fillStyle='#f97316';g.fillRect(x-3,y-8,2,8);
  };
  const dBrazier=(x,y)=>{
    g.fillStyle='rgba(168,85,247,.32)';g.beginPath();g.arc(x,y-4,15,0,6.283);g.fill();
    rr(x-6,y-4,12,8,'#334155');rr(x-8,y-7,16,4,'#475569');
    g.fillStyle='#c084fc';g.beginPath();g.arc(x,y-9,5,0,6.283);g.fill();
    g.fillStyle='#fae8ff';g.beginPath();g.arc(x,y-9,2.5,0,6.283);g.fill();
  };
  const dServer=(x,y)=>{
    rr(x-10,y-10,22,18,'rgba(0,0,0,.4)');
    rr(x-11,y-12,22,18,'#0f172a');
    g.strokeStyle='#2be3a1';g.lineWidth=1.2;g.strokeRect(x-11,y-12,22,18);
    for(let sy=y-9;sy<y+3;sy+=4){rr(x-8,sy,10,2,'#38bdf8');rr(x+5,sy,3,2,'#2be3a1');}
  };
  const dRock=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.32)';g.beginPath();g.ellipse(x+3,y+3,11,6,0,0,6.283);g.fill();
    g.fillStyle='#525856';g.beginPath();g.moveTo(x-9,y+3);g.lineTo(x-6,y-5);g.lineTo(x+3,y-6);g.lineTo(x+10,y+2);g.closePath();g.fill();
    g.fillStyle='#7c8582';g.beginPath();g.moveTo(x-6,y-5);g.lineTo(x+3,y-6);g.lineTo(x+1,y);g.lineTo(x-7,y);g.closePath();g.fill();
  };
  const dCar=(x,y)=>{
    const pal=['#7c2d24','#2b4c66','#5c6440','#6b532c','#4a4e54'][(rng()*5)|0];
    rr(x-16,y-5,36,16,'rgba(0,0,0,.38)');
    rr(x-14,y-9,6,3,'#111');rr(x+8,y-9,6,3,'#111');rr(x-14,y+6,6,3,'#111');rr(x+8,y+6,6,3,'#111');
    rr(x-17,y-7,34,14,pal);rr(x-9,y-6,18,12,'#1e293b');rr(x-6,y-5,11,10,pal);
    rr(x+15,y-6,2,3,'#fde047');rr(x+15,y+3,2,3,'#fde047');
  };
  const dBarrel=(x,y)=>{
    g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.ellipse(x+3,y+2,7,4,0,0,6.283);g.fill();
    rr(x-5,y-9,10,12,'#992b1e');rr(x-5,y-6,10,2,'#facc15');
    g.fillStyle='#7f1d1d';g.beginPath();g.ellipse(x,y-9,5,2.5,0,0,6.283);g.fill();
  };
  const dPipe=(x,y)=>{
    rr(x-18,y+1,36,5,'rgba(0,0,0,.35)');
    rr(x-18,y-6,36,8,'#475569');rr(x-18,y-5,36,2,'#94a3b8');
    rr(x-11,y-8,4,12,'#334155');rr(x+7,y-8,4,12,'#334155');
  };
  const dVent=(x,y)=>{
    rr(x-13,y-8,28,20,'rgba(0,0,0,.4)');
    rr(x-14,y-10,28,20,'#334155');rr(x-12,y-8,24,16,'#1e293b');
    for(let i=0;i<4;i++)rr(x-10,y-6+i*4,20,2,'#64748b');
    rr(x+7,y-8,3,3,'#38bdf8');
  };
  const dCrate=(x,y)=>{
    rr(x-6,y-7,15,15,'rgba(0,0,0,.35)');
    rr(x-7,y-9,14,14,'#785532');rr(x-7,y-9,14,2,'#a3784c');
    g.strokeStyle='#4a3219';g.lineWidth=1.5;g.strokeRect(x-6,y-8,12,12);
  };
  const dHazard=(x,y)=>{
    rr(x-12,y-6,26,14,'rgba(0,0,0,.35)');rr(x-13,y-8,26,14,'#1e293b');
    for(let i=0;i<4;i++)rr(x-11+i*6,y-6,3,10,i%2?'#eab308':'#ef4444');
  };

  const propTable={
    four:       [[dCar,24,4],[dTree,20,3],[dBarrel,11,2]],
    suburbio:   [[dTree,20,6],[dCar,24,2]],
    forest:     [[dTree,22,10],[dRock,11,4]],
    clareira:   [[dTree,22,8],[dBrazier,14,4],[dRock,11,3]],
    industrial: [[dPipe,22,5],[dBarrel,11,5],[dCrate,12,4],[dHazard,14,3]],
    ferrovia:   [[dContainer,24,5],[dCrate,12,4],[dBarrel,11,3]],
    espiral:    [[dHazard,16,6],[dBarrel,11,5],[dVent,18,3]],
    metro:      [[dVent,18,6],[dPipe,22,4],[dHazard,14,3]],
    cruzamento: [[dTree,20,5],[dCar,24,3],[dVent,18,2]],
    porto:      [[dContainer,24,7],[dCrate,12,4],[dBarrel,11,3]],
    artico:     [[dSnowPine,20,6],[dIceCrystal,15,5],[dRock,12,3]],
    pantano:    [[dSwampSpore,16,6],[dTree,20,5],[dBarrel,11,3]],
    highway:    [[dMesa,24,5],[dCactus,14,6],[dCar,24,3]],
    zigzag:     [[dTankTrap,15,7],[dCrate,12,4],[dBarrel,11,3]],
    aneis:      [[dHazard,15,5],[dPipe,22,4],[dVent,18,4]],
    laboratorio:[[dServer,16,7],[dVent,18,4]],
    cratera:    [[dObsidian,15,8],[dRock,12,4]],
    labirinto:  [[dBrazier,15,7],[dRock,12,4]]
  };
  const kinds=propTable[activeMap]||propTable.four;

  const totalW=kinds.reduce((a,k)=>a+k[2],0);let placed=0;
  for(let i=0;i<1100&&placed<75;i++){
    let r=rng()*totalW,k=kinds[0];
    for(const kk of kinds){r-=kk[2];if(r<=0){k=kk;break;}}
    const x=26+rng()*(W-52),y=38+rng()*(H-64);
    if(!free(x,y,k[1]))continue;
    items.push({x,y,r:k[1]});k[0](x,y);placed++;
  }

  // 5. Monumentos e Estruturas Arquitetônicas Exclusivas por Mapa
  if(activeMap==='four'){
    // Chafarizes/Praças circulares no centro das 4 rotatórias da Cidade Abandonada
    for(const c0 of [{x:245,y:165},{x:475,y:165},{x:705,y:365},{x:475,y:475}]){
      g.fillStyle='#1e293b';g.beginPath();g.arc(c0.x,c0.y,26,0,6.283);g.fill();
      g.fillStyle='#0284c7';g.beginPath();g.arc(c0.x,c0.y,20,0,6.283);g.fill();
      g.fillStyle='#bae6fd';g.beginPath();g.arc(c0.x,c0.y,7,0,6.283);g.fill();
      g.strokeStyle='#94a3b8';g.lineWidth=2;g.beginPath();g.arc(c0.x,c0.y,26,0,6.283);g.stroke();
    }
    const building=(x,y,w,h)=>{
      if(distToPath(x+w/2,y+h/2)<Math.hypot(w,h)*.45+20)return;
      rr(x+8,y+8,w,h,'rgba(0,0,0,.42)');
      rr(x,y,w,h,'#1e252b');rr(x+3,y+3,w-6,h-6,'#333d45');rr(x+6,y+6,w-12,h-12,'#262f36');
      for(let wx=x+8;wx<x+w-10;wx+=12)rr(wx,y+h-5,7,3,rng()<.35?'#fbbf24':'#0f172a');
    };
    [[22,26,86,70],[348,26,90,72],[568,30,90,66],[788,30,120,76],[22,512,92,88],[144,520,92,78],[744,520,92,80],[848,512,84,68]].forEach(b=>building(...b));
  } else if(activeMap==='suburbio'){
    // Casas residenciais com telhados de duas águas coloridos (vermelho, azul, terracota) e chaminé
    const house=(x,y,w,h,roof0,roof1)=>{
      if(distToPath(x+w/2,y+h/2)<Math.hypot(w,h)*.45+20)return;
      rr(x+6,y+6,w,h,'rgba(0,0,0,.38)');
      rr(x,y,w,h,'#e2e8f0');
      rr(x+2,y+2,w-4,h/2-2,roof0);rr(x+2,y+h/2,w-4,h/2-2,roof1);
      rr(x+2,y+h/2-1,w-4,3,'#ffffff');
      rr(x+w-16,y+6,8,8,'#475569');
    };
    house(38,42,68,46,'#dc2626','#991b1b');
    house(355,40,74,48,'#2563eb','#1d4ed8');
    house(550,42,72,46,'#d97706','#b45309');
    house(45,485,78,52,'#dc2626','#991b1b');
    house(675,415,74,48,'#0d9488','#0f766e');
  } else if(activeMap==='ferrovia'){
    // Vagões de trem de carga e locomotivas estacionados nos trilhos auxiliares superior e inferior
    for(const [tx,ty,col] of [[60,62,'#dc2626'],[150,62,'#2563eb'],[240,62,'#d97706'],[330,62,'#16a34a'],[120,562,'#dc2626'],[210,562,'#475569'],[300,562,'#2563eb'],[520,562,'#d97706']]){
      rr(tx+4,ty-6,76,18,'rgba(0,0,0,.45)');
      rr(tx,ty-9,76,18,col);rr(tx+3,ty-6,70,4,'rgba(255,255,255,.22)');
      rr(tx+76,ty-3,8,6,'#1e293b');
    }
  } else if(activeMap==='industrial'){
    for(let i=0;i<6;i++){
      const sx=65+i*140,sy=36;
      if(distToPath(sx,sy)>52){
        g.fillStyle='rgba(0,0,0,.4)';g.beginPath();g.arc(sx+6,sy+6,20,0,6.283);g.fill();
        const sg=g.createRadialGradient(sx-6,sy-6,2,sx,sy,20);
        sg.addColorStop(0,'#94a3b8');sg.addColorStop(.6,'#475569');sg.addColorStop(1,'#1e293b');
        g.fillStyle=sg;g.beginPath();g.arc(sx,sy,20,0,6.283);g.fill();
        g.strokeStyle='#eab308';g.lineWidth=1.5;g.beginPath();g.arc(sx,sy,13,0,6.283);g.stroke();
      }
    }
  } else if(activeMap==='artico'){
    // Domos geodésicos de pesquisa polar branco/laranja
    for(const [dx,dy] of [[85,540],[585,555],[765,60]]){
      if(distToPath(dx,dy)>48){
        g.fillStyle='rgba(0,30,60,.32)';g.beginPath();g.arc(dx+5,dy+5,24,0,6.283);g.fill();
        g.fillStyle='#f8fafc';g.beginPath();g.arc(dx,dy,24,0,6.283);g.fill();
        g.strokeStyle='#f97316';g.lineWidth=3;g.beginPath();g.arc(dx,dy,18,0,6.283);g.stroke();
        g.strokeStyle='#94a3b8';g.lineWidth=1;
        g.beginPath();g.moveTo(dx-24,dy);g.lineTo(dx+24,dy);g.moveTo(dx,dy-24);g.lineTo(dx,dy+24);g.stroke();
      }
    }
  } else if(activeMap==='porto'){
    // Farol marítimo iluminado e guindastes portuários amarelos
    const lx=80,ly=310;
    if(distToPath(lx,ly)>44){
      g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.arc(lx+5,ly+5,20,0,6.283);g.fill();
      g.fillStyle='#dc2626';g.beginPath();g.arc(lx,ly,18,0,6.283);g.fill();
      g.fillStyle='#f8fafc';g.beginPath();g.arc(lx,ly,12,0,6.283);g.fill();
      g.fillStyle='#fef08a';g.beginPath();g.arc(lx,ly,6,0,6.283);g.fill();
    }
  } else if(activeMap==='zigzag'){
    // Bunkers casamata de concreto armado no topo e base das trincheiras
    for(const [kx,ky] of [[65,540],[230,42],[420,42],[610,42]]){
      if(distToPath(kx,ky)>46){
        rr(kx-22,ky-14,48,30,'rgba(0,0,0,.45)');
        rr(kx-24,ky-16,48,28,'#475569');rr(kx-20,ky-12,40,20,'#64748b');
        rr(kx-14,ky+6,28,4,'#0f172a');
      }
    }
  } else if(activeMap==='metro'){
    // Pilares estruturais subterrâneos, painéis eletrônicos de linha e cabines de controle
    for(const [mx,my] of [[235,295],[435,295],[625,335]]){
      if(distToPath(mx,my)>46){
        rr(mx-16,my-14,34,28,'rgba(0,0,0,.5)');
        rr(mx-18,my-16,34,26,'#1e293b');rr(mx-14,my-12,26,18,'#0f172a');
        rr(mx-11,my-9,20,4,'#38bdf8');rr(mx-11,my-2,14,3,'#2be3a1');
      }
    }
  }

  // 6. Zona de Invasão (Entrada dos Zumbis à esquerda)
  const spY=clamp(PATH_PTS[0][1]||150,46,H-46);
  const spGlow=g.createRadialGradient(18,spY,4,18,spY,64);
  spGlow.addColorStop(0,'rgba(255,60,40,.42)');spGlow.addColorStop(1,'rgba(255,60,40,0)');
  g.fillStyle=spGlow;g.fillRect(0,spY-64,90,128);
  rr(4,spY-36,10,20,'#991b1b');rr(4,spY-32,10,4,'#facc15');
  rr(4,spY+16,10,20,'#991b1b');rr(4,spY+20,10,4,'#facc15');
  rr(8,14,76,22,'rgba(15,23,42,.9)');
  g.strokeStyle='#ef4444';g.lineWidth=1.5;g.strokeRect(8,14,76,22);
  g.fillStyle='#ef4444';g.font='bold 10px "Segoe UI",sans-serif';g.fillText('☣ INVASÃO',15,29);

  // 7. Fortaleza da Base dos Sobreviventes (À direita: x 812..954, y 198..315)
  const bx=816,by=212,bw=134,bh=98;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(bx-6,by-4,bw+14,bh+14);
  g.fillStyle='#1e293b';g.fillRect(bx,by,bw,bh);
  g.strokeStyle=th.detail||'#475569';g.lineWidth=3;g.strokeRect(bx,by,bw,bh);
  rr(bx+6,by+6,bw-12,bh-12,'#293548');
  for(let i=0;i<6;i++)rr(bx,by+18+i*11,7,6,i%2?'#f59e0b':'#111827');
  rr(bx+18,by+14,98,70,'#334155');
  g.strokeStyle='#64748b';g.lineWidth=1.5;g.strokeRect(bx+18,by+14,98,70);
  g.strokeStyle='rgba(56,189,248,.65)';g.lineWidth=2;
  g.beginPath();g.arc(bx+54,by+49,20,0,6.283);g.stroke();
  g.fillStyle='rgba(56,189,248,.75)';g.font='bold 16px "Segoe UI",sans-serif';g.fillText('H',bx+48,by+55);
  g.fillStyle='#0f172a';g.beginPath();g.arc(bx+98,by+34,11,0,6.283);g.fill();
  g.strokeStyle='#2be3a1';g.lineWidth=2;g.beginPath();g.arc(bx+98,by+34,7,0,4.2);g.stroke();
  rr(bx+90,by+56,16,18,'#1e293b');rr(bx+93,by+59,10,12,'#38bdf8');
  rr(bx+26,by-14,84,16,'rgba(9,14,26,.92)');
  g.strokeStyle='#2be3a1';g.lineWidth=1.2;g.strokeRect(bx+26,by-14,84,16);
  g.fillStyle='#2be3a1';g.font='bold 10px "Segoe UI",sans-serif';g.fillText('🛡 BASE ALFA',bx+34,by-2);

  // 8. Iluminação Atmosférica Específica por Mapa
  const mood={
    four:       {t:'rgba(30,58,110,.10)',l:[[245,165,150,'56,189,248'],[475,475,150,'250,204,21']]},
    suburbio:   {t:'rgba(254,240,138,.06)',l:[[235,215,170,'253,224,71'],[525,425,170,'56,189,248']]},
    forest:     {t:'rgba(8,52,40,.14)',l:[[200,120,180,'134,239,172'],[540,420,190,'251,146,60']]},
    clareira:   {t:'rgba(88,28,135,.18)',l:[[405,310,220,'56,189,248'],[235,165,150,'192,132,252'],[595,485,150,'232,121,249']]},
    industrial: {t:'rgba(80,42,10,.14)',l:[[180,280,160,'251,146,60'],[580,130,150,'250,204,21']]},
    ferrovia:   {t:'rgba(120,53,15,.12)',l:[[320,140,170,'251,191,36'],[520,475,170,'249,115,22']]},
    espiral:    {t:'rgba(113,63,18,.15)',l:[[450,320,220,'250,204,21']]},
    metro:      {t:'rgba(4,32,90,.20)',l:[[150,125,180,'56,189,248'],[545,170,180,'45,212,191']]},
    cruzamento: {t:'rgba(6,78,59,.14)',l:[[368,295,190,'56,189,248'],[650,510,150,'43,227,161']]},
    porto:      {t:'rgba(12,45,78,.16)',l:[[280,300,190,'56,189,248'],[590,260,190,'250,204,21']]},
    artico:     {t:'rgba(186,230,253,.12)',l:[[355,320,210,'125,211,252'],[635,95,160,'254,215,170']]},
    pantano:    {t:'rgba(54,83,20,.18)',l:[[235,260,190,'163,230,53'],[565,360,190,'132,204,22']]},
    highway:    {t:'rgba(154,52,18,.16)',l:[[265,245,180,'251,146,60'],[640,495,180,'253,186,116']]},
    zigzag:     {t:'rgba(68,64,60,.14)',l:[[320,300,180,'251,191,36'],[605,300,180,'248,113,113']]},
    aneis:      {t:'rgba(127,29,29,.16)',l:[[450,320,220,'56,189,248'],[250,180,150,'245,158,11']]},
    laboratorio:{t:'rgba(6,78,59,.18)',l:[[295,315,180,'43,227,161'],[575,315,180,'56,189,248']]},
    cratera:    {t:'rgba(127,29,29,.22)',l:[[290,310,200,'249,115,22'],[570,310,200,'239,68,68']]},
    labirinto:  {t:'rgba(88,28,135,.20)',l:[[350,240,180,'192,132,252'],[580,425,180,'232,121,249']]}
  }[activeMap]||{t:'rgba(0,0,0,0)',l:[]};

  g.fillStyle=mood.t;g.fillRect(0,0,W,H);
  g.globalCompositeOperation='lighter';
  for(const [lx,ly,lr,lc] of mood.l){
    const lg=g.createRadialGradient(lx,ly,0,lx,ly,lr);
    lg.addColorStop(0,'rgba('+lc+',.18)');lg.addColorStop(1,'rgba('+lc+',0)');
    g.fillStyle=lg;g.fillRect(lx-lr,ly-lr,lr*2,lr*2);
  }
  g.globalCompositeOperation='source-over';

  BG=c;
  syncBgCanvas();
}
function syncBgCanvas(){
  try{
    const bgCv=$('bgCanvas');
    if(!bgCv||!BG)return;
    const bgCtx=bgCv.getContext('2d');
    if(!bgCtx)return;
    bgCtx.setTransform(1,0,0,1,0,0);
    bgCtx.fillStyle='#070b14';
    bgCtx.fillRect(0,0,bgCv.width,bgCv.height);
    const s=(VIEW&&VIEW.scale?VIEW.scale:1)*(CANVAS_DPR||1);
    bgCtx.setTransform(s,0,0,s,(VIEW&&VIEW.ox?VIEW.ox:0)*(CANVAS_DPR||1),(VIEW&&VIEW.oy?VIEW.oy:0)*(CANVAS_DPR||1));
    bgCtx.imageSmoothingEnabled=false;
    bgCtx.drawImage(BG,0,0);
  }catch(_){}
}

/* ===================== 4. ESTADO E ENTIDADES ===================== */
const G = {
  mode:'menu',           // 'menu' | 'play' | 'over'
  paused:false, speed:1, auto:false,
  money:0, life:0, kills:0, earned:0, time:0, simT:0, anim:0,
  shake:0, flash:0, flashCol:'#f00',
  placing:null, targeting:null, selected:null, selectedObs:null, won:false
};
const towers=[], zombies=[], projs=[], parts=[], popups=[], rings=[], bolts=[], hazards=[], mines=[], bombs=[], areas=[], allies=[], obstacles=[], portals=[];
let uid=0;
const M = {x:0,y:0,in:false};
const powerState = {};
POWER_ORDER.forEach(k=>powerState[k]={owned:false,cd:0});
powerState.supply.uses=0;powerState.supply.nextAt=0;

/* ===================== 5. EFEITOS (FX), OBJECT POOLING E SONS (Snd) ===================== */
let _partRingIdx = 0;
const _partPool = [], _ringPool = [], _projPool = [], _minePool = [], _allyPool = [], _zombiePool = [];
const FX = {
  part(x,y,vx,vy,life,col,size,g){
    const maxP=CFG.maxParts||450;
    if(parts.length<maxP){
      const p=_partPool.length?_partPool.pop():{};
      p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.life=life;p.max=life;p.c=col;p.s=size||2;p.g=g||0;
      parts.push(p);
    } else if(maxP>0){
      const p=parts[_partRingIdx++%parts.length];
      if(p){p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.life=life;p.max=life;p.c=col;p.s=size||2;p.g=g||0;}
    }
  },
  ring(x,y,r0,r1,life,col,lw){
    if(rings.length>=(IS_MOBILE?45:80))return;
    const r=_ringPool.length?_ringPool.pop():{};
    r.x=x;r.y=y;r.r0=r0;r.r1=r1;r.life=life;r.max=life;r.c=col;r.lw=lw||3;
    rings.push(r);
  },
  popup(x,y,text,col,big){ if(popups.length<(IS_MOBILE?24:70))popups.push({x,y,text,c:col||'#fff',life:.8,max:.8,big:!!big}); },
  blood(x,y,n,col){ for(let i=0;i<n;i++)this.part(x,y-6,rand(-50,50),rand(-70,10),rand(.3,.6),col||'#8a1a14',rand(2,3),200); },
  spark(x,y,col,n){ for(let i=0;i<(n||3);i++)this.part(x,y,rand(-60,60),rand(-60,20),rand(.15,.35),col,2,80); },
  blast(x,y,r){
    this.ring(x,y,4,r,.35,'#ffb040',4);
    const n=Math.min(26,6+(r/4|0));
    for(let i=0;i<n;i++){const a=rand(0,6.28),v=rand(30,r*3);this.part(x,y,Math.cos(a)*v,Math.sin(a)*v,rand(.25,.6),['#ffd060','#ff8030','#d84020'][i%3],rand(2,4),0);}
    for(let i=0;i<Math.min(8,n/3|0);i++)this.part(x,y,rand(-20,20),rand(-50,-10),rand(.6,1.1),'#555',rand(4,6),-20); // fumaça
  },
  flame(x,y,ang,range){
    for(let i=0;i<2;i++){const a=ang+rand(-.25,.25),v=rand(range*1.4,range*2.2);this.part(x,y,Math.cos(a)*v,Math.sin(a)*v,rand(.15,.3),['#ffe060','#ff9020','#e04010'][(Math.random()*3)|0],rand(3,5),-30);}
  },
  mineBlast(x,y,r,stacks){
    const st=Math.max(1,stacks||1);
    this.ring(x,y,4,r,.32,'#facc15',4);
    this.ring(x,y,2,r*.72,.24,'#ef4444',2.5);
    const shrap=Math.min(28,10+st*3);
    for(let i=0;i<shrap;i++){
      const a=(i/shrap)*6.283+rand(-.18,.18),v=rand(55,r*3.4);
      const col=i%3===0?'#e2e8f0':i%3===1?'#fbbf24':'#ef4444';
      this.part(x,y,Math.cos(a)*v,Math.sin(a)*v,rand(.22,.48),col,rand(2,3.8),90);
    }
    this.stunSparks(x,y,6+st*2);
  },
  stunSparks(x,y,n){
    const cnt=n||5;
    for(let i=0;i<cnt;i++){
      const a=rand(0,6.283),v=rand(30,95);
      this.part(x,y-6,Math.cos(a)*v,Math.sin(a)*v-20,rand(.16,.34),i%2===0?'#fde047':'#38bdf8',rand(1.8,3.2),40);
    }
  },
  footprint(x,y,col,dustCol){
    this.part(x+rand(-4,4),y+rand(2,6),rand(-8,8),rand(-6,2),rand(.32,.55),col||'#6b533b',rand(2.2,3.4),0);
    if(dustCol)this.part(x+rand(-5,5),y+rand(0,4),rand(-16,16),rand(-18,-4),rand(.22,.42),dustCol,rand(2,3.2),-12);
  },
  bolt(pts){
    const out=[];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1];out.push(a);
      for(let k=1;k<4;k++){const t=k/4;out.push({x:a.x+(b.x-a.x)*t+rand(-6,6),y:a.y+(b.y-a.y)*t+rand(-6,6)});}
    }
    out.push(pts[pts.length-1]); if(bolts.length<40)bolts.push({pts:out,life:.18});
  }
};

const Snd = {
  ac:null, master:null, bgmGain:null, vol:.5, muted:false, musicMuted:false, bgmTimer:0, bgmStep:0, last:{}, nbuf:null,
  gaps:{shoot:70,snipe:100,boom:90,flame:140,zap:90,ice:200,poison:90,coin:70,die:70,hurt:150,ui:40,err:120,up:100,horn:300,power:200,build:100,alarm:600},
  init(){
    if(this.ac){
      if(this.ac.state==='suspended')try{this.ac.resume();}catch(e){}
      this.syncMusic();
      return;
    }
    try{
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
      this.ac=new AC();
      this.master=this.ac.createGain();
      this.master.gain.value=this.muted?0:this.vol*.8;
      this.master.connect(this.ac.destination);
      this.bgmGain=this.ac.createGain();
      this.bgmGain.gain.value=this.musicMuted?0:0.42;
      this.bgmGain.connect(this.master);
      const len=this.ac.sampleRate; this.nbuf=this.ac.createBuffer(1,len,this.ac.sampleRate);
      const d=this.nbuf.getChannelData(0); for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.syncMusic();
    }catch(e){this.ac=null;}
  },
  unlockMobileAudio(){
    this.init();
    if(!this.ac)return;
    try{
      if(this.ac.state==='suspended')this.ac.resume();
      if(!this._unlocked){
        const buf=this.ac.createBuffer(1,1,22050);
        const src=this.ac.createBufferSource();
        src.buffer=buf;
        src.connect(this.ac.destination);
        if(src.start)src.start(0);
        this._unlocked=true;
      }
      this.syncMusic();
    }catch(e){}
  },
  onVisibilityChange(hidden){
    if(hidden){
      if(this.bgmTimer){clearInterval(this.bgmTimer);this.bgmTimer=0;}
      if(this.ac&&this.ac.state==='running')try{this.ac.suspend();}catch(e){}
    } else {
      if(this.ac&&this.ac.state==='suspended'&&!this.muted&&this.vol>0)try{this.ac.resume();}catch(e){}
      this.syncMusic();
    }
  },
  apply(){
    if(this.master)this.master.gain.value=this.muted?0:this.vol*.8;
    if(this.bgmGain)this.bgmGain.gain.value=this.musicMuted?0:0.42;
    this.syncMusic();
  },
  syncMusic(){
    const inMenu=document.body.classList.contains('menu-mode')||G.mode==='menu';
    const shouldPlay=inMenu&&!this.muted&&!this.musicMuted&&this.vol>0&&!!this.ac;
    const btn=$('btnMenuMusic'),lbl=$('menuMusicLabel');
    if(btn)btn.classList.toggle('active',!this.musicMuted&&!this.muted);
    if(lbl)lbl.textContent=(this.musicMuted||this.muted)?'🔇 MUDA':'♫ ATIVA';
    if(shouldPlay){
      if(this.ac&&this.ac.state==='suspended')try{this.ac.resume();}catch(e){}
      if(!this.bgmTimer){
        this.playBgmStep();
        this.bgmTimer=setInterval(()=>this.playBgmStep(),320);
      }
    } else if(this.bgmTimer){
      clearInterval(this.bgmTimer);
      this.bgmTimer=0;
    }
  },
  playBgmStep(){
    if(!this.ac||this.muted||this.musicMuted||this.vol<=0)return;
    if(!document.body.classList.contains('menu-mode')&&G.mode!=='menu'){this.syncMusic();return;}
    if(this.ac.state==='suspended')return;
    const a=this.ac,t=a.currentTime,st=this.bgmStep++%32;
    const bar=(st>>3)%4,beat=st%8;

    // Progressão sombria em Ré Menor (Dm -> Bb -> Gm -> A7)
    const bassRoots=[73.42, 58.27, 49.00, 55.00];
    const chords=[
      [146.83, 220.00, 261.63], // Dm (D3, A3, C4)
      [116.54, 174.61, 220.00], // Bbmaj7 (Bb2, F3, A3)
      [98.00,  146.83, 196.00], // Gm (G2, D3, G3)
      [110.00, 164.81, 207.65]  // A7 (A2, E3, G#3)
    ];
    // Arpejo melódico de tensão tática (32 passos)
    const arp=[
      293.66, 349.23, 440.00, 349.23, 523.25, 440.00, 349.23, 293.66,
      233.08, 293.66, 440.00, 392.00, 349.23, 293.66, 261.63, 233.08,
      196.00, 293.66, 392.00, 349.23, 466.16, 392.00, 349.23, 293.66,
      220.00, 277.18, 329.63, 440.00, 415.30, 329.63, 277.18, 220.00
    ];

    // 1. Pad Atmosférico no início de cada compasso (8 passos = 2.56s)
    if(beat===0){
      for(const f of chords[bar]){
        const o=a.createOscillator(),fl=a.createBiquadFilter(),g=a.createGain();
        o.type='sawtooth';o.frequency.setValueAtTime(f,t);
        fl.type='lowpass';fl.frequency.setValueAtTime(520,t);
        g.gain.setValueAtTime(0.001,t);
        g.gain.linearRampToValueAtTime(0.045,t+0.45);
        g.gain.exponentialRampToValueAtTime(0.001,t+2.5);
        o.connect(fl);fl.connect(g);g.connect(this.bgmGain);
        o.start(t);o.stop(t+2.55);
      }
    }

    // 2. Sub-Bass Pulsante Dark Synthwave
    if(beat===0||beat===2||beat===3||beat===4||beat===6){
      const bf=bassRoots[bar]*(beat===3?1.5:1);
      const o=a.createOscillator(),fl=a.createBiquadFilter(),g=a.createGain();
      o.type='sawtooth';o.frequency.setValueAtTime(bf,t);
      fl.type='lowpass';fl.frequency.setValueAtTime(340,t);
      fl.frequency.exponentialRampToValueAtTime(95,t+0.26);
      g.gain.setValueAtTime(0.14,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.28);
      o.connect(fl);fl.connect(g);g.connect(this.bgmGain);
      o.start(t);o.stop(t+0.3);
    }

    // 3. Melodia Pluck / Arpejo com Eco Sutil
    const mf=arp[st];
    if(mf){
      const o=a.createOscillator(),g=a.createGain();
      o.type='triangle';o.frequency.setValueAtTime(mf,t);
      g.gain.setValueAtTime(0.075,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.38);
      o.connect(g);g.connect(this.bgmGain);
      o.start(t);o.stop(t+0.4);
    }

    // 4. Batida Cinematográfica (Bumbo de batimento cardíaco + chimbal tático)
    if(beat===0||beat===5){
      const o=a.createOscillator(),g=a.createGain();
      o.type='sine';o.frequency.setValueAtTime(115,t);
      o.frequency.exponentialRampToValueAtTime(32,t+0.18);
      g.gain.setValueAtTime(0.18,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
      o.connect(g);g.connect(this.bgmGain);
      o.start(t);o.stop(t+0.22);
    } else if(beat===2||beat===6){
      const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();
      s.buffer=this.nbuf;fl.type='highpass';fl.frequency.setValueAtTime(3800,t);
      g.gain.setValueAtTime(0.025,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
      s.connect(fl);fl.connect(g);g.connect(this.bgmGain);
      s.start(t);s.stop(t+0.07);
    }
  },
  tone(type,f0,f1,dur,vol){
    const a=this.ac,t=a.currentTime,o=a.createOscillator(),g=a.createGain();
    o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
  },
  noise(dur,vol,freq){
    const a=this.ac,t=a.currentTime,s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
    s.buffer=this.nbuf;f.type='lowpass';f.frequency.value=freq;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+dur+.02);
  },
  alarm(){
    if(!this.ac||this.muted||this.vol<=0)return;
    const a=this.ac,t=a.currentTime;
    // Sirene de emergência tática / alerta biológico para chefes (duplo ciclo oscilante)
    for(let i=0;i<2;i++){
      const t0=t+i*0.42;
      const o1=a.createOscillator(),fl=a.createBiquadFilter(),g1=a.createGain();
      o1.type='sawtooth';fl.type='lowpass';fl.frequency.setValueAtTime(1600,t0);
      try{fl.Q.value=3.5;}catch(e){}
      o1.frequency.setValueAtTime(460,t0);
      o1.frequency.exponentialRampToValueAtTime(940,t0+0.18);
      o1.frequency.exponentialRampToValueAtTime(520,t0+0.38);
      g1.gain.setValueAtTime(0.001,t0);
      g1.gain.linearRampToValueAtTime(0.36,t0+0.04);
      g1.gain.setValueAtTime(0.36,t0+0.28);
      g1.gain.exponentialRampToValueAtTime(0.001,t0+0.41);
      o1.connect(fl);fl.connect(g1);g1.connect(this.master);
      o1.start(t0);o1.stop(t0+0.42);

      const o2=a.createOscillator(),g2=a.createGain();
      o2.type='square';
      o2.frequency.setValueAtTime(230,t0);
      o2.frequency.exponentialRampToValueAtTime(470,t0+0.18);
      o2.frequency.exponentialRampToValueAtTime(260,t0+0.38);
      g2.gain.setValueAtTime(0.001,t0);
      g2.gain.linearRampToValueAtTime(0.12,t0+0.05);
      g2.gain.setValueAtTime(0.12,t0+0.26);
      g2.gain.exponentialRampToValueAtTime(0.001,t0+0.40);
      o2.connect(g2);g2.connect(this.master);
      o2.start(t0);o2.stop(t0+0.41);

      const sub=a.createOscillator(),subG=a.createGain();
      sub.type='sine';
      sub.frequency.setValueAtTime(110,t0);
      sub.frequency.exponentialRampToValueAtTime(50,t0+0.36);
      subG.gain.setValueAtTime(0.24,t0);
      subG.gain.exponentialRampToValueAtTime(0.001,t0+0.38);
      sub.connect(subG);subG.connect(this.master);
      sub.start(t0);sub.stop(t0+0.40);
    }
  },
  play(n){
    if(G.replay)return;
    if(!this.ac||this.muted||this.vol<=0)return;
    const now=performance.now();if(now-(this.last[n]||0)<(this.gaps[n]||50))return;this.last[n]=now;
    switch(n){
      case 'shoot':this.tone('square',520,180,.07,.10);break;
      case 'snipe':this.noise(.25,.45,2500);this.tone('sawtooth',220,60,.2,.2);break;
      case 'boom':this.noise(.5,.6,700);this.tone('sine',110,30,.4,.45);break;
      case 'flame':this.noise(.14,.10,1800);break;
      case 'zap':this.tone('sawtooth',900,100,.14,.12);break;
      case 'ice':this.tone('sine',1400,600,.2,.10);break;
      case 'poison':this.tone('triangle',300,520,.12,.10);break;
      case 'coin':this.tone('square',880,1320,.09,.06);break;
      case 'die':this.tone('triangle',200,60,.12,.07);break;
      case 'hurt':this.tone('sawtooth',120,40,.3,.3);break;
      case 'ui':this.tone('square',600,800,.05,.07);break;
      case 'err':this.tone('sawtooth',160,100,.15,.12);break;
      case 'up':this.tone('square',500,900,.12,.09);setTimeout(()=>{if(this.ac)this.tone('square',700,1200,.12,.09);},90);break;
      case 'build':this.tone('square',200,320,.08,.10);this.noise(.1,.15,900);break;
      case 'horn':this.tone('sawtooth',170,150,.5,.16);break;
      case 'power':this.noise(.6,.4,1200);this.tone('sawtooth',300,90,.5,.15);break;
      case 'alarm':this.alarm();break;
    }
  }
};

/* ===================== 6. DANO, STATUS, COMBOS ELEMENTAIS E CO-OP ===================== */
const COOP={
  active:false,
  isMultiplayer:false,
  isHost:true,
  roomCode:'QZ-8K4M9X',
  roomId:'',
  maxPlayers:2,
  division:'sectors', // 'sectors' | 'free'
  mySlot:0,
  map:'four',
  diff:'normal',
  seed:20260101,
  votesWave:1,
  votesSpeed:1,
  players:[
    {slot:0,name:'Comandante',money:650,isLocal:true,color:'#38bdf8',ready:true},
    {slot:1,name:'Aliado Bravo',money:650,isLocal:false,color:'#4ade80',ready:false}
  ],
  pings:[]
};
let startGameOperation=null;

function evaluateElementalCombo(z,incomingDtype){
  if(window.QZ_COOP&&typeof window.QZ_COOP.evaluateElementalCombo==='function'){
    return window.QZ_COOP.evaluateElementalCombo(z,incomingDtype);
  }
  if(!z)return {count:0,mult:1.0,activeElements:[]};
  const elems=[];
  if((z.burnT&&z.burnT>0)||incomingDtype==='fire')elems.push('fire');
  if((z.slowT&&z.slowT>0)||(z.freezeT&&z.freezeT>0)||incomingDtype==='ice')elems.push('ice');
  if((z.stunT&&z.stunT>0)||incomingDtype==='elec')elems.push('elec');
  if((z.poisonT&&z.poisonT>0)||incomingDtype==='poison')elems.push('poison');
  const count=elems.length;
  const bonus=[1,1,1.18,1.30,1.45][Math.min(4,count)]||1;
  return {count,mult:bonus,activeElements:elems};
}

// dtype: 'phys' | 'expl' | 'fire' | 'elec' | 'ice' | 'poison'  (só phys/expl sofrem redução de armadura)
function applyDamage(z,amount,dtype,o){
  if(!z||z.dead||z.reached||!(amount>0))return 0;
  let d=amount;
  if(dtype==='phys'||dtype==='expl'){
    let a=z.armor*(1-((o&&o.armorPen)||0)); if(dtype==='expl')a*=.5;
    if(G.weather==='acid_rain')a*=.7;
    d*=(1-clamp(a,0,.92));
  }
  if(G.weather==='emp_storm'&&(dtype==='elec'||(o&&o.elec)))d*=1.4;
  if(G.weather==='toxic_fog'&&o&&o.crit)d*=1.3;
  if(o&&o.bigMult&&z.D.big)d*=o.bigMult;
  if(z.vulnT>0&&z.vulnAmt>0)d*=(1+z.vulnAmt);
  // Combos Elementais: bônus quando aliados combinam Fogo, Gelo, Eletricidade e Veneno
  if(COOP.active||z._comboEnabled){
    const combo=evaluateElementalCombo(z,dtype);
    if(combo.count>=2){
      const synBonus=1+getTechBonus('elemental_combo')*0.08;
      d*=(combo.mult*synBonus);
      z._lastCombo=combo.count;
      if(Math.random()<0.18)FX.popup(z.x,z.y-22,'⚡ COMBO ELEMENTAL x'+combo.count+'!','#38bdf8',false);
    }
  }
  if(o&&o.owner)z._lastAttacker=o.owner;
  z.hp-=d; z.dmgAcc+=d; z.flash=.09; z.flashType=dtype||'phys';
  if(o&&o.crit){FX.popup(z.x,z.y-18,Math.round(d)+'!','#ffd23a',true);}
  if(z.hp<=0)killZombie(z,o&&o.owner);
  return d;
}
function slowZ(z,amt,dur){
  if(!z||z.dead||z.reached)return;
  if(G.weather==='blizzard')dur*=1.5;
  if(z.D.speedBoss||z.D.slowResist){
    const res=z.D.slowResist||0.85;
    amt*=(1-res);
    dur*=0.35;
  } else if(z.D.boss)amt*=.5;
  else if(z.D.big)amt*=.75;
  if(z.slowT<=0||amt>=z.slowAmt){z.slowAmt=amt;z.slowT=Math.max(dur,z.slowT);}else z.slowT=Math.max(z.slowT,dur*.5);
}
function freezeZ(z,dur){
  if(!z||z.dead||z.reached)return;
  if(z.D.speedBoss)dur*=.18;
  else if(z.D.boss)dur*=.3;
  else if(z.D.big)dur*=.6;
  z.freezeT=Math.max(z.freezeT,dur);
}
function stunZ(z,dur){
  if(!z||z.dead||z.reached||!(dur>0))return;
  const eff=z.D.speedBoss?dur*0.85:(z.D.boss?dur*0.55:(z.D.big?dur*0.75:dur));
  z.stunT=Math.max(z.stunT||0,eff);
  if(z.D.speedBoss)z.turboT=0;
}
function ignite(z,dps,dur){ if(z.burnT<=0||dps>=z.burnDps)z.burnDps=dps; z.burnT=Math.max(z.burnT,dur); }
function poisonZ(z,dps,dur){ if(z.poisonT<=0||dps>=z.poisonDps)z.poisonDps=dps; z.poisonT=Math.max(z.poisonT,dur); }

function explode(x,y,r,dmg,dtype,o){
  o=o||{};
  for(const z of zombies){
    if(z.dead||z.reached)continue;
    const d=dist(z.x,z.y,x,y);
    if(d<=r+z.r*.6){
      applyDamage(z,dmg*(1-.4*Math.min(1,d/(r+z.r))),dtype,o);
      if(o.burnDps&&!z.dead)ignite(z,o.burnDps,o.burnT||3);
      if(o.stun&&!z.dead){stunZ(z,o.stun);FX.stunSparks(z.x,z.y,4);}
    }
  }
  FX.blast(x,y,r); Snd.play('boom'); G.shake=Math.max(G.shake,Math.min(6,r/12));
}

function killZombie(z,killerTower){
  if(z.dead)return;                       // garante recompensa uma única vez
  z.dead=true; G.kills++; WM.done++; if(z.D.boss)G.stats.bosses++; psAdd('kills'); if(z.D.boss)psAdd('bosses');
  const atk=killerTower||z._lastAttacker;
  if(atk&&typeof atk.kills==='number')atk.kills++;
  if(COOP.active&&COOP.maxPlayers>1){
    const share=Math.max(1,Math.round(z.reward/COOP.maxPlayers));
    G.money+=share; G.earned+=share;
    for(let i=1;i<COOP.players.length;i++){
      COOP.players[i].money=(COOP.players[i].money||0)+share;
    }
    FX.popup(z.x,z.y-14,'+'+share+' (Co-op)','#f2c230'); coinBump();
  }else{
    G.money+=z.reward; G.earned+=z.reward;
    FX.popup(z.x,z.y-14,'+'+z.reward,'#f2c230'); coinBump();
  }
  FX.blood(z.x,z.y,z.D.boss?24:8,z.type==='toxic'?'#5fa020':'#8a1a14');
  Snd.play('die'); Snd.play('coin');
  const D=z.D;
  if(D.cloud)hazards.push({kind:'zt',x:z.x,y:z.y,r:D.cloud.r,life:D.cloud.life,max:D.cloud.life});
  if(D.blast)explode(z.x,z.y,D.blast.r,D.blast.dmg,'expl');
  if(D.split&&WM.num>=11){for(let i=0;i<2;i++){const child=acquireZombie('runner',WM.num);child.dist=Math.max(0,z.dist-8+i*14);child.place();child.hp*=.7;child.max=child.hp;child.reward=3;WM.total++;zombies.push(child);}}
  if(D.boss){
    FX.blast(z.x,z.y,100);
    FX.ring(z.x,z.y,70,'#ef4444');
    FX.ring(z.x,z.y,130,'#10b981');
    explode(z.x,z.y,75,120,'expl');
    G.shake=12;
    G.flash=0.35;
    G.flashCol='rgba(16, 185, 129, 0.35)';
    Snd.play('boom');
    Snd.play('power');
    FX.popup(z.x,z.y-34,'★ '+D.name+' ELIMINADO! ★','#10b981',true);
  }
}

/* ===================== 7. CLASSES: ZUMBI, PROJÉTIL, TORRE (COM OBJECT POOLING) ===================== */
const _pp={x:0,y:0,dx:1,dy:0};

class Zombie {
  constructor(type,wave){
    this.init(type,wave);
  }
  init(type,wave){
    const D=ZOMBIES[type]||ZOMBIES.common; this.type=type; this.D=D; this.id=++uid;
    const diff=difficultySettings();
    const w=Math.max(1,wave||1);
    let hp=D.hp*hpMult(w)*diff.hp;
    if(D.boss)hp=D.hp*(1+.44*Math.max(0,w/10-1))*diff.hp;
    this.hp=hp; this.max=hp;
    this.speed=D.speed*spdMult(w)*diff.speed;
    // Resistência progressiva das classes de infectados ao longo das 40 ondas
    this.armor=Math.min(0.84,(D.armor||0)+Math.min(0.14,Math.max(0,(w-1)*0.0035)));
    // Economia restrita: recompensa por zumbi abatido reduzida para exigir planejamento financeiro
    this.reward=Math.max(1,Math.round(D.reward*0.82*(1+.01*(w-1))*diff.reward));
    this.dist=0; this.x=-40; this.y=90; this.off=D.size>=2?srand()*6-3:srand()*18-9;   // posição lateral afeta a simulação: usa RNG com semente
    this.slowT=0;this.slowAmt=0;this.freezeT=0;this.stunT=0;this.burnT=0;this.burnDps=0;this.poisonT=0;this.poisonDps=0;
    this.vulnT=0;this.vulnAmt=0;this.turboT=0;this.turboCD=4.5;
    this.flash=0;this.flashType='phys';this.dmgAcc=0;this.popT=rand(0,.4);this.phase=rand(0,6.28);this.face=1;this.cur=0;
    this.dead=false;this.reached=false;this.r=D.r;this.roar=8;this.screamT=6;this.jumpCD=5;this.digCD=6;this._lastAttacker=null;
    this.place();
    return this;
  }
  place(){
    pathPos(this.dist,_pp);
    this.x=_pp.x-_pp.dy*this.off; this.y=_pp.y+_pp.dx*this.off;
    if(Math.abs(_pp.dx)>.1)this.face=_pp.dx>0?1:-1;
  }
  update(h){
    const D=this.D;
    if(this.flash>0)this.flash-=h;
    if(this.slowT>0){this.slowT-=h;if(this.slowT<=0)this.slowAmt=0;}
    if(this.vulnT>0){this.vulnT-=h;if(this.vulnT<=0)this.vulnAmt=0;}
    if(this.freezeT>0)this.freezeT-=h;
    if(this.stunT>0)this.stunT-=h;
    if(this.turboT>0)this.turboT-=h;
    if(this.burnT>0){this.burnT-=h;applyDamage(this,this.burnDps*h,'fire');if(this.dead)return;}
    if(this.poisonT>0){this.poisonT-=h;applyDamage(this,this.poisonDps*h,'poison');if(this.dead)return;}
    if(D.heal){ // curandeiro cura zumbis próximos
      const amt=(D.heal+WM.num*.25)*h;
      for(const o of zombies){ if(o===this||o.dead||o.reached||o.hp>=o.max)continue;
        if(Math.abs(o.x-this.x)<D.healR&&Math.abs(o.y-this.y)<D.healR&&dist(o.x,o.y,this.x,this.y)<=D.healR)o.hp=Math.min(o.max,o.hp+amt); }
      if(Math.random()<h*4)FX.part(this.x+rand(-14,14),this.y-4,0,-25,.6,'#7fe08a',2,0);
    }
    if(D.regen&&!this.dead&&this.stunT<=0)this.hp=Math.min(this.max,this.hp+D.regen*h);
    if(D.parasite&&srand()<h*.7){for(const z of zombies){if(z!==this&&!z.dead&&!z.reached&&dist(z.x,z.y,this.x,this.y)<70){z.speed=Math.max(z.speed,z.D.speed*1.18);break;}}}
    if(D.commander&&srand()<h*.35){for(const z of zombies){if(z!==this&&!z.dead&&!z.reached&&dist(z.x,z.y,this.x,this.y)<105)z.speed=Math.max(z.speed,z.D.speed*1.12);}}
    if(D.jumper&&this.stunT<=0){this.jumpCD=(this.jumpCD||5)-h;if(this.jumpCD<=0&&this.dist<PATH_LEN-30){this.dist=Math.min(PATH_LEN-20,this.dist+65);this.jumpCD=7;FX.ring(this.x,this.y,5,38,.35,'#d8c48a',3);}}
    if(D.digger&&this.stunT<=0){this.digCD=(this.digCD||6)-h;if(this.digCD<=0&&this.dist<PATH_LEN-25){this.dist=Math.min(PATH_LEN-15,this.dist+42);this.digCD=8;this.off=rand(-4,4);FX.part(this.x,this.y,rand(-12,12),-20,.25,'#9b8a68',2,0);}}
    if(D.screamer&&this.stunT<=0){this.screamT-=h;if(this.screamT<=0){this.screamT=8;for(const t of towers)if(dist(t.x,t.y,this.x,this.y)<125)t.weak=Math.max(t.weak,1.8);FX.ring(this.x,this.y,8,125,.55,'#d9a6ff',3);}}
    if(D.speedBoss&&this.stunT<=0){
      this.turboCD=(this.turboCD||4.5)-h;
      if(this.turboCD<=0){
        this.turboCD=5.5;
        this.turboT=1.7;
        FX.ring(this.x,this.y,6,54,.35,'#38bdf8',3);
        FX.popup(this.x,this.y-26,'⚡ TURBO MUTANTE!','#38bdf8',true);
      }
    }
    if(D.boss&&this.stunT<=0){ // rugido: enfraquece torres próximas
      this.roar-=h;
      if(this.roar<=0){this.roar=10;for(const t of towers)if(dist(t.x,t.y,this.x,this.y)<150)t.weak=Math.max(t.weak,2.5);FX.ring(this.x,this.y,10,150,.6,'#c04080',4);G.shake=Math.max(G.shake,5);}
    }
    const paralyzed=(this.freezeT>0||this.stunT>0);
    let sp=paralyzed?0:this.speed*(this.turboT>0?1.35:1)*(1-this.slowAmt);
    if(G.weather==='blizzard')sp*=0.80;
    this.cur=sp; this.dist+=sp*h;
    if(this.dist>=PATH_LEN){this.reach();return;}
    this.place();
    // Rastros visuais de partículas (pegadas de lama, poeira e rastros de veneno/energia/choque)
    if(!D.flying&&sp>8&&Math.random()<h*(D.speedBoss?14:D.big?7:4)){
      FX.footprint(this.x,this.y,'#5c4732',sp>55?'#94826a':null);
    }
    if(this.poisonT>0&&Math.random()<h*7){
      FX.part(this.x+rand(-6,6),this.y-rand(2,12),rand(-12,12),rand(-24,-6),rand(.25,.48),'#84cc16',rand(2,3.2),-10);
    }
    if(this.stunT>0&&Math.random()<h*10){
      FX.part(this.x+rand(-7,7),this.y-rand(8,22),rand(-35,35),rand(-35,15),rand(.12,.25),Math.random()<.5?'#fde047':'#38bdf8',2.2,20);
    }
    if((this.turboT>0||D.speedBoss)&&sp>0&&Math.random()<h*12){
      FX.part(this.x-this.face*6,this.y-8+rand(-5,5),-this.face*rand(25,55),rand(-10,10),rand(.16,.32),'#38bdf8',2.6,0);
    }
    this.popT-=h;
    if(this.popT<=0){ if(this.dmgAcc>=8&&popups.length<40)FX.popup(this.x+rand(-6,6),this.y-this.D.size*12-8,Math.round(this.dmgAcc),'#fff'); this.dmgAcc=0; this.popT=.5; }
  }
  reach(){ // chegou à base: causa dano uma única vez
    if(this.reached||this.dead)return;
    this.reached=true; WM.done++; G.stats.leaks++;
    G.life=Math.max(0,G.life-this.D.leak);
    const ecashLvl=getTechBonus('emergency_cash');
    if(ecashLvl>0&&G.emergencyCashWave!==WM.num&&G.life>0){
      G.emergencyCashWave=WM.num;
      const ecash=[0,75,150,250][ecashLvl]||75;
      G.money+=ecash;G.earned+=ecash;coinBump();
      FX.popup(W/2,H/2+20,'🚨 FINANCIAMENTO DE CRISE: +$'+ecash,'#38bdf8',true);
      toast('Financiamento de Crise ativado: +$'+ecash+' moedas!','good');
    }
    syncCoopBase();
    G.flash=.55; G.flashCol='#d00000'; G.shake=Math.max(G.shake,8);
    FX.popup(880,236,'-'+this.D.leak,'#ff5040',true); Snd.play('hurt');
    if(G.life<=0)endGame(false);
  }
}
function acquireZombie(type,wave){
  return _zombiePool.length?_zombiePool.pop().init(type,wave):new Zombie(type,wave);
}
function releaseZombie(z){
  if(z&&_zombiePool.length<400)_zombiePool.push(z);
}

class Proj {
  constructor(o){ this.hit=[]; this.init(o); }
  init(o){
    this.kind='bullet'; this.pierce=1; this.r=3; this.life=2; this.dtype='phys';
    this.color='#ffe080'; this.armorPen=0; this.bigMult=0; this.splash=0;
    this.crit=false; this.burnDps=0; this.burnT=0; this.poisonDps=0; this.poisonT=0;
    this.spreadR=0; this.stun=0; this.slow=0; this.slowT=0; this.warpMini=0;
    this.owner=null; this.len=6; this.alive=true;
    if(this.hit)this.hit.length=0; else this.hit=[];
    if(o)Object.assign(this,o);
    return this;
  }
  update(h){
    if(this.kind==='shell'){ // projétil de morteiro: trajetória parabólica até a posição prevista
      this.t+=h; const k=Math.min(1,this.t/this.T);
      this.x=this.sx+(this.tx-this.sx)*k; this.y=this.sy+(this.ty-this.sy)*k; this.hgt=Math.sin(Math.PI*k)*70;
      if(k>=1){explode(this.tx,this.ty,this.splash,this.dmg,'expl',{armorPen:this.armorPen,burnDps:this.burnDps,burnT:this.burnT,stun:this.stun,owner:this.owner});return false;}
      return true;
    }
    const px=this.x,py=this.y; this.x+=this.vx*h; this.y+=this.vy*h; this.life-=h;
    if(this.life<=0||this.x<-80||this.x>W+80||this.y<-80||this.y>H+80)return false;
    // Bloqueio geométrico de Linha de Visão (Barreiras Táticas interceptam tiros rasos de Sniper/Direcional sem contorno)
    if(this.kind!=='shell'&&this.kind!=='glob'&&obstacles.length>0&&this.owner){
      const btd=window.QZ_BTD6_TOWERS;
      if(btd&&typeof btd.isTowerAffectedByLoS==='function'&&btd.isTowerAffectedByLoS(this.owner)){
        for(let oi=0;oi<obstacles.length;oi++){
          const ob=obstacles[oi];
          if(!ob||ob.blocksLoS===false)continue;
          const obr=Math.max(10,(ob.r||18)*0.85);
          if(segDist2(px,py,this.x,this.y,ob.x,ob.y)<=obr*obr){
            FX.spark(this.x,this.y,'#94a3b8',3);
            return false;
          }
        }
      }
    }
    for(const z of zombies){
      if(z.dead||z.reached||this.hit.includes(z.id))continue;
      const rr=z.r+this.r;
      if(segDist2(px,py,this.x,this.y,z.x,z.y)<=rr*rr){
        this.onHit(z); this.hit.push(z.id); this.pierce--;
        if(this.pierce<=0)return false;
      }
    }
    return true;
  }
  onHit(z){
    if(this.kind==='glob'){ // veneno
      applyDamage(z,this.dmg,'poison',{owner:this.owner});
      if(!z.dead&&this.armorPen>0)z.armor=Math.max(0,z.armor-this.armorPen*.12);
      if(!z.dead){
        poisonZ(z,this.poisonDps,this.poisonT);
        if(this.spreadR>0){ let n=0;
          for(const o of zombies){ if(n>=4)break; if(o===z||o.dead||o.reached)continue;
            if(dist(o.x,o.y,z.x,z.y)<=this.spreadR){poisonZ(o,this.poisonDps*.8,this.poisonT*.8);FX.spark(o.x,o.y-6,'#7fe03a',3);n++;} } }
      }
      FX.spark(z.x,z.y-6,'#7fe03a',5); return;
    }
    applyDamage(z,this.dmg,this.dtype,{armorPen:this.armorPen,bigMult:this.bigMult,crit:this.crit,owner:this.owner});
    if(!z.dead){
      if(this.stun>0)stunZ(z,this.stun);
      if(this.slow>0)slowZ(z,this.slow,this.slowT||1.4);
      if(this.burnDps>0)ignite(z,this.burnDps,this.burnT||3);
      if(this.warpMini>0&&!z.D.boss&&srand()<0.20){
        z.dist=Math.max(0,z.dist-this.warpMini);
        z.place();
        FX.ring(z.x,z.y,3,18,.22,'#c084fc',2);
      }
    }
    FX.spark(z.x,z.y-6,this.color||'#ffd060',3);
    if(this.splash>0)explode(z.x,z.y,this.splash,this.dmg*.5,'expl',{owner:this.owner,stun:this.stun});
  }
}
function acquireProj(o){
  return _projPool.length?_projPool.pop().init(o):new Proj(o);
}
function releaseProj(p){
  if(p&&_projPool.length<600)_projPool.push(p);
}

// Seleção de alvo: first | last | strong | close (com verificação de Linha de Visão estilo BTD6 Sniper)
function findTarget(t){
  let best=null,bv=-1e12; const r=t.s.range*(1+(t._auraRange||0)), pr=t.priority, canCamo=t.def.detectCamo||t._auraCamo, canAir=t.def.canAir||t._auraCamo;
  const btd=window.QZ_BTD6_TOWERS;
  const checkLoS=!!(obstacles.length>0&&btd&&typeof btd.isTowerAffectedByLoS==='function'&&btd.isTowerAffectedByLoS(t));
  for(const z of zombies){
    if(z.dead||z.reached)continue;
    if(z.D.camo&&!canCamo)continue;
    if(z.D.flying&&!canAir)continue;
    const dx=z.x-t.x,dy=z.y-t.y,d2=dx*dx+dy*dy,rr=r+z.r*.5;
    if(d2>rr*rr)continue;
    if(checkLoS&&!btd.hasLineOfSight(t.x,t.y,z.x,z.y,obstacles,t))continue;
    const v=pr==='first'?z.dist:pr==='last'?-z.dist:pr==='strong'?z.hp:-d2;
    if(v>bv){bv=v;best=z;}
  }
  return best;
}
// posição futura do alvo (para compensar tempo de voo)
function predict(z,speed,sx,sy){
  let tt=dist(z.x,z.y,sx,sy)/speed, x=z.x, y=z.y;
  for(let i=0;i<3;i++){
    pathPos(Math.min(PATH_LEN,z.dist+z.cur*tt),_pp);
    x=_pp.x-_pp.dy*z.off; y=_pp.y+_pp.dx*z.off; tt=dist(x,y,sx,sy)/speed;
  }
  return {x,y,t:tt};
}

function spawnTrackAlly(t){
  const np=nearestPathProg(t.x,t.y);
  pathPos(np.d,_pp);
  const a=_allyPool.length?_allyPool.pop():{};
  a.owner=t;
  a.dist=np.d;
  a.x=_pp.x;
  a.y=_pp.y;
  a.hp=Math.round((t.s.allyHp||180)*(1+t.tier*0.18));
  a.maxHp=a.hp;
  a.dmg=Math.round((t.s.dmg||34)*(1+(t._auraDmg||0))*0.85);
  a.speed=72+t.tier*5;
  a.armor=Math.min(0.45,0.12+t.tier*0.06);
  a.atkCD=0;
  a.life=16+t.tier*1.5;
  a.stun=t.s.stun||0.22;
  a.phase=srand()*6.28;
  a.face=-1;
  a.walkT=0;
  a.biteT=0;
  allies.push(a);
  t.spawnFlash=1.0;
  t.pulse=Math.max(t.pulse||0,0.55);
  FX.ring(t.x,t.y,4,24,.32,'#10b981',2.5);
  FX.ring(a.x,a.y,4,22,.3,'#4ade80',2.5);
}

class Tower {
  constructor(key,x,y){
    this.key=key; this.def=TOWERS[key]; this.x=x; this.y=y; this.id=++uid;
    this.id=++TID; this.tier=0; this.spec=-1; this.ups=[]; this.pathLevels=[0,0,0]; this.pathChoices=[null,null,null]; this.spent=this.def.cost; this.priority=this.def.prio;
    this.cd=0; this.angle=-Math.PI/2; this.recoil=0; this.weak=0; this.heat=0; this.pulse=0; this.spawnFlash=0; this.abilityCD=0; this.abilityT=0; this.paragon=false; this.kills=0;
    const np=nearestPathProg(x,y);
    pathPos(np.d,_pp);
    this.aimX=Math.round(_pp.x);
    this.aimY=Math.round(_pp.y);
    if(key==='dartgun'||key==='minefactory')this.angle=Math.atan2(this.aimY-y,this.aimX-x);
    this.entryDist=np.d;
    this.entryX=Math.round(_pp.x);
    this.entryY=Math.round(_pp.y);
    this.exitDist=Math.max(12,np.d-210);
    pathPos(this.exitDist,_pp);
    this.exitX=Math.round(_pp.x);
    this.exitY=Math.round(_pp.y);
    if(key==='dino'){
      pathPos(np.d,_pp);
      this._dino={x:_pp.x,y:_pp.y,homeX:_pp.x,homeY:_pp.y,angle:0,cd:0,lunge:0,biteT:0,roarT:0,tailT:0,stompT:0,pounceT:0,walkT:0,moving:false,atkCount:0};
      this.spawnCD=3.0;
    }
    this.recalc();
  }
  get level(){return Math.min(4,this.tier+1);}
  get dominantPath(){
    const lv=this.pathLevels||[0,0,0];
    const mx=Math.max(lv[0],lv[1],lv[2]);
    if(mx<=0)return -1;
    return lv[0]>=lv[1]&&lv[0]>=lv[2]?0:(lv[1]>=lv[0]&&lv[1]>=lv[2]?1:2);
  }
  recalc(){
    this.s=Object.assign({},this.def.base);
    for(const u of this.ups)u.apply(this.s);
    // Calibração balanceada: mantém os atributos próximos aos valores exibidos sem inflar artificialmente o DPS.
    this.s.dmg*=1.25;
    this.s.rate*=1.05;
    if(this.s.burnDps)this.s.burnDps*=1.2;
    if(this.s.poisonDps)this.s.poisonDps*=1.2;
    if(this.key==='sniper')this.s.range=1400;
    const rangeBoost=1+getTechBonus('tower_range')*0.03;
    this.s.range*=rangeBoost;
    if(this._teslaBoost)this.s.dmg*=1.8;
    if(this._supportBoost)this.s.rate*=1.45;
    if(this.paragon)applyParagonStats(this);
  }
  update(h){
    if(this.abilityCD>0)this.abilityCD=Math.max(0,this.abilityCD-h);
    if(this.abilityT>0){
      this.abilityT=Math.max(0,this.abilityT-h);
      if(this.abilityT===0){
        if(this._teslaBoost||this._supportBoost){this._teslaBoost=false;this._supportBoost=false;this.recalc();}
      }
    }
    if(this.weak>0)this.weak-=h;
    if(this._purify&&this.weak>0)this.weak=0;
    if(this.recoil>0)this.recoil=Math.max(0,this.recoil-h*7);
    if(this.pulse>0)this.pulse-=h;
    if(this.spawnFlash>0)this.spawnFlash=Math.max(0,this.spawnFlash-h*1.8);
    const s=this.s, rate=s.rate*(1+(this._auraRate||0))*(this.weak>0?.5:1)*(callinState.activeOverclock>0?1.45:1), k=this.def.kind;

    if(k==='support_eco'){ // Base de Suprimentos: gera moedas durante a onda ativa
      if(WM.state==='active'){
        this.cd-=h;
        if(this.cd<=0){
          const inc=Math.round(s.income||25);
          G.money+=inc; G.earned+=inc; coinBump();
          FX.popup(this.x,this.y-18,'+'+inc+' ●','#ffd24a',true);
          FX.ring(this.x,this.y,6,36,.4,'#ffd24a',2.5);
          this.pulse=.35; Snd.play('coin');
          this.cd=1/Math.max(.05,rate);
        }
      }
      return;
    }
    if(k==='support_debuff'){ // Torre de Estase: desacelera e aplica vulnerabilidade em área
      this.cd-=h;
      if(this.cd<=0){
        const r2=s.range*s.range; let any=false;
        for(const z of zombies){ if(z.dead||z.reached)continue; const dx=z.x-this.x,dy=z.y-this.y; if(dx*dx+dy*dy<=r2){any=true;break;} }
        if(any){
          for(const z of zombies){
            if(z.dead||z.reached)continue;
            const dx=z.x-this.x,dy=z.y-this.y; if(dx*dx+dy*dy>r2)continue;
            applyDamage(z,s.dmg*(1+(this._auraDmg||0)),'ice',{owner:this});
            if(!z.dead){
              slowZ(z,s.slow||.42,s.slowT||2.4);
              z.vulnT=Math.max(z.vulnT||0,3.5); z.vulnAmt=Math.max(z.vulnAmt||0,s.vuln||.28);
              if(s.freezeChance&&srand()<s.freezeChance)freezeZ(z,s.freezeT||.9);
              FX.spark(z.x,z.y-8,'#c084fc',2);
            }
          }
          FX.ring(this.x,this.y,8,s.range,.45,'#a855f7',3); this.pulse=.35; Snd.play('ice');
          this.cd=1/rate;
        } else this.cd=0;
      }
      return;
    }
    if(k==='dartgun'){ // Torre Direcional (Estilo Dartling Gunner): mira travada no ponto (aimX, aimY)
      this.angle=Math.atan2(this.aimY-this.y,this.aimX-this.x);
      if(WM.state==='active'||zombies.length>0){
        this.cd-=h;
        if(this.cd<=0){
          this.fireDartgun();
          this.cd+=1/Math.max(0.2,rate);
          if(this.cd<0)this.cd=0;
          this.recoil=0.85;
        }
      } else if(this.cd>0){
        this.cd=Math.max(0,this.cd-h);
      }
      return;
    }
    if(k==='minefactory'){ // Usina de Minas Terrestres (Estilo Spike Factory) com Stun
      if(WM.state==='active'||zombies.length>0){
        this.cd-=h;
        if(this.cd<=0){
          this.throwLandmine();
          this.cd=1/Math.max(0.1,rate);
          this.recoil=0.8;
          this.pulse=0.3;
        }
      }
      return;
    }
    if(k==='summoner'){ // Torre com Invocações e Dinossauro
      this.updateDino(h,rate);
      if(WM.state==='active'||zombies.length>0){
        this.spawnCD=(this.spawnCD||3.5)-h;
        if(this.spawnCD<=0){
          let myAllies=0;
          for(let i=0;i<allies.length;i++)if(allies[i].owner===this)myAllies++;
          if(myAllies<(this.paragon?5:3)){
            spawnTrackAlly(this);
          }
          this.spawnCD=Math.max(2.2,5.6-this.tier*0.45);
        }
      }
    }
    if(k==='ice'){ // pulso em área
      this.cd-=h;
      if(this.cd<=0){
        const r2=s.range*s.range; let any=false;
        for(const z of zombies){ if(z.dead||z.reached||(z.D.camo&&!this.def.detectCamo&&!this._auraCamo)||(z.D.flying&&!this.def.canAir&&!this._auraCamo))continue; const dx=z.x-this.x,dy=z.y-this.y; if(dx*dx+dy*dy<=r2){any=true;break;} }
        if(any){ this.icePulse(); this.cd=1/rate; } else this.cd=0;
      }
      return;
    }
    const tg=findTarget(this);
    if(k==='flame'){
      if(tg){
        this.angle=Math.atan2(tg.y-this.y,tg.x-this.x);
        this.heat=Math.min(1,this.heat+h/2.2); this.cd-=h; let g=0;
        while(this.cd<=0&&g++<4){this.cd+=1/rate;this.flameTick();}
      } else { this.heat=Math.max(0,this.heat-h*1.2); this.cd=0; }
      return;
    }
    if(!tg){ if(this.cd>0)this.cd=Math.max(0,this.cd-h); return; }
    this.angle=Math.atan2(tg.y-this.y,tg.x-this.x);
    this.cd-=h;
    if(this.cd<=0){ this.fire(tg); this.cd+=1/rate; if(this.cd<0)this.cd=0; this.recoil=1; }
  }
  updateDino(h,rate){
    const dn=this._dino;
    if(!dn)return;
    if(dn.lunge>0)dn.lunge=Math.max(0,dn.lunge-h*4.8);
    if(dn.biteT>0)dn.biteT=Math.max(0,dn.biteT-h*3.4);
    if(dn.roarT>0)dn.roarT=Math.max(0,dn.roarT-h);
    if(dn.tailT>0)dn.tailT=Math.max(0,dn.tailT-h*3.2);
    if(dn.stompT>0)dn.stompT=Math.max(0,dn.stompT-h*3.6);
    if(dn.pounceT>0)dn.pounceT=Math.max(0,dn.pounceT-h*4.0);
    dn.moving=false;
    const s=this.s, r=s.range*(1+(this._auraRange||0))*1.22;
    let best=null, bd=r;
    for(const z of zombies){
      if(z.dead||z.reached||z.D.flying)continue;
      const d=dist(z.x,z.y,this.x,this.y);
      if(d<=bd){bd=d;best=z;}
    }
    if(best){
      const dx=best.x-dn.x, dy=best.y-dn.y, d=Math.hypot(dx,dy)||1;
      dn.angle=Math.atan2(dy,dx);
      const moveSpd=152+this.tier*16;
      if(d>24){
        // Bote predatório quando se aproxima do alvo
        if(d>38&&d<92&&(!dn.pounceT||dn.pounceT<=0)&&(dn.cd||0)<=0.15){
          dn.pounceT=0.85;
        }
        const boost=dn.pounceT>0?1.35:1;
        dn.x+=dx/d*Math.min(d,moveSpd*boost*h);
        dn.y+=dy/d*Math.min(d,moveSpd*boost*h);
        dn.moving=true;
        dn.walkT=(dn.walkT||0)+h*(dn.pounceT>0?19:14);
        if(Math.random()<h*12){
          FX.footprint(dn.x,dn.y,'#57412a','#a8967a');
          if(this.tier>=2)FX.part(dn.x+rand(-6,6),dn.y-4,rand(-18,18),rand(-24,-6),rand(.18,.36),this.paragon?'#fde047':'#f97316',2.6,0);
        }
      }
      dn.cd=(dn.cd||0)-h;
      if(d<=34&&dn.cd<=0){
        const dMult=1+(this._auraDmg||0);
        // Dinossauro significativamente mais forte que o disparo base da torre
        const biteDmg=(s.dinoDmg||68)*dMult*(this.paragon?2.25:1.15);
        applyDamage(best,biteDmg,'phys',{armorPen:s.armorPen||.35,bigMult:s.bigMult||1.35,owner:this});
        if(!best.dead){
          if(s.stun)stunZ(best,s.stun);
          if(s.burnDps)ignite(best,s.burnDps,s.burnT||3);
        }
        dn.atkCount=(dn.atkCount||0)+1;
        dn.tailT=(dn.atkCount%2===0)?1:0.4;
        // Golpe de cauda, pisão e rugido sísmico em área a partir do nível 3 (ou a cada 3 mordidas) com limite justo de alvos
        if(this.tier>=3||this.paragon||(dn.atkCount%3===0&&this.tier>=1)){
          let hitTargets=0;
          const maxCleave=this.paragon?7:4;
          for(const o of zombies){
            if(hitTargets>=maxCleave)break;
            if(o===best||o.dead||o.reached)continue;
            if(dist(o.x,o.y,dn.x,dn.y)<=52){
              applyDamage(o,biteDmg*0.62,'phys',{armorPen:s.armorPen||.35,owner:this});
              if(!o.dead&&s.stun)stunZ(o,s.stun*0.65);
              hitTargets++;
            }
          }
          dn.roarT=0.65;
          dn.stompT=1.0;
          FX.ring(dn.x,dn.y,6,52,.34,'#f97316',3.2);
          FX.ring(dn.x,dn.y,12,34,.25,'#fde047',2.2);
        }
        FX.spark(best.x,best.y-8,'#fb923c',6);
        dn.lunge=1;
        dn.biteT=1;
        dn.cd=1/Math.max(0.42,rate*1.18);
      }
    } else {
      // Retorna suavemente para o ponto de guarda próximo à pista
      const dx=dn.homeX-dn.x, dy=dn.homeY-dn.y, d=Math.hypot(dx,dy);
      if(d>4){
        dn.angle=Math.atan2(dy,dx);
        dn.x+=dx/d*Math.min(d,96*h);
        dn.y+=dy/d*Math.min(d,96*h);
        dn.moving=true;
        dn.walkT=(dn.walkT||0)+h*10;
        if(Math.random()<h*6)FX.footprint(dn.x,dn.y,'#57412a',null);
      }
    }
  }
  fireDartgun(){
    const s=this.s, m=this.muzzle(), dMult=1+(this._auraDmg||0);
    const sp=s.pspeed||780;
    const spread=(s.spread||0.05)*(this.paragon?0.5:1);
    const a=this.angle+(srand()-0.5)*spread*2;
    let dmg=s.dmg*dMult, crit=false;
    const critRate=(s.crit||0)+getTechBonus('crit_chance')*0.02;
    if(critRate>0&&srand()<critRate){dmg*=s.critMult||2.2;crit=true;}
    projs.push(acquireProj({
      x:m.x,y:m.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,dmg,dtype:'phys',
      pierce:s.pierce||2,armorPen:s.armorPen||.12,bigMult:s.bigMult||0,
      splash:s.splash||0,crit,r:this.tier>=4?4:3,life:(Math.max(W,H)+120)/sp,
      color:this.paragon?'#fde047':this.dominantPath===0?'#38bdf8':this.dominantPath===1?'#f97316':'#4ade80',
      len:this.tier>=3?14:10,owner:this
    }));
    FX.part(m.x,m.y,Math.cos(a)*35,Math.sin(a)*35,.09,'#bae6fd',2.5,0);
    Snd.play('shoot');
  }
  throwLandmine(){
    const s=this.s, dMult=1+(this._auraDmg||0), r=s.range*(1+(this._auraRange||0));
    // Encontra pontos da pista dentro do alcance da Usina de Minas
    const candidates=[];
    for(let d=12;d<PATH_LEN-12;d+=22){
      pathPos(d,_pp);
      if(dist(_pp.x,_pp.y,this.x,this.y)<=r)candidates.push({d,x:_pp.x,y:_pp.y});
    }
    let tx,ty;
    if(candidates.length>0){
      const pick=candidates[(srand()*candidates.length)|0];
      tx=pick.x+(srand()-.5)*12;
      ty=pick.y+(srand()-.5)*12;
    } else {
      const np=nearestPathProg(this.x,this.y);
      pathPos(np.d,_pp);
      tx=_pp.x; ty=_pp.y;
    }
    const maxSt=Math.max(1,Math.round((s.maxStacks||4)*(this.paragon?2:1)));
    this.angle=Math.atan2(ty-this.y,tx-this.x);
    // Verifica se pode acumular (stack) em uma mina próxima desta mesma usina
    for(const m of mines){
      if(m.armed&&m.owner===this&&m.stacks<maxSt&&dist(m.x,m.y,tx,ty)<22){
        m.stacks++;
        m.life=Math.max(m.life,38);
        m.sx=this.x; m.sy=this.y; m.flyT=0.18; m.maxFly=0.18;
        FX.ring(m.x,m.y,3,16,.2,'#facc15',2);
        Snd.play('build');
        return;
      }
    }
    // Limita total de pilhas ativas por usina para performance
    let myCount=0;
    for(let i=0;i<mines.length;i++)if(mines[i].owner===this)myCount++;
    if(myCount>=18){
      const oldest=mines.find(m=>m.owner===this&&m.armed);
      if(oldest){oldest.stacks=Math.min(maxSt,oldest.stacks+1);oldest.life=38;return;}
    }
    const mn=_minePool.length?_minePool.pop():{};
    mn.x=Math.round(tx); mn.y=Math.round(ty);
    mn.sx=this.x; mn.sy=this.y; mn.flyT=0.22; mn.maxFly=0.22;
    mn.armed=true; mn.owner=this;
    mn.dmg=s.dmg*dMult; mn.splash=s.splash||54;
    mn.stun=s.stun||0.75; mn.armorPen=s.armorPen||0.35;
    mn.burnDps=s.burnDps||0; mn.burnT=s.burnT||0;
    mn.stacks=1; mn.maxStacks=maxSt; mn.life=40;
    mines.push(mn);
    FX.part(this.x+Math.cos(this.angle)*12,this.y+Math.sin(this.angle)*12,Math.cos(this.angle)*40,Math.sin(this.angle)*40-15,.22,'#fbbf24',3,60);
    Snd.play('build');
  }
  muzzle(){ const L=14+this.level*2; return {x:this.x+Math.cos(this.angle)*L,y:this.y-4+Math.sin(this.angle)*L}; }
  fire(tg){
    const s=this.s,k=this.def.kind,m=this.muzzle(),dMult=1+(this._auraDmg||0);
    if(k==='bullet'||k==='summoner'||k==='portal'){
      const sp=s.pspeed||680; const t=dist(tg.x,tg.y,m.x,m.y)/sp;
      pathPos(Math.min(PATH_LEN,tg.dist+tg.cur*t),_pp);
      const px=_pp.x-_pp.dy*tg.off, py=_pp.y+_pp.dx*tg.off;
      const a=Math.atan2(py-m.y,px-m.x); this.angle=a;
      let dmg=s.dmg*dMult,crit=false;
      const critRate=(s.crit||0)+getTechBonus('crit_chance')*0.02;
      if(critRate>0&&srand()<critRate){dmg*=s.critMult;crit=true;}
      const heavy=this.key==='antitank',sn=this.key==='sniper',isPortal=k==='portal';
      projs.push(acquireProj({x:m.x,y:m.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,dmg,dtype:'phys',pierce:s.pierce||1,armorPen:s.armorPen||0,bigMult:s.bigMult||0,
        splash:s.splash||0,crit,stun:s.stun||0,slow:isPortal?(s.slow||.24):0,slowT:isPortal?(s.slowT||1.4):0,warpMini:isPortal?26:0,
        r:heavy?5:sn?3:isPortal?4:2.5,life:(s.range+80)/sp,
        color:isPortal?'#c084fc':heavy?'#ff9040':sn?'#fff':this.key==='beacon'?'#38bdf8':(this.level>=3?'#ffb040':'#ffe080'),
        len:sn?16:heavy?14:isPortal?12:6,owner:this}));
      FX.part(m.x,m.y,Math.cos(a)*30,Math.sin(a)*30,.1,isPortal?'#e879f9':'#ffe8a0',3,0);
      Snd.play(heavy?'boom':sn?'snipe':isPortal?'zap':'shoot');
    } else if(k==='mortar'){
      const p=predict(tg,s.pspeed,this.x,this.y-6);
      projs.push(acquireProj({kind:'shell',x:this.x,y:this.y-6,sx:this.x,sy:this.y-6,tx:p.x,ty:p.y,t:0,T:Math.max(.3,p.t),hgt:0,dmg:s.dmg*dMult,splash:s.splash,armorPen:s.armorPen||0,burnDps:s.burnDps||0,burnT:s.burnT||0,owner:this}));
      FX.part(this.x,this.y-12,0,-30,.5,'#666',4,-10); Snd.play('boom');
    } else if(k==='tesla'){
      this.fireTesla(tg);
    } else if(k==='poison'){
      const sp=s.pspeed,t=dist(tg.x,tg.y,m.x,m.y)/sp;
      pathPos(Math.min(PATH_LEN,tg.dist+tg.cur*t),_pp);
      const px=_pp.x-_pp.dy*tg.off,py=_pp.y+_pp.dx*tg.off,a=Math.atan2(py-m.y,px-m.x);
      projs.push(acquireProj({kind:'glob',x:m.x,y:m.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,dmg:s.dmg*dMult,r:4,life:(s.range+60)/sp,color:'#7fe03a',
        poisonDps:s.poisonDps,poisonT:s.poisonT,spreadR:s.spreadR,armorPen:s.armorPen||0,owner:this}));
      Snd.play('poison');
    }
  }
  fireTesla(tg){
    const s=this.s, dMult=1+(this._auraDmg||0), pts=[{x:this.x,y:this.y-20},{x:tg.x,y:tg.y-8}], hit=[tg]; let cur=tg;
    for(let i=0;i<s.chain;i++){
      let best=null,bd=s.chainR;
      for(const z of zombies){ if(z.dead||z.reached||hit.includes(z))continue; const d=dist(z.x,z.y,cur.x,cur.y); if(d<bd){bd=d;best=z;} }
      if(!best)break; hit.push(best); pts.push({x:best.x,y:best.y-8}); cur=best;
    }
    hit.forEach((z,i)=>{ applyDamage(z,s.dmg*dMult*(1-.07*i),'elec',{owner:this}); if(!z.dead){slowZ(z,s.slow,s.slowT); if(s.stun)stunZ(z,s.stun);} });
    FX.bolt(pts); this.pulse=.2; Snd.play('zap');
  }
  icePulse(){
    const s=this.s,r2=s.range*s.range;
    for(const z of zombies){
      if(z.dead||z.reached||(z.D.camo&&!this.def.detectCamo)||(z.D.flying&&!this.def.canAir))continue; const dx=z.x-this.x,dy=z.y-this.y; if(dx*dx+dy*dy>r2)continue;
      applyDamage(z,s.dmg,'ice',{owner:this});
      if(!z.dead){ slowZ(z,s.slow,s.slowT); if(s.freezeChance&&srand()<s.freezeChance)freezeZ(z,s.freezeT); FX.spark(z.x,z.y-8,'#bfe8ff',2); }
    }
    FX.ring(this.x,this.y,8,s.range,.45,'#9fdcff',3); this.pulse=.3; Snd.play('ice');
  }
  flameTick(){
    const s=this.s, mul=1+this.heat*s.ramp, m=this.muzzle();
    for(const z of zombies){
      if(z.dead||z.reached||(z.D.camo&&!this.def.detectCamo)||(z.D.flying&&!this.def.canAir))continue;
      const dx=z.x-this.x,dy=z.y-this.y,d=Math.hypot(dx,dy);
      if(d>s.range+z.r)continue;
      if(Math.abs(angDiff(Math.atan2(dy,dx),this.angle))>s.cone+z.r/Math.max(d,1))continue;
      applyDamage(z,s.dmg*mul,'fire',{owner:this}); if(!z.dead)ignite(z,s.burnDps,s.burnT);
    }
    FX.flame(m.x,m.y,this.angle,s.range); this.recoil=.3; Snd.play('flame');
  }
}

/* ===================== 8. ONDAS (WM) E PODERES (Powers) ===================== */
// Função pura: a mesma onda sempre tem a mesma composição (permite pré-visualizar).
function buildWave(n){
  const U=WAVECFG.unlock,C=WAVECFG.threat,I=WAVECFG.interval;
  const avail=Object.keys(U).filter(k=>U[k]<=n&&k!=='speedboss'), boss=n%10===0;
  const budget=(62+19*n+1.05*n*n)*(boss?.72:1);
  const others=avail.filter(k=>k!=='common'), picked=[];
  if(others.length){
    const want=Math.min(others.length,1+Math.floor(n/6));
    others.filter(k=>U[k]===n).forEach(k=>picked.push(k));      // novo inimigo sempre aparece
    let i=(n*2)%others.length;
    while(picked.length<want){const k=others[i%others.length];if(!picked.includes(k))picked.push(k);i++;}
  }
  const commonShare=picked.length?Math.max(.18,.68-.035*n):1;
  const groups=[{type:'common',count:Math.max(3,Math.round(budget*commonShare/C.common))}];
  const rest=budget*(1-commonShare);
  picked.forEach(k=>{
    let c=Math.max(1,Math.round(rest/picked.length/C[k]));
    if(k==='healer')c=Math.min(c,1+Math.floor(n/5));
    if(k==='giant')c=Math.min(c,1+Math.floor(n/9));
    if(k==='brute')c=Math.min(c,1+Math.floor(n/10));
    if(k==='screamer')c=Math.min(c,1+Math.floor(n/7));
    groups.push({type:k,count:c});
  });
  if(n%5===0&&!boss){ // onda desafiadora a cada 5: enxame + blindados + curandeiros
    groups.push({type:'runner',count:7+n});
    groups.push({type:'armored',count:2+Math.floor(n/4)});
    if(U.healer<=n)groups.push({type:'healer',count:1+Math.floor(n/8)});
  }
  if(boss){
    groups.push({type:'armored',count:4+Math.floor(n/4)});
    if(U.healer<=n)groups.push({type:'healer',count:2+Math.floor(n/10)});
  }
  const out=[]; let cursor=0;
  for(const g of groups){
    const iv=I[g.type]*Math.max(.48,1-n*.014);
    for(let i=0;i<g.count;i++)out.push({t:cursor+i*iv,type:g.type});
    cursor+=g.count*iv*.58+.9;
  }
  if(boss){ const bc=1+Math.floor(n/35); for(let b=0;b<bc;b++)out.push({t:3+b*13,type:'boss'}); }
  if(n===15||n===25||n===35||(n>=40&&n%10===5))out.push({t:4.2,type:'speedboss'});
  if(n%20===0&&n>=40)out.push({t:8,type:'nemesis'});
  if(n%10===0&&n>=20)out.push({t:6,type:'colossus'});
  out.sort((a,b)=>a.t-b.t);
  return out;
}
const _descCache={};
function describeWave(n){
  if(_descCache[n])return _descCache[n];
  const cnt={}; buildWave(n).forEach(e=>cnt[e.type]=(cnt[e.type]||0)+1);
  return _descCache[n]=Object.keys(cnt).map(k=>cnt[k]+'x '+ZOMBIES[k].name.replace('Zumbi ','')).join(', ')+((cnt.camo||cnt.flyer)?' — ⚠ exige Radar ou Drone':'');
}

const WM = {
  num:0, queue:[], clock:0, state:'idle', prep:null, total:0, done:0, pending:[],
  reset(){this.num=0;this.queue.length=0;this.clock=0;this.state='idle';this.prep=null;this.total=0;this.done=0;this.pending.length=0;},
  send(){
    if(G.mode!=='play')return;
    this.num++; const list=buildWave(this.num);
    for(const e of list)this.queue.push({t:this.clock+.5+e.t,type:e.type,wave:this.num});
    this.queue.sort((a,b)=>a.t-b.t);
    this.total+=list.length; this.pending.push(this.num); this.state='active'; this.prep=null;
    const isBoss=(this.num%10===0&&this.num>=10)||this.num===15||this.num===25||this.num===35;
    let weather=null;
    if(this.num>=6){
      if(this.num%8===6)weather='emp_storm';
      else if(this.num%8===0)weather='acid_rain';
      else if(this.num%8===2)weather='blizzard';
      else if(this.num%8===4)weather='toxic_fog';
    }
    G.weather=weather;
    updateWeatherUI(weather);
    toast('ONDA '+this.num+(isBoss?' — CHEFE!':this.num%5===0?' — DESAFIO!':''),isBoss?'bad':'');
    if(isBoss)Snd.play('alarm'); else Snd.play('horn');
    syncCoopBase();
  },
  update(h){
    this.clock+=h;
    while(this.queue.length&&this.queue[0].t<=this.clock){
      const e=this.queue.shift();
      const z=acquireZombie(e.type,e.wave);
      zombies.push(z);
      if(z.D.boss){
        Snd.play('alarm');
        G.shake=Math.max(G.shake,8);
        G.flash=0.4;
        G.flashCol=z.D.speedBoss?'rgba(56, 189, 248, 0.38)':'rgba(239, 68, 68, 0.38)';
        toast('🚨 ALERTA DE EMERGÊNCIA: '+z.D.name+' DETECTADO!','bad');
      }
    }
    if(this.state==='idle'&&this.prep!==null){this.prep-=h;if(this.prep<=0)this.send();}
  },
  checkClear(){
    if(this.state!=='active'||this.queue.length>0||zombies.length>0)return;
    let bonus=0; for(const n of this.pending)bonus+=CFG.waveBonusBase+CFG.waveBonusPer*n;
    this.pending.length=0; G.money+=bonus; G.earned+=bonus; coinBump();
    let totalHeal=0;
    for(const t of towers)if(t.s.healBase)totalHeal+=Math.round(t.s.healBase);
    if(totalHeal>0&&G.life<CFG.baseLife){const bf=G.life;G.life=Math.min(CFG.baseLife,G.life+totalHeal);if(G.life>bf){FX.popup(860,220,'+'+(G.life-bf)+' VIDA (NANO)','#2be3a1',true);syncCoopBase();}}
    FX.popup(W/2,H/2,'+'+bonus+' BÔNUS','#f2c230',true); Snd.play('coin');
    toast('Onda '+this.num+' concluída! +'+bonus+' moedas','good');
    if(this.num%5===0&&!G.replay){
      career.techPoints=(career.techPoints||0)+1;
      saveCareer();
      FX.popup(W/2,H/2+30,'+1 BIOCÉLULA ALFA 🔬','#c084fc',true);
      toast('Pesquisa Militar: +1 Biocélula obtida na Onda '+this.num+'!','good');
    }
    this.state='idle'; this.total=0; this.done=0; this.prep=G.auto?CFG.prepTime:null;
    syncCoopBase();
    if(this.num>=CFG.victoryWave&&!G.won){
      G.won=true;G.paused=true;
      const winTech=activeDifficulty==='apocalypse'?12:activeDifficulty==='hard'?8:activeDifficulty==='normal'?5:3;
      if(!G.replay){
        career.techPoints=(career.techPoints||0)+winTech;
        toast('Vitória na Missão: +'+winTech+' Biocélulas Alfa concedidas!','good');
      }
      career.bestWave=Math.max(career.bestWave,WM.num);
      career.totalKills+=G.kills;
      career.games++;
      career.lastMap=activeMap;
      career.lastDifficulty=activeDifficulty;
      career.medals=career.medals||{};
      career.medals[activeMap]=career.medals[activeMap]||{};
      career.medals[activeMap][activeDifficulty]=true;
      saveCareer();
      if(typeof renderMapMedals==='function')renderMapMedals();
      showEnd(true);
    }
  },
  remaining(){return this.queue.length+zombies.length;}
};

function supplyOk(){return powerState.supply.uses<3&&G.simT>=powerState.supply.nextAt;}
const Powers = {
  click(key){
    const P=POWERS[key];
    if(!P||G.mode!=='play')return;
    if(key==='supply'){const sp=powerState.supply;
      if(sp.uses>=3){toast('Você já usou os 3 suprimentos desta partida.','bad');return;}
      if(G.simT<sp.nextAt){toast('Suprimentos disponíveis em '+fmtTime(sp.nextAt-G.simT)+'.','bad');return;}}
    if(!Number.isFinite(G.money)||G.money<P.cost){noMoney();return;}
    
    // Poderes são consumíveis: pagar novamente antes de CADA ativação.
    if(key==='repair'||key==='supply'||key==='pulse'){
      if(key==='repair'&&G.life>=CFG.baseLife){toast('A base já está com vida máxima.','bad');return;}
      G.money-=P.cost; this.lastOk=true; this.activate(key); return;
    }
  },
  activate(key,x,y){
    if(key==='repair'){
      const before=G.life;G.life=Math.min(CFG.baseLife,G.life+25);FX.popup(W/2,H/2,'+'+(G.life-before)+' VIDA','#7fe03a',true);Snd.play('power');
    } else if(key==='supply'){
      G.money+=1500;G.earned+=1500;powerState.supply.uses++;powerState.supply.nextAt=G.simT+300;FX.popup(W/2,H/2,'+1500 SUPRIMENTOS','#f2c230',true);Snd.play('coin');
    } else if(key==='pulse'){
      for(const z of zombies){if(z.dead||z.reached)continue;slowZ(z,.45,5);FX.spark(z.x,z.y-8,'#9fe8ff',2);}
      FX.ring(W/2,H/2,20,620,.7,'#9fe8ff',5);Snd.play('power');
    }
    return true;
  },
  update(dt){}   // suprimentos agora usam o tempo de jogo (G.simT), não o relógio real
};

/* ===================== 9. SIMULAÇÃO ===================== */
function updateMinesBombsHazards(h){
  // minas terrestres acumuláveis (com atordoamento / stun)
  for(let i=mines.length-1;i>=0;i--){
    const m=mines[i];
    if(m.flyT>0)m.flyT=Math.max(0,m.flyT-h);
    if(m.life!==undefined){
      m.life-=h;
      if(m.life<=0){m.armed=false;}
    }
    if(!m.armed)continue;
    for(const z of zombies){
      if(z.dead||z.reached||z.D.flying)continue;
      if(Math.abs(z.x-m.x)<z.r+12&&Math.abs(z.y-m.y)<z.r+12){
        m.armed=false;
        const stacks=Math.max(1,m.stacks||1);
        const dmg=(m.dmg||140)*(1+(stacks-1)*0.65);
        const splash=(m.splash||55)*(1+(stacks-1)*0.08);
        const stun=(m.stun||0.75)*(1+(stacks-1)*0.15);
        explode(m.x,m.y,splash,dmg,'expl',{armorPen:m.armorPen||.35,stun,burnDps:m.burnDps||0,burnT:m.burnT||0,owner:m.owner});
        FX.mineBlast(m.x,m.y,splash,stacks);
        break;
      }
    }
  }
  for(let i=mines.length-1;i>=0;i--){
    if(!mines[i].armed){
      const deadM=mines[i];
      if(_minePool.length<300)_minePool.push(deadM);
      mines[i]=mines[mines.length-1];
      mines.pop();
    }
  }
  // aliados invocados na pista (Torre Domador Jurássico)
  for(let i=allies.length-1;i>=0;i--){
    const a=allies[i];
    a.life-=h;
    if(a.atkCD>0)a.atkCD-=h;
    if(a.biteT>0)a.biteT=Math.max(0,a.biteT-h*4);
    if(a.life<=0||a.hp<=0){
      if(_allyPool.length<120)_allyPool.push(a);
      allies[i]=allies[allies.length-1];
      allies.pop();
      continue;
    }
    // Procura zumbi próximo na pista
    let target=null, bd=34;
    for(const z of zombies){
      if(z.dead||z.reached||z.D.flying)continue;
      const d=dist(z.x,z.y,a.x,a.y);
      if(d<bd){bd=d;target=z;}
    }
    if(target){
      a.face=target.x>=a.x?1:-1;
      if(a.atkCD<=0){
        applyDamage(target,a.dmg,'phys',{armorPen:.25,owner:a.owner});
        if(!target.dead&&a.stun){stunZ(target,a.stun);FX.stunSparks(target.x,target.y,3);}
        a.hp-=Math.round((target.D.boss?45:18)*(1-(a.armor||0)));
        a.atkCD=0.55;
        a.biteT=1.0;
        FX.spark(target.x,target.y-6,'#4ade80',4);
      }
    } else {
      a.dist=Math.max(10,a.dist-a.speed*h);
      pathPos(a.dist,_pp);
      a.x=_pp.x; a.y=_pp.y;
      a.walkT=(a.walkT||0)+h*15;
      if(Math.abs(_pp.dx)>.1)a.face=_pp.dx>0?-1:1;
      if(Math.random()<h*8){
        FX.footprint(a.x,a.y,'#57412a','#9c8b70');
        FX.part(a.x-a.face*4,a.y-4,rand(-10,10),rand(-16,-4),rand(.18,.32),'#4ade80',2,0);
      }
    }
  }
  // portais táticos ativos na pista
  for(let i=portals.length-1;i>=0;i--){
    portals[i].life-=h;
    if(portals[i].life<=0){portals.splice(i,1);}
  }
  // bombas do bombardeio
  for(const b of bombs){
    if(b.wait>0){b.wait-=h;continue;}
    b.fall+=h;
    if(b.fall>=.55){b.done=true;explode(b.x,b.y,48,230,'expl',{armorPen:.3});}
  }
  pruneArr(bombs,b=>!b.done);
  for(const a of areas)a.life-=h; pruneArr(areas,a=>a.life>0);
  // nuvens
  for(const hz of hazards){
    hz.life-=h;
    if(hz.kind==='zt'){ for(const t of towers)if(dist(t.x,t.y,hz.x,hz.y)<hz.r)t.weak=Math.max(t.weak,.4); }
    else { for(const z of zombies){ if(z.dead||z.reached)continue; if(dist(z.x,z.y,hz.x,hz.y)<hz.r+z.r)applyDamage(z,hz.dps*h,'poison'); } }
    if(Math.random()<h*12){const a=rand(0,6.28),d=Math.sqrt(Math.random())*hz.r;FX.part(hz.x+Math.cos(a)*d,hz.y+Math.sin(a)*d*.6,0,-18,.9,hz.kind==='zt'?'#8fd24a':'#6fe03a',rand(2,4),0);}
  }
  pruneArr(hazards,hz=>hz.life>0);
}
function updateFX(h){
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];p.life-=h;p.x+=p.vx*h;p.y+=p.vy*h;p.vy+=p.g*h;
    if(p.life<=0){if(_partPool.length<900)_partPool.push(p);parts[i]=parts[parts.length-1];parts.pop();}
  }
  for(const p of popups){p.life-=h;p.y-=26*h;} pruneArr(popups,p=>p.life>0);
  for(let i=rings.length-1;i>=0;i--){
    const r=rings[i];r.life-=h;
    if(r.life<=0){if(_ringPool.length<120)_ringPool.push(r);rings[i]=rings[rings.length-1];rings.pop();}
  }
  for(const b of bolts)b.life-=h; pruneArr(bolts,b=>b.life>0);
  if(COOP.pings&&COOP.pings.length){
    for(const pg of COOP.pings)pg.life-=h;
    pruneArr(COOP.pings,pg=>pg.life>0);
  }
}
/* ---- v19: núcleo determinístico (pronto para servidor autoritativo / replay) ----
   Regra de ouro: tudo que afeta o resultado do jogo usa srand() e só muda via dispatch().
   Efeitos visuais usam Math.random() à vontade, pois não entram na simulação. */
let _s=1,TID=0;const CMDLOG=[];
function seedRng(n){_s=(n>>>0)||1;}
function srand(){_s=(_s+0x6D2B79F5)|0;let t=Math.imul(_s^(_s>>>15),1|_s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;}
const towerById=id=>towers.find(t=>t.id===id);
const CMDS={
  place:c=>placeTower(c.key,c.x,c.y,c.playerSlot,c.remote,c.tid),
  up:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Ação negada: Você só pode aprimorar as suas próprias torres!','bad');
        return false;
      }
    }
    return upgradeTower(t,c.i||0,c.path|0,c.remote);
  },
  paragon:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Ação negada: Você só pode ascender as suas próprias torres!','bad');
        return false;
      }
    }
    return makeParagon(t,c.remote);
  },
  ability:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Ação negada: Você só pode ativar habilidades das suas próprias torres!','bad');
        return false;
      }
    }
    return activateTowerAbility(t,c.remote);
  },
  sell:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Ação negada: Você só pode vender as suas próprias torres!','bad');
        return false;
      }
    }
    sellTower(t,c.remote);
    return true;
  },
  prio:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Apenas o comandante dono pode alterar a prioridade desta torre!','bad');
        return false;
      }
    }
    t.priority=c.k;
    return true;
  },
  aim:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Apenas o comandante dono pode definir a mira desta torre!','bad');
        return false;
      }
    }
    return setTowerAim(t,c.x,c.y);
  },
  portal_exit:c=>{
    const t=towerById(c.id);
    if(!t)return false;
    if(COOP.active&&COOP.isMultiplayer&&!c.remote){
      if((t.ownerSlot??0)!==(COOP.mySlot??0)){
        toast('Apenas o comandante dono pode definir a saída deste portal!','bad');
        return false;
      }
    }
    return setPortalExit(t,c.x,c.y);
  },
  clearObs:c=>clearObstacle(c.id,c.remote),
  donate:c=>donateCoopCoins(c.toSlot|0,+c.pct,c.remote,c.fromSlot,c.amount),
  callin:c=>triggerCommanderCallin(c.callin,c.remote),
  wave:()=>WM.send(),
  power:c=>{
    // Aliado usou um poder: aplica só o EFEITO (quem paga é quem comprou).
    if(c.remote){if(c.key==='supply')return true;return Powers.activate(c.key);}
    Powers.lastOk=false;Powers.click(c.key);return Powers.lastOk;
  },
  auto:c=>setAuto(!!c.on)
};
function dispatch(c){
  const f=CMDS[c.type];if(!f)return;
  SecurityGuard.verifyVault();
  CMDLOG.push(Object.assign({tick:G.tick},c));
  const res=f(c);
  SecurityGuard.syncVault();
  // Co-op online: só transmite ao aliado o que realmente deu certo localmente
  // (antes, uma construção sem saldo/posição inválida era enviada e o aliado a recebia de graça).
  // 'donate' trafega por canal próprio (coop_donate) com validação de saldo no servidor.
  if(COOP.active && COOP.isMultiplayer && !c.remote && c.type!=='donate' && res!==false && res!==null && window.QZ_NET_MP && typeof window.QZ_NET_MP.broadcastCommand === 'function'){
    const pkt=Object.assign({}, c, { playerSlot: COOP.mySlot || 0 });
    if(c.type==='place'&&res&&typeof res==='object')pkt.tid=res.id;
    window.QZ_NET_MP.broadcastCommand(pkt);
  }
  return res;
}
function stateHash(){let h=2166136261;const mix=v=>{h^=Math.round(v*1000)|0;h=Math.imul(h,16777619)>>>0;};
  mix(G.life);mix(G.money);mix(powerState.supply.uses);mix(WM.num);mix(G.kills);mix(G.tick);
  for(const t of towers){mix(t.id);mix(t.x);mix(t.y);mix(t.tier);mix(t.spent);}
  for(const z of zombies){mix(z.dist);mix(z.hp);}
  return h>>>0;}
const _wmSend=WM.send;
WM.send=function(){const n0=this.num;const r=_wmSend.apply(this,arguments);
  if(this.num>n0&&!G.replay){saveGame();if(window.steamBridge)window.steamBridge.presence('Onda '+this.num);}
  if(this.num>n0&&!G.replay){
    const n=this.num,boss=n%10===0&&n>=10;
    if(boss){
      Snd.play('alarm');
      G.shake=Math.max(G.shake,6);
      G.flash=0.35;
      G.flashCol='rgba(239, 68, 68, 0.35)';
    }
    let sub='';try{sub=describeWave(n);}catch(e){}
    G.banner={t:3.2,max:3.2,title:boss?'⚠ ONDA '+n+' — CHEFE':'ONDA '+n,sub:sub.length>78?sub.slice(0,75)+'…':sub,boss};
  }
  return r;};
function drawBanner(dt){const b=G.banner;if(!b||b.t<=0)return;if(!G.paused)b.t-=dt;
  const a=Math.max(0,Math.min(1,b.t*3,(b.max-b.t)*5));ctx.save();ctx.globalAlpha=a;ctx.textAlign='center';
  const y=130+(1-a)*-10,bx=-VIEW.padX,bw=W+VIEW.padX*2;ctx.fillStyle='rgba(5,8,16,.65)';ctx.fillRect(bx,y-42,bw,92);
  ctx.fillStyle=b.boss?'#ef4444':'#10b981';ctx.fillRect(bx,y-42,bw,2);ctx.fillRect(bx,y+48,bw,2);
  if(b.boss){
    const off=(G.simT*45)%24;
    ctx.save();ctx.beginPath();ctx.rect(bx,y-44,bw,5);ctx.rect(bx,y+47,bw,5);ctx.clip();
    for(let sx=bx-24;sx<bx+bw+24;sx+=24){
      ctx.fillStyle='#ef4444';
      ctx.beginPath();ctx.moveTo(sx+off,y-44);ctx.lineTo(sx+12+off,y-44);ctx.lineTo(sx+off,y-39);ctx.lineTo(sx-12+off,y-39);ctx.fill();
      ctx.beginPath();ctx.moveTo(sx+off,y+47);ctx.lineTo(sx+12+off,y+47);ctx.lineTo(sx+off,y+52);ctx.lineTo(sx-12+off,y+52);ctx.fill();
    }
    ctx.restore();
  }
  ctx.shadowColor=b.boss?'#ef4444':'#10b981';ctx.shadowBlur=IS_MOBILE?0:18;ctx.fillStyle='#fff';ctx.font='bold 34px "Segoe UI",sans-serif';ctx.fillText(b.title,W/2,y+2);
  ctx.shadowBlur=0;ctx.font='14px "Segoe UI",sans-serif';ctx.fillStyle=b.boss?'#fca5a5':'#d1fae5';ctx.fillText(b.sub||'',W/2,y+30);ctx.restore();}
function drawBossBar(){
  if(G.mode!=='play'||G.replay)return;
  const boss=zombies.find(z=>!z.dead&&!z.reached&&z.D.boss);
  if(!boss)return;
  ctx.save();
  const bw=Math.min(380,W-140);
  const bx=Math.round((W-bw)/2);
  const by=22;
  const bh=12;
  const f=Math.max(0,Math.min(1,boss.hp/boss.max));
  const isNemesis=!!boss.D.nemesis;
  ctx.fillStyle='rgba(15,23,42,.92)';
  ctx.fillRect(bx-4,by-16,bw+8,bh+22);
  ctx.strokeStyle=isNemesis?'#e879f9':'#ef4444';
  ctx.lineWidth=1.5;
  ctx.strokeRect(bx-4,by-16,bw+8,bh+22);
  ctx.fillStyle='rgba(40,10,18,.9)';
  ctx.fillRect(bx,by,bw,bh);
  const grd=ctx.createLinearGradient(bx,by,bx+bw,by);
  if(isNemesis){grd.addColorStop(0,'#a855f7');grd.addColorStop(1,'#f472b6');}
  else{grd.addColorStop(0,'#ef4444');grd.addColorStop(.5,'#f59e0b');grd.addColorStop(1,'#10b981');}
  ctx.fillStyle=grd;
  ctx.fillRect(bx,by,Math.round(bw*f),bh);
  if(f>0){ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(bx,by,Math.round(bw*f),2);}
  ctx.font='bold 11px "Segoe UI",sans-serif';ctx.fillStyle='#ffffff';
  ctx.textAlign='left';ctx.fillText('🚨 '+(boss.D.name||'CHEFE').toUpperCase(),bx,by-4);
  ctx.textAlign='right';ctx.fillText(Math.ceil(boss.hp)+' / '+Math.ceil(boss.max)+' ('+Math.round(f*100)+'%)',bx+bw,by-4);
  ctx.restore();
}
// conquistas (locais; depois ligam às conquistas da Steam / ao perfil do servidor)
/* ===== v19.3: estatísticas permanentes + 50 conquistas (10 secretas) com assinatura digital ===== */
function computeLocalSig(ns,rawStr){
  if(window.QZ_SECURITY&&typeof window.QZ_SECURITY.computeDigitalSignature==='function'){
    return window.QZ_SECURITY.computeDigitalSignature(ns,String(rawStr||''));
  }
  const msg=`QZ_V19_LOCAL_SIG|${ns}|${String(rawStr||'')}`;
  let h1=0x811c9dc5>>>0,h2=5381>>>0;
  for(let i=0;i<msg.length;i++){
    const c=msg.charCodeAt(i);
    h1^=c;h1=Math.imul(h1,0x01000193)>>>0;
    h2=((Math.imul(h2,33)>>>0)^c)>>>0;
  }
  return 'qzsig_'+h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}
const PS_KEY='ztd_v19_stats';let PS={};
try{
  const rawPs=localStorage.getItem(PS_KEY);
  const sigPs=localStorage.getItem(PS_KEY+'_sig');
  if(rawPs){
    if(sigPs&&sigPs!==computeLocalSig('stats',rawPs)){PS={};}
    else{PS=JSON.parse(rawPs)||{};}
  }
}catch(e){PS={};}
PS.maps=PS.maps||{};
function psAdd(k,n){if(G.replay)return;PS[k]=(PS[k]||0)+(n===undefined?1:n);PS.dirty=true;}
function psSave(){if(!PS.dirty)return;PS.dirty=false;try{const c=Object.assign({},PS);delete c.dirty;const js=JSON.stringify(c);localStorage.setItem(PS_KEY,js);localStorage.setItem(PS_KEY+'_sig',computeLocalSig('stats',js));}catch(e){}}
function psGameStart(){psAdd('games');PS.maps[activeMap]=1;PS.dirty=true;}
function psBest(){if(G.mode!=='play')return;const m=(k,v)=>{if(v>(PS[k]||0)){PS[k]=v;PS.dirty=true;}};
  m('bestWave',WM.num);m('bestKills',G.kills);m('bestTowers',towers.length);m('bestBosses',G.stats.bosses);m('bestMoney',Math.floor(G.money));}
const A=(id,cat,name,desc,test,prog,o)=>Object.assign({id,cat,name,desc,test,prog,secret:false,run:false},o||{});
const NW=(id,n,name)=>A(id,'Sobrevivência',name,'Chegue à onda '+n,()=>(PS.bestWave||0)>=n,()=>[PS.bestWave||0,n]);
const ACH=[
 NW('wave5',5,'Primeiros Passos'),NW('wave10',10,'Sobrevivente'),NW('wave20',20,'Veterano'),NW('wave30',30,'Comandante'),
 NW('wave40',40,'Fim do Apocalipse'),NW('wave60',60,'Além do Limite'),NW('wave80',80,'Imortal'),NW('wave100',100,'Lenda Viva'),
 A('first_blood','Combate','Primeiro Sangue','Elimine seu primeiro zumbi',()=>(PS.kills||0)>=1),
 A('kills100','Combate','Exterminador','100 zumbis em uma única partida',()=>(PS.bestKills||0)>=100,()=>[PS.bestKills||0,100]),
 A('kills1000','Combate','Ceifador','1.000 zumbis em uma única partida',()=>(PS.bestKills||0)>=1000,()=>[PS.bestKills||0,1000]),
 A('career1000','Combate','Caçador','1.000 zumbis eliminados no total',()=>(PS.kills||0)>=1000,()=>[PS.kills||0,1000]),
 A('career5000','Combate','Lenda dos Mortos','5.000 zumbis eliminados no total',()=>(PS.kills||0)>=5000,()=>[PS.kills||0,5000]),
 A('career100000','Combate','Fim da Epidemia','100.000 zumbis eliminados no total',()=>(PS.kills||0)>=100000,()=>[PS.kills||0,100000]),
 A('boss1','Chefes','Caçador de Chefes','Derrote um chefe',()=>(PS.bestBosses||0)>=1),
 A('boss3','Chefes','Matador de Titãs','Derrote 3 chefes em uma partida',()=>(PS.bestBosses||0)>=3,()=>[PS.bestBosses||0,3]),
 A('boss10','Chefes','Flagelo dos Monstros','Derrote 10 chefes no total',()=>(PS.bosses||0)>=10,()=>[PS.bosses||0,10]),
 A('build1','Construção','Primeira Torre','Construa sua primeira torre',()=>(PS.built||0)>=1),
 A('towers10','Construção','Fortaleza','Tenha 10 torres ao mesmo tempo',()=>(PS.bestTowers||0)>=10,()=>[PS.bestTowers||0,10]),
 A('towers25','Construção','Cidade Fortificada','Tenha 25 torres ao mesmo tempo',()=>(PS.bestTowers||0)>=25,()=>[PS.bestTowers||0,25]),
 A('towers40','Construção','Muralha Viva','Tenha 40 torres ao mesmo tempo',()=>(PS.bestTowers||0)>=40,()=>[PS.bestTowers||0,40]),
 A('arsenal','Construção','Arsenal Completo','Use 10 tipos de torre na mesma partida',()=>new Set(towers.map(t=>t.key)).size>=10,null,{run:true}),
 A('allkinds','Construção','Colecionador','Use os 18 tipos de torre na mesma partida',()=>new Set(towers.map(t=>t.key)).size>=18,null,{run:true}),
 A('upgrades100','Maestria','Engenheiro Chefe','Faça 100 melhorias de torre no total',()=>(PS.upgrades||0)>=100,()=>[PS.upgrades||0,100]),
 A('masterpiece','Maestria','Obra-Prima','Leve uma torre ao nível máximo',()=>towers.some(t=>t.tier>=5),null,{run:true}),
 A('paragon1','Maestria','Ascensão','Crie uma torre Ascendida',()=>(PS.paragons||0)>=1),
 A('paragon3','Maestria','Panteão','Crie 3 torres Ascendidas na mesma partida',()=>G.stats.paragons>=3,null,{run:true}),
 A('rich','Economia','Magnata','Acumule 10.000 moedas',()=>(PS.bestMoney||0)>=10000,()=>[PS.bestMoney||0,10000]),
 A('baron','Economia','Barão do Apocalipse','Acumule 50.000 moedas',()=>(PS.bestMoney||0)>=50000,()=>[PS.bestMoney||0,50000]),
 A('supply3','Economia','Suprimentos Garantidos','Use os 3 suprimentos na mesma partida',()=>powerState.supply.uses>=3,null,{run:true}),
 A('flawless15','Desafio','Intocável','Chegue à onda 15 sem nenhum zumbi alcançar a base',()=>WM.num>=15&&G.stats.leaks===0,null,{run:true}),
 A('flawless30','Desafio','Muralha Intacta','Chegue à onda 30 sem nenhum zumbi alcançar a base',()=>WM.num>=30&&G.stats.leaks===0,null,{run:true}),
 A('lowlife','Desafio','No Limite','Passe da onda 15 com 10 de vida ou menos',()=>WM.num>=15&&G.life>0&&G.life<=10,null,{run:true}),
 A('hard20','Desafio','Mestre da Dificuldade','Chegue à onda 20 no Difícil ou no Apocalipse',()=>(activeDifficulty==='hard'||activeDifficulty==='apocalypse')&&WM.num>=20,null,{run:true}),
 A('apoc40','Desafio','Sobrevivente do Apocalipse','Chegue à onda 40 na dificuldade Apocalipse',()=>activeDifficulty==='apocalypse'&&WM.num>=40,null,{run:true}),
 A('win1','Desafio','Vitória!','Vença uma partida',()=>(PS.wins||0)>=1),
 A('maps3','Exploração','Viajante','Jogue em 3 mapas diferentes',()=>Object.keys(PS.maps).length>=3,()=>[Object.keys(PS.maps).length,3]),
 A('maps11','Exploração','Cartógrafo','Jogue em todos os 11 mapas',()=>Object.keys(PS.maps).length>=11,()=>[Object.keys(PS.maps).length,11]),
 A('games10','Exploração','Persistente','Jogue 10 partidas',()=>(PS.games||0)>=10,()=>[PS.games||0,10]),
 A('time60','Exploração','Maratonista','Jogue por 60 minutos no total',()=>(PS.time||0)>=3600,()=>[Math.floor((PS.time||0)/60),60]),
 // ----- secretas -----
 A('ghost','Secretas','Fantasma','Chegue à onda 3 sem nenhuma torre construída',()=>WM.num>=3&&towers.length===0&&G.life>0,null,{secret:true,run:true,hint:'Alguns heróis lutam de mãos vazias…'}),
 A('regret','Secretas','Arrependido','Venda uma torre no nível máximo',()=>(PS.soldMax||0)>=1,null,{secret:true,hint:'Nem tudo que brilha merece ficar.'}),
 A('broke','Secretas','Falido','Passe da onda 10 com menos de 5 moedas',()=>WM.num>=10&&G.money<5,null,{secret:true,run:true,hint:'Gaste tudo. Absolutamente tudo.'}),
 A('turbo','Secretas','Pé no Acelerador','Chegue à onda 15 na velocidade 3x',()=>G.speed===3&&WM.num>=15,null,{secret:true,run:true,hint:'Quem tem pressa, acelera.'}),
 A('owl','Secretas','Coruja','Jogue de madrugada (entre 0h e 5h)',()=>new Date().getHours()<5&&WM.num>=3,null,{secret:true,run:true,hint:'Só os insones conhecem.'}),
 A('curious','Secretas','Curioso','Abra a tela Sobre o jogo',()=>(PS.about||0)>0,null,{secret:true,hint:'Leia as letras miúdas.'}),
 A('perf','Secretas','Engenheiro de Desempenho','Descubra o medidor de FPS',()=>(PS.f3||0)>0,null,{secret:true,hint:'Uma tecla de função guarda um segredo.'}),
 A('fall','Secretas','Todo Herói Cai','Sofra sua primeira derrota',()=>(PS.losses||0)>=1,null,{secret:true,hint:'Acontece com os melhores.'}),
 A('sea','Secretas','Mar de Mortos','Tenha 200 zumbis na tela ao mesmo tempo',()=>zombies.length>=200,null,{secret:true,run:true,hint:'Deixe a horda crescer.'}),
 A('apocwin','Secretas','Lenda Secreta','Vença uma partida na dificuldade Apocalipse',()=>(PS.winApoc||0)>=1,null,{secret:true,hint:'O desafio máximo.'})
];
let ACH_DONE=null;
function achLoad(){
  if(!ACH_DONE){
    try{
      const raw=localStorage.getItem('ztd_v19_ach');
      const sig=localStorage.getItem('ztd_v19_ach_sig');
      if(raw){
        if(sig&&sig!==computeLocalSig('ach',raw)){
          if(typeof SecurityGuard==='object')SecurityGuard.tamperCount++;
          ACH_DONE={};
        }else{
          ACH_DONE=JSON.parse(raw)||{};
        }
      }else{
        ACH_DONE={};
      }
    }catch(e){ACH_DONE={};}
  }
  return ACH_DONE;
}
function checkAch(){if(G.replay)return;psBest();const d=achLoad();let ch=false;
  for(const a of ACH){if(d[a.id])continue;if(a.run&&G.mode!=='play')continue;let ok=false;try{ok=a.test();}catch(e){}
    if(ok){d[a.id]=Date.now();ch=true;(G.newAch=G.newAch||[]).push(a.name);toast('🏆 '+(a.secret?'Conquista secreta: ':'Conquista: ')+a.name,'good');Snd.play('coin');if(window.steamBridge)window.steamBridge.unlock(a.id);}}
  if(ch)try{const js=JSON.stringify(d);localStorage.setItem('ztd_v19_ach',js);localStorage.setItem('ztd_v19_ach_sig',computeLocalSig('ach',js));}catch(e){}
  PS.t=(PS.t||0)+1;if(ch||PS.t%10===0)psSave();}
function renderAch(){const d=achLoad(),fmt=n=>Math.floor(n).toLocaleString('pt-BR');let total=0,html='';
  for(const c of [...new Set(ACH.map(a=>a.cat))]){const list=ACH.filter(a=>a.cat===c),got=list.filter(a=>d[a.id]).length;total+=got;
    html+='<h2 class="ach-cat">'+c.toUpperCase()+' <small>'+got+' / '+list.length+'</small></h2>';
    for(const a of list){const ok=!!d[a.id],hide=a.secret&&!ok;let extra='';
      if(ok)extra='<em>'+new Date(d[a.id]).toLocaleDateString('pt-BR')+'</em>';
      else if(!hide&&a.prog){const [cu,mx]=a.prog();extra='<div class="ach-prog"><i style="width:'+Math.max(0,Math.min(100,Math.round(cu/mx*100)))+'%"></i></div><em>'+fmt(cu)+' / '+fmt(mx)+'</em>';}
      html+='<div class="ach-item'+(ok?' done':'')+(hide?' secret':'')+'"><div class="ach-ico">'+(ok?'🏆':hide?'❓':'🔒')+'</div><div class="ach-info"><b>'+(hide?'Conquista secreta':a.name)+'</b><span>'+(hide?(a.hint||'???'):a.desc)+'</span>'+extra+'</div></div>';}}
  $('achList').innerHTML=html;$('achCount').textContent=total+' / '+ACH.length+' desbloqueadas';$('achTotBar').style.width=Math.round(total/ACH.length*100)+'%';}
const GAME_SAVE_KEY='ztd_v19_save';
function computeSaveSig(obj){
  let h=0x811c9dc5;
  const s=`${obj.map}:${obj.diff}:${obj.seed}:${obj.ticks}:${obj.wave}:${(obj.log&&obj.log.length)||0}`;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return h.toString(16);
}
function saveGame(){if(G.replay||G.mode!=='play')return;
  try{
    const payload={v:1,map:activeMap,diff:activeDifficulty,seed:G.seed,auto0:G.auto0,ticks:G.tick,wave:WM.num,log:CMDLOG};
    payload.sig=computeSaveSig(payload);
    const js=JSON.stringify(payload);
    localStorage.setItem(GAME_SAVE_KEY,js);
    if(window.steamBridge&&window.steamBridge.writeSave)window.steamBridge.writeSave(js);
    OnlineAPI.pushCloudSave(js);
    refreshContinue();
  }catch(e){}
}
function readSave(){
  try{
    let raw=localStorage.getItem(GAME_SAVE_KEY);
    if(!raw&&window.steamBridge&&window.steamBridge.readSave)raw=window.steamBridge.readSave();
    if(!raw)return null;
    const d=JSON.parse(raw);
    if(!d||d.v!==1)return null;
    if(typeof d.map!=='string'||!MAPS[d.map])return null;
    if(!['easy','normal','hard','apocalypse'].includes(d.diff))return null;
    if(!Number.isFinite(d.seed)||!Number.isFinite(d.ticks)||d.ticks<0)return null;
    if(!Number.isFinite(d.wave)||d.wave<0||d.wave>5000)return null;
    if(!Array.isArray(d.log))return null;
    if(d.sig&&d.sig!==computeSaveSig(d)){
      SecurityGuard.tamperCount++;
      return null;
    }
    return d;
  }catch(e){return null;}
}

/* ===== SISTEMA DE SEGURANÇA BLINDADA, COFRE DE MEMÓRIA E ANTI-CHEAT (SECURITY GUARD) ===== */
const CLIENT_TOKEN_KEY='quarentenaz_client_token';
const LICENSE_TOKEN_KEY='quarentenaz_license_token';
const _vKey=((Math.random()*0x7fffffff)|0)^0x5a3c9e17;
const _vault={
  m:0^_vKey,
  l:0^_vKey,
  w:0^_vKey,
  k:0^_vKey,
  active:false
};

const SecurityGuard={
  locked:false,
  tamperCount:0,
  syncVault(){
    _vault.m=(Math.floor(G.money)|0)^_vKey;
    _vault.l=(Math.floor(G.life)|0)^_vKey;
    _vault.w=(Math.floor(WM.num)|0)^_vKey;
    _vault.k=(Math.floor(G.kills)|0)^_vKey;
    _vault.active=true;
  },
  verifyVault(){
    // Ativo em ambiente de navegador real (preserva testes de VM Node em tools/)
    if(!_vault.active||G.replay||typeof window.fetch!=='function')return true;
    const expM=_vault.m^_vKey;
    const expL=_vault.l^_vKey;
    const expW=_vault.w^_vKey;
    const expK=_vault.k^_vKey;
    let tampered=false;
    if((Math.floor(G.money)|0)!==expM){G.money=expM;tampered=true;}
    if((Math.floor(G.life)|0)!==expL){G.life=expL;tampered=true;}
    if((Math.floor(WM.num)|0)!==expW){WM.num=expW;tampered=true;}
    if((Math.floor(G.kills)|0)!==expK){G.kills=expK;tampered=true;}
    if(tampered){
      this.tamperCount++;
      this.syncVault();
    }
    return !tampered;
  },
  deepFreeze(obj){
    if(!obj||typeof obj!=='object'||Object.isFrozen(obj))return obj;
    Object.freeze(obj);
    for(const k of Object.keys(obj)){
      const v=obj[k];
      if(v&&typeof v==='object'&&!Object.isFrozen(v))this.deepFreeze(v);
    }
    return obj;
  },
  lockDefinitions(){
    if(this.locked)return;
    this.locked=true;
    try{
      this.deepFreeze(TOWERS);
      this.deepFreeze(ZOMBIES);
      if(typeof DIFFS==='object')this.deepFreeze(DIFFS);
      if(typeof BALANCE==='object')this.deepFreeze(BALANCE);
      if(typeof ASCENSION_BALANCE==='object')this.deepFreeze(ASCENSION_BALANCE);
      this.deepFreeze(POWERS);
    }catch(e){}
  },
  sanitizeName(raw){
    const s=String(raw||'').replace(/[\u0000-\u001F\u007F<>'"`\\]/g,'').replace(/javascript:/gi,'').trim().slice(0,22);
    return s||'Comandante';
  },
  computeRunSeal(entry){
    const raw=[
      String(entry.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48),
      this.sanitizeName(entry.name),
      Number(entry.wave)|0,
      Number(entry.time)|0,
      Number(entry.kills)|0,
      String(entry.map||'four'),
      String(entry.diff||'normal'),
      'qz_v19_sec_seal_9f4a'
    ].join('|');
    let h1=0x811c9dc5>>>0;
    let h2=5381>>>0;
    for(let i=0;i<raw.length;i++){
      const c=raw.charCodeAt(i);
      h1^=c;
      h1=Math.imul(h1,0x01000193)>>>0;
      h2=((Math.imul(h2,33)>>>0)^c)>>>0;
    }
    return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
  },
  sanitizeRankEntry(r){
    if(!r||typeof r!=='object')return null;
    const wave=Math.max(0,Math.min(5000,Math.floor(Number(r.wave)||0)));
    const time=Math.max(0,Math.min(86400*14,Math.floor(Number(r.time)||0)));
    const kills=Math.max(0,Math.min(5000000,Math.floor(Number(r.kills)||0)));
    const validDiffs=['easy','normal','hard','apocalypse'];
    return {
      id:String(r.id||'run_0').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48),
      isProfile:!!r.isProfile,
      name:this.sanitizeName(r.name),
      wave,
      time,
      kills,
      map:MAPS[r.map]?r.map:'four',
      diff:validDiffs.includes(r.diff)?r.diff:'normal',
      date:Number(r.date)||Date.now()
    };
  },
  computeLocalSig,
  verifyLocalSig(ns,rawStr,sig){
    if(!sig||typeof sig!=='string')return false;
    return computeLocalSig(ns,rawStr)===sig;
  }
};

/* ===== INTEGRAÇÃO BACKEND ONLINE (REST API + CLOUD SAVE + RANKING GLOBAL + DRM STEAM-GRADE) ===== */
const OnlineAPI={
  connected:false,
  token:null,
  licenseToken:null,
  runTicket:null,
  getToken(){
    if(this.token)return this.token;
    try{this.token=localStorage.getItem(CLIENT_TOKEN_KEY)||null;}catch(e){}
    return this.token;
  },
  setToken(tk){
    if(!tk||typeof tk!=='string')return;
    this.token=tk;
    try{localStorage.setItem(CLIENT_TOKEN_KEY,tk);}catch(e){}
    if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.setTokens==='function')window.QZ_CLOUD_DB.setTokens(tk,this.licenseToken);
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setClientToken==='function')window.QZ_NET_MP.setClientToken(tk);
  },
  getLicenseToken(){
    if(this.licenseToken)return this.licenseToken;
    try{this.licenseToken=localStorage.getItem(LICENSE_TOKEN_KEY)||null;}catch(e){}
    return this.licenseToken;
  },
  setLicenseToken(tk){
    if(!tk||typeof tk!=='string')return;
    this.licenseToken=tk;
    try{localStorage.setItem(LICENSE_TOKEN_KEY,tk);}catch(e){}
    if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.setTokens==='function')window.QZ_CLOUD_DB.setTokens(this.token,tk);
  },
  req(path,opts){
    if(typeof window.fetch!=='function')return Promise.resolve(null);
    let srv='';
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.getServerUrl==='function'){
      srv=window.QZ_NET_MP.getServerUrl();
    }
    if(!srv&&typeof location!=='undefined'&&location.protocol==='file:'){
      srv='http://localhost:8080';
    }
    const fullPath=(srv&&!path.startsWith('http'))?(srv.replace(/\/+$/,'')+path):path;
    const hdrs={'Content-Type':'application/json'};
    const tk=this.getToken();
    const ltk=this.getLicenseToken();
    if(tk)hdrs['X-Client-Token']=tk;
    if(ltk)hdrs['X-License-Token']=ltk;
    const mergedOpts=Object.assign({},opts||{},{headers:Object.assign(hdrs,(opts&&opts.headers)||{})});
    return window.fetch(fullPath,mergedOpts).then(r=>r.json().catch(()=>null)).catch(()=>null);
  },
  ensureSession(){
    if(typeof window.fetch!=='function')return Promise.resolve(null);
    return this.req('/api/session').then(res=>{
      if(res&&res.ok&&res.clientToken)this.setToken(res.clientToken);
      return res;
    });
  },
  startRunTicket(map,diff,seed){
    this.runTicket=null;
    if(typeof window.fetch!=='function')return Promise.resolve(null);
    return this.req('/api/run/start',{
      method:'POST',
      body:JSON.stringify({map:map||activeMap,diff:diff||activeDifficulty,seed:seed||G.seed})
    }).then(res=>{
      if(res&&res.ok&&res.runTicket){
        this.runTicket=res.runTicket;
      }
      return res;
    });
  },
  checkLicense(){
    const stEl=$('licenseStatusText');
    if(window.steamBridge&&typeof window.steamBridge.drmStatus==='function'){
      try{
        const st=window.steamBridge.drmStatus();
        if(st&&st.steamOwned&&stEl){
          stEl.textContent='Steam DRM Ativo · Criptografia AES-256';
          return Promise.resolve(st);
        }
      }catch(e){}
    }
    if(typeof window.fetch!=='function')return Promise.resolve(null);
    return this.req('/api/license/status').then(res=>{
      if(!res||!res.ok)return null;
      if(stEl){
        if(res.licensed){
          stEl.textContent='Licença Ativa ('+(res.edition||'STD')+') · '+(res.maskedKey||'Verificada');
        } else {
          stEl.textContent='Proteção Anti-Cheat Ativa · Insira uma chave comercial se possuir';
        }
      }
      return res;
    });
  },
  activateLicense(rawKey){
    const clean=String(rawKey||'').trim().toUpperCase();
    if(!clean){toast('Digite uma chave no formato QZ19-XXXX-XXXX-XXXX-XXXX','bad');return Promise.resolve(null);}
    return this.req('/api/license/activate',{
      method:'POST',
      body:JSON.stringify({key:clean})
    }).then(res=>{
      if(res&&res.ok&&res.licensed){
        if(res.clientToken)this.setToken(res.clientToken);
        if(res.licenseToken)this.setLicenseToken(res.licenseToken);
        const stEl=$('licenseStatusText');
        if(stEl)stEl.textContent='Licença Ativa ('+(res.edition||'STD')+') · '+(res.maskedKey||clean);
        toast('Licença comercial ativada com sucesso!','good');
        Snd.play('up');
      } else {
        toast((res&&res.error)||'Chave de licença inválida.','bad');
        Snd.play('err');
      }
      return res;
    });
  },
  sync(){
    if(typeof window.fetch!=='function')return;
    this.ensureSession().then(()=>{
      this.checkLicense();
      this.req('/api/leaderboard?sort='+(rankSort||'wave')+'&limit=50').then(res=>{
        if(!res||!res.ok||!Array.isArray(res.entries))return;
        this.connected=true;
        const badge=document.querySelector('.status-online');
        if(badge)badge.textContent='🔒 SERVIDOR ONLINE SEGURO';
        try{
          if(localStorage.getItem(RANK_KEY+'_cleared')==='1'&&!res.entries.length)return;
          const local=loadRank();
          const byId=new Map();
          for(const r of local){const sr=SecurityGuard.sanitizeRankEntry(r);if(sr&&sr.id)byId.set(sr.id,sr);}
          for(const r of res.entries){
            const sr=SecurityGuard.sanitizeRankEntry(r);
            if(!sr||!sr.id)continue;
            const cur=byId.get(sr.id);
            if(!cur||(sr.wave||0)>(cur.wave||0)||((sr.wave||0)===(cur.wave||0)&&(sr.kills||0)>(cur.kills||0))){
              byId.set(sr.id,sr);
            }
          }
          const merged=[...byId.values()].slice(0,50);
          saveRank(merged);
          renderRank();
          updateHomeStats();
        }catch(e){}
      });
      const pName=getPlayerName();
      this.req('/api/cloud-save?player='+encodeURIComponent(pName)).then(res=>{
        if(!res||!res.ok||!res.save)return;
        try{
          const s=res.save;
          if(s.career&&s.career.bestWave>(career.bestWave||0)){
            career.bestWave=Math.max(career.bestWave||0,Math.min(5000,s.career.bestWave|0));
            career.totalKills=Math.max(career.totalKills||0,Math.min(50000000,s.career.totalKills|0));
            career.games=Math.max(career.games||0,Math.min(100000,s.career.games|0));
            saveCareer();
          }
          if(s.gameSave&&!localStorage.getItem(GAME_SAVE_KEY)){
            localStorage.setItem(GAME_SAVE_KEY,typeof s.gameSave==='string'?s.gameSave:JSON.stringify(s.gameSave));
            refreshContinue();
          }
          updateHomeStats();
        }catch(e){}
      });
    });
  },
  pushLeaderboard(entry){
    const safe=SecurityGuard.sanitizeRankEntry(entry);
    if(!safe)return;
    const payload=Object.assign({},safe,{
      sig:SecurityGuard.computeRunSeal(safe),
      runTicket:this.runTicket||undefined,
      cmdCount:CMDLOG.length,
      stateHash:typeof stateHash==='function'?stateHash():0
    });
    if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.submitRunToCloud==='function'){
      window.QZ_CLOUD_DB.submitRunToCloud(payload);
    }else{
      this.req('/api/leaderboard',{method:'POST',body:JSON.stringify(payload)});
    }
  },
  renamePlayer(name,id){
    const clean=SecurityGuard.sanitizeName(name);
    this.req('/api/leaderboard/name',{method:'PATCH',body:JSON.stringify({name:clean,id})});
    this.pushCloudSave();
  },
  deleteRank(id){
    if(!id)return;
    this.req('/api/leaderboard/'+encodeURIComponent(id),{method:'DELETE'});
  },
  clearRanks(){
    this.req('/api/leaderboard',{method:'DELETE'});
  },
  pushCloudSave(rawGameSave){
    let gs=rawGameSave;
    if(!gs){try{gs=localStorage.getItem(GAME_SAVE_KEY)||null;}catch(e){gs=null;}}
    const bundle={
      player:getPlayerName(),
      career,
      stats:{bestWave:PS.bestWave||0,kills:PS.kills||0,bestKills:PS.bestKills||0,time:Math.floor(PS.time||0)},
      achievements:achLoad(),
      gameSave:gs
    };
    this.req('/api/cloud-save',{method:'POST',body:JSON.stringify(bundle)}).then(res=>{
      if((!res||!res.ok)&&window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.enqueueOfflineAction==='function'){
        window.QZ_CLOUD_DB.enqueueOfflineAction('cloud_save',bundle);
      }
    });
    if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.flushOfflineQueue==='function'){
      window.QZ_CLOUD_DB.flushOfflineQueue();
    }
  }
};

/* ===== SISTEMA DE RANKING (NOME DO JOGADOR, ONDA MÁXIMA, TEMPO E ZUMBIS MORTOS) ===== */
const RANK_KEY='quarentenaz_rank_v1';
const PLAYER_NAME_KEY='quarentenaz_player_name';
let rankSort='wave';
let lastRecordedRankId=null;

function getPlayerName(){
  try{return SecurityGuard.sanitizeName(localStorage.getItem(PLAYER_NAME_KEY));}catch(e){return 'Comandante';}
}
function setPlayerName(name){
  const clean=SecurityGuard.sanitizeName(name);
  try{localStorage.setItem(PLAYER_NAME_KEY,clean);}catch(e){}
  const list=loadRank();
  if(lastRecordedRankId){
    const item=list.find(r=>r.id===lastRecordedRankId);
    if(item)item.name=clean;
  }
  const prof=list.find(r=>r.isProfile);
  if(prof)prof.name=clean;
  saveRank(list);
  OnlineAPI.renamePlayer(clean,lastRecordedRankId);
  updateHomeStats();
  return clean;
}
function getPatent(wave){
  if(wave>=80)return 'Marechal Imortal';
  if(wave>=60)return 'General do Apocalipse';
  if(wave>=40)return 'Comandante Supremo';
  if(wave>=25)return 'Coronel de Contenção';
  if(wave>=15)return 'Capitão Tático';
  if(wave>=5)return 'Sargento de Defesa';
  return 'Recruta de Perímetro';
}
function loadRank(){
  let list=[];
  let cleared=false;
  try{
    cleared=localStorage.getItem(RANK_KEY+'_cleared')==='1';
    const raw=localStorage.getItem(RANK_KEY)||'[]';
    const sig=localStorage.getItem(RANK_KEY+'_sig');
    if(sig&&sig!==computeLocalSig('rank',raw)){
      SecurityGuard.tamperCount++;
      list=[];
    }else{
      list=JSON.parse(raw);
      if(!Array.isArray(list))list=[];
    }
  }catch(e){list=[];}
  if(cleared&&!list.length)return [];
  const pName=getPlayerName();
  const bw=Math.max(career.bestWave||0,PS.bestWave||0);
  const tk=Math.max(career.totalKills||0,PS.kills||0);
  const tt=Math.max(0,Math.floor(PS.time||0));
  // Garante um registro de perfil principal do jogador mesmo antes de encerrar uma partida
  let prof=list.find(r=>r.isProfile);
  if(!prof&&(bw>0||tk>0||tt>0||!cleared)){
    prof={id:'profile_main',isProfile:true,name:pName,wave:bw,time:tt,kills:tk,map:career.lastMap||'four',diff:career.lastDifficulty||'normal',date:Date.now()};
    list.push(prof);
  } else if(prof){
    prof.name=pName;
    prof.wave=Math.max(prof.wave||0,bw);
    prof.kills=Math.max(prof.kills||0,tk);
    prof.time=Math.max(prof.time||0,tt);
  }
  return list;
}
function saveRank(list){
  try{
    const js=JSON.stringify(list.slice(0,50));
    localStorage.setItem(RANK_KEY,js);
    localStorage.setItem(RANK_KEY+'_sig',computeLocalSig('rank',js));
  }catch(e){}
}
function clearRanks(){
  try{
    localStorage.setItem(RANK_KEY,'[]');
    localStorage.setItem(RANK_KEY+'_sig',computeLocalSig('rank','[]'));
    localStorage.setItem(RANK_KEY+'_cleared','1');
  }catch(e){}
  lastRecordedRankId=null;
  career.bestWave=0;career.totalKills=0;career.games=0;saveCareer();
  PS.bestWave=0;PS.kills=0;PS.bestKills=0;PS.time=0;PS.dirty=true;psSave();
  OnlineAPI.clearRanks();
  renderRank();
  updateHomeStats();
}
function deleteRankEntry(id){
  let list=loadRank().filter(r=>r.id!==id);
  if(id==='profile_main'||!list.length){
    try{localStorage.setItem(RANK_KEY+'_cleared','1');}catch(e){}
    if(id==='profile_main'){career.bestWave=0;career.totalKills=0;PS.bestWave=0;PS.kills=0;PS.bestKills=0;PS.time=0;PS.dirty=true;psSave();saveCareer();}
  }
  saveRank(list);
  OnlineAPI.deleteRank(id);
  renderRank();
  updateHomeStats();
}
function getActiveOperatorAccount(){
  if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.getCurrentAccount==='function'){
    const acct=window.QZ_CLOUD_DB.getCurrentAccount();
    if(acct&&acct.operatorName)return acct;
  }
  return null;
}

function getOperatorAccountLevel(){
  const bw=Math.max(career.bestWave||0,PS.bestWave||0);
  const tk=Math.max(career.totalKills||0,PS.kills||0);
  const games=Math.max(career.games||0,(PS.wins||0)+(PS.losses||0));
  const xp=bw*45+Math.floor(tk*0.6)+games*35;
  return Math.max(1,Math.min(100,1+Math.floor(Math.sqrt(xp/25))));
}

function recordRankEntry(wave,timeSec,kills,mapId,diffId,customMode){
  try{localStorage.removeItem(RANK_KEY+'_cleared');}catch(e){}
  const list=loadRank();
  const acct=getActiveOperatorAccount();
  const pName=acct?acct.operatorName:getPlayerName();
  const id='run_'+Date.now()+'_'+Math.floor(Math.random()*1000);
  lastRecordedRankId=id;
  const runMode=customMode||((COOP&&COOP.active)?'coop':'solo');
  const entry={
    id,
    isProfile:false,
    name:pName,
    avatar:(acct&&acct.avatar)||'🦅',
    commander:career.activeCommander||'vance',
    mode:runMode,
    wave:Math.max(0,wave|0),
    time:Math.max(0,Math.floor(timeSec||0)),
    kills:Math.max(0,kills|0),
    map:mapId||activeMap||'four',
    diff:diffId||activeDifficulty||'normal',
    date:Date.now()
  };
  list.push(entry);
  // Atualiza também o registro consolidado de carreira
  const prof=list.find(r=>r.isProfile);
  if(prof){
    prof.name=pName;
    prof.avatar=entry.avatar;
    prof.mode=runMode;
    prof.wave=Math.max(prof.wave||0,wave|0,career.bestWave||0,PS.bestWave||0);
    prof.kills=Math.max(prof.kills||0,career.totalKills||0,PS.kills||0);
    prof.time=Math.max(prof.time||0,Math.floor(PS.time||0),Math.floor(timeSec||0));
    prof.map=mapId||prof.map;
    prof.diff=diffId||prof.diff;
    prof.date=Date.now();
  }
  saveRank(list);
  OnlineAPI.pushLeaderboard(entry);
  OnlineAPI.pushCloudSave();
}
function sortedRankList(mode){
  const list=loadRank();
  const runs=list.filter(r=>!r.isProfile);
  let pool=runs.length?runs:list;
  const fMode=$('rankFilterMode')?$('rankFilterMode').value:'all';
  const fMap=$('rankFilterMap')?$('rankFilterMap').value:'all';
  const fDiff=$('rankFilterDiff')?$('rankFilterDiff').value:'all';
  if(fMode==='solo'||fMode==='coop'){
    pool=pool.filter(r=>(r.mode||'solo')===fMode);
  }
  if(fMap&&fMap!=='all'&&MAPS[fMap]){
    pool=pool.filter(r=>r.map===fMap);
  }
  if(fDiff&&fDiff!=='all'){
    pool=pool.filter(r=>(r.diff||'normal')===fDiff);
  }
  const s=mode||rankSort||'wave';
  return pool.slice().sort((a,b)=>{
    if(s==='kills')return (b.kills-a.kills)||(b.wave-a.wave)||(b.time-a.time);
    if(s==='time')return (b.time-a.time)||(b.wave-a.wave)||(b.kills-a.kills);
    return (b.wave-a.wave)||(b.kills-a.kills)||(b.time-a.time);
  });
}
function escHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function populateRankMapFilter(){
  const sel=$('rankFilterMap');
  if(!sel||sel.options.length>2)return;
  for(const k of Object.keys(MAPS)){
    const opt=document.createElement('option');
    opt.value=k;
    opt.textContent='🗺 '+(MAPS[k].name||k);
    sel.appendChild(opt);
  }
}
function renderRank(){
  populateRankMapFilter();
  const acct=getActiveOperatorAccount();
  const pName=acct?acct.operatorName:getPlayerName();
  const list=loadRank();
  const bw=Math.max(career.bestWave||0,PS.bestWave||0,...list.map(r=>r.wave||0),0);
  const tk=Math.max(career.totalKills||0,PS.kills||0,...list.map(r=>r.kills||0),0);
  const bestRunKills=Math.max(PS.bestKills||0,...list.filter(r=>!r.isProfile).map(r=>r.kills||0),0);
  const totalTime=Math.max(Math.floor(PS.time||0),...list.map(r=>r.time||0),0);
  const bestRunTime=Math.max(...list.filter(r=>!r.isProfile).map(r=>r.time||0),totalTime,0);

  if($('playerNameInput'))$('playerNameInput').value=pName;
  if($('rankPlayerName'))$('rankPlayerName').textContent=pName;
  if($('rankPlayerPatent'))$('rankPlayerPatent').textContent='Nível '+getOperatorAccountLevel()+' · '+getPatent(bw);
  if($('rankBestWave'))$('rankBestWave').textContent='Onda '+bw;
  if($('rankTotalTime'))$('rankTotalTime').textContent=fmtTime(totalTime);
  if($('rankBestRunTime'))$('rankBestRunTime').textContent='Maior partida: '+fmtTime(bestRunTime);
  if($('rankTotalKills'))$('rankTotalKills').textContent=Math.floor(tk).toLocaleString('pt-BR');
  if($('rankBestRunKills'))$('rankBestRunKills').textContent='Recorde em 1 partida: '+Math.floor(bestRunKills).toLocaleString('pt-BR');

  const rows=sortedRankList(rankSort);
  const pNameLower=(pName||'').toLowerCase();
  const myPosIdx=rows.findIndex(r=>(r.name||'').toLowerCase()===pNameLower);
  if($('rankPlayerPositionBanner')){
    $('rankPlayerPositionBanner').innerHTML=myPosIdx>=0
      ?('🏆 Sua Posição no Placar Filtrado: <b style="color:#34d399">#'+(myPosIdx+1)+'</b> de '+rows.length+' registros ('+escHtml(pName)+')')
      :('🏆 Operador Ativo: <b>'+escHtml(pName)+'</b> · Complete uma operação neste filtro para ranquear');
  }

  const dLab={easy:'Fácil',normal:'Normal',hard:'Difícil',apocalypse:'Apocalipse'};
  let html='';
  if(!rows.length){
    html='<tr><td colspan="8" class="rank-empty">Nenhum registro encontrado para este filtro. Inicie uma operação para registrar sua marca no Top Global!</td></tr>';
  } else {
    rows.slice(0,30).forEach((r,idx)=>{
      const pos=idx+1;
      const medal=pos===1?'🥇 1º':pos===2?'🥈 2º':pos===3?'🥉 3º':pos+'º';
      const mName=(MAPS[r.map]&&MAPS[r.map].name)||'Cidade Abandonada';
      const df=dLab[r.diff]||'Normal';
      const dtStr=r.date?new Date(r.date).toLocaleDateString('pt-BR'):'—';
      const isMe=(r.name||'').toLowerCase()===pNameLower;
      const modeTag=(r.mode==='coop')?'<span class="rk-mode-tag coop">🤝 CO-OP</span>':'<span class="rk-mode-tag solo">SOLO</span>';
      const youTag=isMe?'<span class="rk-you-tag">VOCÊ</span>':'';
      const av=escHtml(r.avatar||(isMe&&acct?acct.avatar:'🎖'));
      const cls=(pos<=3?'rank-row top-'+pos:'rank-row')+(isMe?' rank-row-me':'');
      html+='<tr class="'+cls+'">'
        +'<td class="rk-pos"><b>'+medal+'</b></td>'
        +'<td class="rk-name"><span class="rk-avatar">'+av+'</span><div><b>'+escHtml(r.name||'Comandante')+youTag+'</b><small>'+(r.isProfile?'Registro Geral da Carreira':getPatent(r.wave||0))+'</small></div></td>'
        +'<td class="rk-wave"><b>Onda '+(r.wave||0)+'</b></td>'
        +'<td class="rk-time"><b>'+fmtTime(r.time||0)+'</b></td>'
        +'<td class="rk-kills"><b>'+Math.floor(r.kills||0).toLocaleString('pt-BR')+'</b></td>'
        +'<td class="rk-map"><span>'+escHtml(mName)+'</span><div style="display:flex;gap:4px;margin-top:2px;"><small class="rk-diff diff-'+(r.diff||'normal')+'">'+df+'</small>'+modeTag+'</div></td>'
        +'<td class="rk-date">'+dtStr+'</td>'
        +'<td class="rk-act"><button type="button" class="btn-del-rank" data-id="'+escHtml(r.id)+'" title="Excluir este registro">✕</button></td>'
        +'</tr>';
    });
  }
  if($('rankListBody'))$('rankListBody').innerHTML=html;
}
function updateHomeStats(){
  const d=achLoad(),got=ACH.filter(a=>d[a.id]).length;
  const list=loadRank();
  const acct=getActiveOperatorAccount();
  const pName=acct?acct.operatorName:getPlayerName();
  const av=(acct&&acct.avatar)||'🦅';
  const lv=getOperatorAccountLevel();
  const bw=Math.max(career.bestWave||0,PS.bestWave||0,...list.map(r=>r.wave||0),0);
  const tk=Math.max(career.totalKills||0,PS.kills||0,...list.map(r=>r.kills||0),0);
  const tt=Math.max(Math.floor(PS.time||0),...list.map(r=>r.time||0),0);
  if($('homeStatPlayer'))$('homeStatPlayer').textContent=av+' '+pName;
  if($('homeOperatorLevel'))$('homeOperatorLevel').textContent='Nv.'+lv+' · '+getPatent(bw);
  if($('homeOperatorStatus'))$('homeOperatorStatus').textContent=acct?'🟢 CONTA VERIFICADA':'⚡ OPERADOR LOCAL';
  if($('homeAccountSub'))$('homeAccountSub').textContent=acct?('Logado como '+pName+' (Nv.'+lv+')'):'Entre ou crie sua conta para o Top Global';
  if($('homeStatWave'))$('homeStatWave').textContent='Onda '+bw;
  if($('homeStatKills'))$('homeStatKills').textContent=Math.floor(tk).toLocaleString('pt-BR');
  if($('homeStatTime'))$('homeStatTime').textContent=fmtTime(tt);
  if($('homeStatAch'))$('homeStatAch').textContent=got+' / '+ACH.length;
  if($('homeAchSub'))$('homeAchSub').textContent=got+' de '+ACH.length+' medalhas desbloqueadas';
  const tp=career.techPoints||0;
  if($('homeStatTech'))$('homeStatTech').textContent=tp+' 🔬';
  if($('homeTechSub'))$('homeTechSub').textContent=tp+' biocélulas disponíveis · Upgrades permanentes';
  if($('homeRankSub'))$('homeRankSub').textContent=pName+' · Recorde: Onda '+bw+' · '+Math.floor(tk).toLocaleString('pt-BR')+' mortos';
  if($('homeMiniRankList')){
    const top=sortedRankList('wave').slice(0,3);
    if(!top.length){
      $('homeMiniRankList').innerHTML='<div class="hmr-empty">Sem registros no ranking</div>';
    } else {
      $('homeMiniRankList').innerHTML=top.map((r,i)=>{
        const md=i===0?'🥇':i===1?'🥈':'🥉';
        return '<div class="hmr-row"><span class="hmr-pos">'+md+'</span><b class="hmr-name">'+escHtml(r.name)+'</b><span class="hmr-wave">Onda '+(r.wave||0)+'</span><span class="hmr-kills">☠ '+Math.floor(r.kills||0).toLocaleString('pt-BR')+'</span><span class="hmr-time">⏱ '+fmtTime(r.time||0)+'</span></div>';
      }).join('');
    }
  }
}
function setElementHidden(el,hidden){
  if(!el)return;
  el.classList.toggle('hidden',!!hidden);
  if(!el.style)return;
  if(hidden){
    if(typeof el.style.setProperty==='function'){
      el.style.setProperty('display','none','important');
      el.style.setProperty('visibility','hidden','important');
      el.style.setProperty('opacity','0','important');
      el.style.setProperty('pointer-events','none','important');
    }else{
      el.style.display='none';
      el.style.visibility='hidden';
      el.style.opacity='0';
      el.style.pointerEvents='none';
    }
  }else{
    if(typeof el.style.removeProperty==='function'){
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('opacity');
      el.style.removeProperty('pointer-events');
    }else{
      el.style.display='';
      el.style.visibility='';
      el.style.opacity='';
      el.style.pointerEvents='';
    }
  }
}
function refreshContinue(){
  const d=readSave(),b=$('btnHomeContinue');
  if(b){
    b.classList.toggle('hidden',!d);
    if(d){
      const mName=(MAPS[d.map]&&MAPS[d.map].name)||'Zona de Operação';
      const dLab=({easy:'Fácil',normal:'Normal',hard:'Difícil',apocalypse:'Apocalipse'})[d.diff]||'Normal';
      b.innerHTML='<span class="mb-ico">⏵</span><span class="mb-text"><span class="mb-title">CONTINUAR (ONDA '+d.wave+')</span><small id="continueSub" class="mb-sub">'+mName+' · '+dLab+'</small></span><span class="mb-arrow">→</span>';
    }
  }
  updateHomeStats();
}
function loadSave(){const d=readSave();if(!d)return;Snd.init();document.body.classList.remove('menu-mode');document.body.classList.remove('settings-in-game');
  document.querySelectorAll('.screen').forEach(el=>setElementHidden(el,true));
  activeDifficulty=d.diff;selectMap(d.map);G.auto=d.auto0;$('chkAuto').checked=d.auto0;resetGame(d.seed);G.replay={log:d.log,i:0,target:d.ticks};fitCanvas();}
function stepReplay(){const R=G.replay,t0=performance.now();
  while(performance.now()-t0<22){while(R.i<R.log.length&&R.log[R.i].tick<=G.tick)dispatch(R.log[R.i++]);if(G.tick>=R.target)break;update(STEP);if(G.mode!=='play')break;}
  if(G.tick>=R.target||G.mode!=='play'){while(R.i<R.log.length&&R.log[R.i].tick<=G.tick)dispatch(R.log[R.i++]);G.replay=null;G.paused=true;SecurityGuard.syncVault();toast('Partida carregada. Pressione Espaço para continuar.','good');}}
function updateSupportAuras(){
  let hasSup=false;
  for(let i=0;i<towers.length;i++){if(towers[i].def.role==='support'){hasSup=true;break;}}
  if(!hasSup)return;
  for(const t of towers){t._auraDmg=0;t._auraRate=0;t._auraRange=0;t._auraCamo=false;t._purify=false;}
  for(const sup of towers){
    if(sup.def.role!=='support')continue;
    const s=sup.s,r=s.range;
    if(!s.auraDmg&&!s.auraRate&&!s.auraRange&&!s.auraCamo&&!s.purify)continue;
    const maxD=sup.paragon?.60:.45, maxRt=sup.paragon?.55:.40, maxRg=sup.paragon?.45:.30;
    for(const t of towers){
      if(t===sup)continue;
      if(dist(t.x,t.y,sup.x,sup.y)<=r){
        if(s.auraDmg)t._auraDmg=Math.min(maxD,Math.max(t._auraDmg,s.auraDmg));
        if(s.auraRate)t._auraRate=Math.min(maxRt,Math.max(t._auraRate,s.auraRate));
        if(s.auraRange&&t.key!=='sniper')t._auraRange=Math.min(maxRg,Math.max(t._auraRange,s.auraRange));
        if(s.auraCamo)t._auraCamo=true;
        if(s.purify)t._purify=true;
      }
    }
  }
}
let _coopAiTimer=0;
function updateCoopAiAllies(h){
  if(!COOP.active||G.mode!=='play'||G.paused)return;
  const aiPlayers=(COOP.players||[]).filter(p=>p&&p.isAi);
  if(aiPlayers.length===0)return;

  _coopAiTimer+=h;
  if(_coopAiTimer<3.6)return;
  _coopAiTimer=0;

  for(const p of aiPlayers){
    // 1. Doação inteligente para o jogador se o saldo do jogador estiver baixo
    if(G.money<160&&(p.money||0)>=360&&srand()<0.65){
      const donation=Math.min(Math.floor((p.money||0)*0.35),300);
      if(donation>=50){
        p.money-=donation;
        G.money+=donation;
        SecurityGuard.syncVault();
        FX.popup(W/2,90,'💸 +'+donation+' ● ('+p.name+')','#4ade80',true);
        toast('💸 '+p.name+' doou '+donation+' moedas táticas para você!','good');
        Snd.play('coin');
        renderCoopHud();
        continue;
      }
    }

    // 2. Se tiver dinheiro, decide entre melhorar uma torre existente ou construir uma nova
    const myTowers=towers.filter(t=>(t.ownerSlot||0)===p.slot);
    const canUpgrade=myTowers.filter(t=>t.tier<5&&nextUpgrade(t).length>0);

    if(canUpgrade.length>0&&(srand()<0.52||(p.money||0)>=600)){
      const t=canUpgrade[Math.floor(srand()*canUpgrade.length)];
      const ups=nextUpgrade(t);
      if(ups.length>0){
        const choice=Math.floor(srand()*ups.length);
        const entry=ups[choice];
        const cost=entry.up&&entry.up.cost?entry.up.cost:200;
        if((p.money||0)>=cost){
          p.money-=cost;
          upgradeTower(t,0,entry.path,true);
          FX.popup(t.x,t.y-18,'MELHORIA ['+p.name.slice(0,8)+']','#38bdf8',true);
          continue;
        }
      }
    }

    // 3. Construir torre em posição válida no setor do aliado
    const availableKeys=['gunner','shotgun','flame','sniper','rocket','laser','ice','dartgun'];
    const affordable=availableKeys.filter(k=>TOWERS[k]&&(p.money||0)>=TOWERS[k].cost);
    if(affordable.length>0&&myTowers.length<10){
      const pickKey=affordable[Math.floor(srand()*affordable.length)];
      const d=TOWERS[pickKey];
      let placed=false;
      for(let attempt=0;attempt<16;attempt++){
        let candX,candY;
        if(COOP.division!=='free'&&window.QZ_COOP&&typeof window.QZ_COOP.getPointSectorOwner==='function'){
          candX=Math.round(60+srand()*(W-120));
          candY=Math.round(60+srand()*(H-120));
          const owner=window.QZ_COOP.getPointSectorOwner(candX,candY,W,H,COOP.maxPlayers,COOP.division);
          if(owner!==p.slot)continue;
        }else{
          candX=Math.round(60+srand()*(W-120));
          candY=Math.round(60+srand()*(H-120));
        }
        if(distToPath(candX,candY)<CFG.pathClear)continue;
        if(towers.some(t=>dist(t.x,t.y,candX,candY)<CFG.towerR*2.1))continue;
        if(obstacles.some(ob=>!ob.cleared&&dist(ob.x,ob.y,candX,candY)<ob.r+CFG.towerR))continue;

        p.money-=d.cost;
        COOP._towerSeq=(COOP._towerSeq||0)+1;
        const newTid=((p.slot+1)*100000)+COOP._towerSeq;
        const nt=placeTower(pickKey,candX,candY,p.slot,true,newTid);
        if(nt){
          FX.popup(candX,candY-20,d.name+' ['+p.name.slice(0,8)+']','#4ade80',true);
          toast('🛡 '+p.name+' posicionou '+d.name+' no flanco!','good');
          placed=true;
          break;
        }
      }
      if(placed)renderCoopHud();
    }
  }
}

function update(h){
  SecurityGuard.verifyVault();
  G.tick++;
  G.simT+=h;
  if(callinState.napalm.cd>0)callinState.napalm.cd=Math.max(0,callinState.napalm.cd-h);
  if(callinState.overclock.cd>0)callinState.overclock.cd=Math.max(0,callinState.overclock.cd-h);
  if(callinState.barricade.cd>0)callinState.barricade.cd=Math.max(0,callinState.barricade.cd-h);
  if(callinState.activeOverclock>0)callinState.activeOverclock=Math.max(0,callinState.activeOverclock-h);
  for(let bi=callinState.barricades.length-1;bi>=0;bi--){
    const b=callinState.barricades[bi];
    b.duration-=h;
    for(const z of zombies){
      if(!z.dead&&!z.reached&&Math.hypot(z.x-b.x,z.y-b.y)<65){
        slowZ(z,0.65,0.5);
        applyDamage(z,30*h,'elec');
      }
    }
    if(b.duration<=0)callinState.barricades.splice(bi,1);
  }
  updateCallinUI();
  WM.update(h);
  updateSupportAuras();
  for(const z of zombies)z.update(h);
  for(const t of towers)t.update(h);
  for(const p of projs)p.alive=p.update(h);
  updateMinesBombsHazards(h);
  updateFX(h);
  updateCoopAiAllies(h);
  pruneArr(projs,p=>{if(p.alive)return true;releaseProj(p);return false;});
  pruneArr(zombies,z=>{if(!z.dead&&!z.reached)return true;releaseZombie(z);return false;});
  WM.checkClear();
  SecurityGuard.syncVault();
}

/* ===================== 10. RENDERIZAÇÃO ===================== */
let ctx=null;
function R(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}

const ZCACHE={};
function paintZombieBody(type,D,sw,ar){
  const P=(pts,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();};
  const C=(x,y,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,6.283);ctx.fill();};

  // 1. Pernas e botas: se for voador (D.flying), pernas ficam suspensas/penduradas no ar sem correr!
  if(D.flying){
    const dr=ar*0.8;
    // Perna traseira pendurada/inclinada para trás no ar
    P([[-4.5,-8],[-1,-8],[-3.5+dr,-2],[-7+dr,-2.5]],D.pants);
    P([[-4.5,-8],[-1,-8],[-3.5+dr,-2],[-7+dr,-2.5]],'rgba(0,0,0,.25)');
    P([[-7+dr,-2.5],[-3.5+dr,-2],[-4.5+dr,0.8],[-8+dr,0]],'#14161b');
    // Perna dianteira suspensa e relaxada flutuando
    P([[-0.5,-8],[3.2,-8],[0.5+dr,-1.5],[-3+dr,-2]],D.pants);
    P([[-3+dr,-2],[0.5+dr,-1.5],[-0.5+dr,1.2],[-4+dr,0.5]],'#1c1f26');
  } else {
    // 1. Perna traseira e bota tática sombreada (zumbis terrestres)
    R(-4.5+sw,-8,3.6,7,D.pants);
    R(-4.5+sw,-8,3.6,7,'rgba(0,0,0,.25)');
    R(-5+sw,-2,4.8,2.4,'#14161b');
  }

  // 2. Braço traseiro estendido à frente com garras
  R(1.5,-15.5-ar,7.5,2.8,D.skin);
  R(1.5,-15.5-ar,7.5,2.8,'rgba(0,0,0,.22)');
  R(8.2,-15.5-ar,2.2,1.3,'#6b1414');
  R(8.2,-13.8-ar,2,1.1,'#6b1414');

  // 3. Perna dianteira com rasgo no joelho e bota (apenas terrestres)
  if(!D.flying){
    R(0.5-sw,-8,3.8,7,D.pants);
    R(1.2-sw,-5.2,2.2,1.6,D.skin);
    R(0.2-sw,-2,5,2.5,'#1c1f26');
    R(1.8-sw,-1.2,3,1,'#323844');
  }

  // 4. Tronco anatômico inclinado, jaqueta rasgada, cinto e costelas expostas
  P([[-6,-17],[5,-17.5],[5.5,-7.5],[-5.5,-7.5]],D.cloth);
  R(-6,-17,3,9.5,'rgba(0,0,0,.26)');
  R(-5.5,-17,10.5,1.8,'rgba(255,255,255,.14)');
  R(-5.5,-8.8,11,1.8,'#1b1815');
  R(-0.5,-8.8,2.5,1.8,'#78716c');
  // Ferida necrótica e costelas aparentes no tórax
  R(-1.2,-14.5,4.2,4.4,'#450a0a');
  R(-0.6,-14,3.2,1,'#d6d3d1');
  R(-0.6,-12.2,3.2,1,'#d6d3d1');

  // 5. Pescoço, crânio sombreado, mandíbula aberta com dentes e órbita ocular brilhante
  R(-2.2,-19.5,4.2,3,D.skin);
  P([[-5,-26.5],[4.5,-26.5],[5,-19],[-4.5,-19]],D.skin);
  R(-5,-26.5,3,7.5,'rgba(0,0,0,.22)');
  R(-4,-26.2,8,1.4,'rgba(255,255,255,.16)');
  R(-5,-27,6.5,2,'#1f1916');
  // Mandíbula e dentes
  R(0.2,-20.8,4.6,2.2,'#3b070b');
  R(0.8,-20.8,1.1,1,'#e7e5e4');
  R(2.6,-20.8,1.1,1,'#e7e5e4');
  // Órbita profunda e olho infectado
  R(0.4,-24.2,3.6,2.4,'#14090b');
  R(1.4,-23.8,2,1.6,'#ef4444');
  R(2.1,-23.5,1,1,'#fecaca');

  // 6. Braço dianteiro articulado com ombro rasgado e garras ensanguentadas
  R(-2.5,-15.5+ar,3.8,3.6,D.cloth);
  R(0.5,-13.5+ar,8.2,3,D.skin);
  R(0.5,-13.5+ar,8.2,1,'rgba(255,255,255,.14)');
  R(8,-13.8+ar,2.5,2.8,'#7f1d1d');
  R(9.8,-13.8+ar,1.6,1,'#fca5a5');
  R(9.8,-12.2+ar,1.6,1,'#fca5a5');

  // 7. Especializações visuais exclusivas para cada uma das 21 classes de zumbis
  switch(type){
    case 'common':
      // Sobrevivente infectado com manchas de sangue e gola rasgada
      R(1.2,-15,3,5.5,'rgba(127,29,29,.75)');
      R(-3.5,-17.5,3,2,'#3f2e21');
      break;
    case 'runner':
      // Velocista feral inclinado, faixas esportivas carmesim, garras longas e olhos laranja-fogo
      R(-5,-16,10,2.2,'#dc2626');
      R(-4,-12,8,1.4,'#fca5a5');
      R(1.4,-23.8,2.2,1.6,'#f97316');
      R(9,-14+ar,3.5,1.2,'#991b1b');
      R(9,-12.3+ar,3.2,1.2,'#991b1b');
      R(-8,-22,3,1.5,'#dc2626');
      break;
    case 'camo':
      // Furtivo Ghillie Spec-Ops com poncho folhagem e óculos de visão noturna (NVG) verde-neon
      P([[-8,-18],[6,-18],[7,-7],[-9,-7]],'#293d2e');
      R(-7,-16,4,3,'#3f5e46');R(-2,-13,5,3,'#1e2f23');R(-6,-11,4,3,'#4d7053');
      P([[-6,-27.5],[5.5,-27.5],[5,-21],[-6,-21]],'#2f4535');
      R(0.5,-24.2,4.8,2.4,'#0f172a');
      R(1.5,-23.8,1.6,1.6,'#2be3a1');R(3.5,-23.8,1.4,1.6,'#2be3a1');
      break;
    case 'flyer':{
      // Espectro/Gárgula Alado Flutuante: bate asas amplas suavemente e plana com aura aérea ciano
      const wy=ar*4.8;
      // Asa traseira membranosa
      P([[-3,-16],[-19,-25-wy],[-15,-12-wy*.5],[-9,-9],[-2,-11]],'#1e293b');
      // Asa principal dianteira com nervuras ósseas
      P([[-1,-15],[-16,-28+wy],[-12,-14+wy*.4],[-6,-10],[0,-11]],'#475569');
      P([[-1,-15],[13,-26-wy],[10,-13-wy*.4],[4,-11]],'#334155');
      R(-16,-27+wy,13,1.4,'#94a3b8');
      R(0,-25-wy,12,1.4,'#94a3b8');
      // Visor aerodinâmico luminoso
      R(0.8,-24.2,4.2,2.2,'#38bdf8');
      R(1.6,-23.8,2.4,1,'#e0f2fe');
      break;}
    case 'armored':
      // Tropa de Choque SWAT com capacete balístico pesado, viseira escura, ombreiras e colete de aço
      P([[-6,-28],[6,-28],[6.5,-21],[-5.5,-21]],'#475569');
      R(-5,-27.5,10,1.8,'#94a3b8');
      R(0,-24.5,5.8,2.4,'#0f172a');
      R(2.2,-23.8,2,1.2,'#ef4444');
      R(-6,-17.5,12,9.5,'#64748b');
      R(-5,-16.5,10,2,'#cbd5e1');
      R(-4,-13,8,3.5,'#334155');
      R(-7.5,-17,3.5,5,'#475569');
      break;
    case 'toxic':
      // Bio-Mutante Hazmat com cilindro químico borbulhante nas costas, máscara de gás e pústulas ácidas
      R(-9.5,-17.5,4.5,9.5,'#3f6212');
      R(-8.8,-16,3,6.5,'#a3e635');
      R(-5.5,-17,11,9.5,'rgba(132,204,22,.35)');
      C(-2,-14,2,'#bef264');C(2.5,-10,1.8,'#a3e635');C(-2,-25,2.2,'#bef264');
      R(0.5,-24,4.8,4,'#1a2e05');
      C(2.8,-22.8,1.5,'#84cc16');
      if(((G.simT*4)|0)%2){C(0,-29,2,'#a3e635');C(3,-27.5,1.4,'#ecfccb');}
      break;
    case 'healer':
      // Médico da Peste / Necro-Cirurgião com jaleco branco manchado, cruz vermelha, espelho frontal e bio-injetor
      R(-6,-17.5,12,10.5,'#f1f5f9');
      R(-6,-17.5,3,10.5,'#cbd5e1');
      R(-1,-15.5,2.4,6.5,'#ef4444');
      R(-3.2,-13.3,6.8,2.2,'#ef4444');
      R(-5,-25.5,10,1.8,'#e2e8f0');
      C(3,-24.8,2.2,'#38bdf8');C(3,-24.8,1,'#ffffff');
      R(8,-14.5+ar,4.5,2.2,'#10b981');R(12,-14+ar,2.5,1,'#a7f3d0');
      break;
    case 'explosive':
      // Demolidor Suicida com barril explosivo volátil nas costas, bananas de dinamite no peito e pavio aceso
      R(-10.5,-18,5.5,10,'#991b1b');
      R(-10.5,-14,5.5,2.2,'#f59e0b');
      R(-4.5,-16,2.2,6,'#dc2626');R(-1.5,-16,2.2,6,'#dc2626');R(1.5,-16,2.2,6,'#dc2626');
      R(-5.5,-13.5,11,1.6,'#facc15');
      R(-7.5,-21,2,3,'#d6d3d1');
      C(-7,-22,((G.simT*8)|0)%2?3.2:2,((G.simT*8)|0)%2?'#fef08a':'#f97316');
      break;
    case 'giant':
      // Behemoth Colossal com tronco massivo, ombreira de espinhos, correntes rompidas e presas
      P([[-9,-19.5],[8,-19.5],[7,-7],[-8,-7]],D.cloth);
      P([[-9,-19.5],[-2,-19.5],[-3,-7],[-8,-7]],'rgba(0,0,0,.28)');
      R(-8,-18,15,3,D.skin);
      R(-10,-19,5,5,'#3f3f46');
      P([[-9,-19],[-7,-24],[-5,-19]],'#d4d4d8');
      R(6,-13.5+ar,3,4,'#94a3b8');
      R(3.2,-21.5,1.5,2.2,'#fef3c7');
      break;
    case 'brute':
      // Brutamontes Militar com colete blindado pesado oliva, queixeira de aço e punhos revestidos
      P([[-8.5,-19],[7.5,-19],[7,-7.5],[-8,-7.5]],'#36412d');
      R(-7,-17.5,13,4,'#4d5c40');
      R(-10.5,-16,4.5,8.5,'#3f4d34');
      R(-0.5,-21.5,5.8,3.2,'#52525b');
      R(1,-14+ar,9.5,4.2,D.skin);
      R(8.5,-14.5+ar,3.2,4.8,'#27272a');
      break;
    case 'splitter':
      // Mutante de Fissão Bicefálico com núcleo laranja instável rachando o tórax ao meio e duas cabeças fundidas
      P([[-7.5,-18],[7,-18],[6.5,-7.5],[-7,-7.5]],'#5c3a32');
      P([[-1.5,-18],[1.5,-18],[2.5,-7.5],[-0.5,-7.5]],'#f97316');
      R(-0.5,-17,1.4,9.5,'#fef08a');
      R(-6.5,-27,6.5,6.5,D.skin);
      R(-3.5,-25,2,1.6,'#fb923c');
      R(1.5,-23.8,2,1.6,'#fde047');
      break;
    case 'screamer':
      // Banshee Gritador com camisa de força, cabelos brancos arrepiados, boca escancarada e olhos psíquicos violeta
      R(-5.5,-17,11,9.5,'#e2e8f0');
      R(-5.5,-14.5,11,1.8,'#334155');R(-5.5,-11,11,1.8,'#334155');
      P([[-6,-26],[4,-29],[-2,-25],[5,-27],[-4,-26]],'#f8fafc');
      R(0.2,-21.8,4.6,4.2,'#1e050d');
      R(1.4,-24.2,2.2,1.8,'#c084fc');
      break;
    case 'shielded':
      // Portador de Escudo Balístico com escudo torre de aço reforçado à frente, visor e faixa de alerta
      R(-5,-27,10,3.5,'#475569');
      R(4.5,-22,6,19,'#1e293b');
      R(5.5,-21,4.5,17,'#475569');
      R(6,-18,3.5,2.5,'#0f172a');
      R(6,-17.5,3,1.2,'#38bdf8');
      R(5.5,-12,4.5,2.5,'#f59e0b');
      R(4,-22,1.2,19,'#94a3b8');
      break;
    case 'digger':
      // Minerador Subterrâneo com capacete amarelo, lanterna frontal acesa e picareta de aço em punho
      P([[-5.5,-27.5],[5.5,-27.5],[6.5,-24],[-6,-24]],'#eab308');
      R(-6,-24.5,12.5,1.4,'#ca8a04');
      C(4.8,-25.8,2,'#fef08a');
      R(-5,-16,10,8.5,'#57412d');
      // Picareta na mão dianteira
      R(8.5,-19+ar,1.8,11,'#78350f');
      P([[5,-20+ar],[9.5,-21.5+ar],[14,-18.5+ar],[9.5,-19.5+ar]],'#cbd5e1');
      break;
    case 'parasite':
      // Hospedeiro de Colmeia com casulo alienígena pulsante nas costas e tentáculos carmesim/limão
      C(-5,-15,5.5,'#4d7c0f');
      C(-5.5,-15.5,3.8,'#a3e635');
      C(-6,-16,1.8,'#ecfccb');
      C(-1,-27,3.5,'#65a30d');C(-1,-27.5,2,'#bef264');
      P([[-3,-17],[-10,-23+ar*2],[-8,-19]],'#dc2626');
      P([[0,-17],[6,-25-ar*2],[3,-20]],'#84cc16');
      break;
    case 'regen':
      // Aberração Bio-Regenerativa com cristais/espinhos dorsais esmeralda e núcleo celular pulsante no peito
      P([[-6,-17],[-11,-22],[-7,-13]],'#10b981');
      P([[-5,-13],[-10,-16],[-6,-9]],'#34d399');
      C(0.5,-12.5,3.2,'#059669');
      C(0.5,-12.5,1.8,'#6ee7b7');
      R(-3,-16,1.2,7,'#34d399');R(2,-15,1.2,6,'#34d399');
      R(1.4,-23.8,2.2,1.8,'#2be3a1');
      break;
    case 'jumper':
      // Saltador Ciber-Hidráulico com pernas mecânicas de mola, postura predadora e garras de raptor
      R(-5+sw,-9,4,8,'#64748b');R(0.5-sw,-9,4,8,'#94a3b8');
      R(-5.5+sw,-3,6,2.5,'#38bdf8');R(0-sw,-3,6,2.5,'#38bdf8');
      R(-7.5,-16,3.5,6,'#334155');
      R(1,-24,4.5,2,'#38bdf8');
      P([[9,-14+ar],[14.5,-15+ar],[10,-12+ar]],'#e2e8f0');
      P([[9,-12+ar],[14,-12+ar],[10,-10.5+ar]],'#e2e8f0');
      break;
    case 'commander':
      // General de Guerra Morto-Vivo com sobretudo imperial, ombreiras douradas, quepe de oficial, estandarte e espada
      P([[-7,-18],[6,-18],[7,-6],[-8,-6]],'#31102f');
      R(-7,-18,13,2.5,'#fbbf24');
      R(-2,-16,3,8,'#dc2626');
      // Estandarte de comando nas costas
      R(-7.5,-32,1.6,16,'#94a3b8');
      P([[-6,-31],[2,-29.5],[-6,-27]],'#dc2626');
      // Quepe militar de oficial
      P([[-6,-26.5],[6,-28.5],[5.5,-24.5],[-5.5,-24.5]],'#1e1b2e');
      R(-5,-25,11.5,1.5,'#fbbf24');
      C(1.5,-26.8,1.3,'#ef4444');
      // Lâmina tática energética na mão dianteira
      R(8.5,-14.5+ar,8,2,'#f59e0b');R(9.5,-14+ar,6.5,1,'#fef08a');
      break;
    case 'colossus':
      // Colosso Dreadnought Blindado com placas de titânio, chaminés dorsais e reator de fornalha no tórax
      P([[-9.5,-20],[8.5,-20],[8,-7],[-9,-7]],'#334155');
      R(-8,-18.5,15,10,'#475569');
      R(-9.5,-24,3,6,'#1e293b');R(-5.5,-25,3,7,'#1e293b');
      C(0.5,-13,3.6,'#ea580c');C(0.5,-13,2,'#fde047');
      P([[-6.5,-28],[6.5,-28],[7,-19.5],[-6,-19.5]],'#1e293b');
      R(-5,-27,11,2,'#64748b');
      R(0,-24,6,2.2,'#f97316');R(1.5,-23.6,3.5,1.2,'#fef08a');
      R(2,-14+ar,9.5,4.8,'#334155');
      break;
    case 'boss':
      // ABOMINAÇÃO: Chefe Bio-Horror com coroa de chifres ósseos, espinhos dorsais, núcleo carmesim e braço esmagador
      for(let i=0;i<4;i++)P([[-7+i*3.2,-18],[-5.5+i*3.2,-25-(i%2)*3],[-4+i*3.2,-18]],'#d6d3d1');
      P([[-8.5,-19],[7.5,-19],[7,-7],[-8,-7]],'#3b1329');
      C(0.5,-13,3.8,'#e11d48');C(0.5,-13,2,'#fda4af');
      // Chifres ósseos na cabeça
      P([[-4,-26],[-8,-33],[-1,-26]],'#e7e5e4');
      P([[1,-26],[6,-33],[4,-26]],'#e7e5e4');
      // Múltiplos olhos rubros e bocarra
      R(-2,-24.2,2,1.8,'#ff2a2a');R(1.8,-24.2,2.2,1.8,'#ff2a2a');
      R(1.8,-22,2,1.5,'#fb7185');
      R(-1,-20.2,6,2.5,'#450a0a');
      // Braço mutante esmagador
      R(1,-14.5+ar,10,4.8,'#881337');
      P([[10,-15+ar],[15,-17+ar],[12,-12+ar]],'#fda4af');
      P([[10,-12+ar],[15,-10+ar],[11,-10+ar]],'#fda4af');
      break;
    case 'nemesis':
      // DEVASTADOR: Soberano Apocalíptico com armadura obsidiana/violeta, chifres demoníacos, núcleo do vazio e lâmina de plasma
      P([[-9.5,-20],[8.5,-20],[8,-6.5],[-9,-6.5]],'#1e1035');
      R(-8.5,-19,16,2.2,'#fbbf24');
      // Espinhos dorsais de energia violeta
      for(let i=0;i<4;i++)P([[-7+i*3.4,-19],[-5.5+i*3.4,-27-(i%2)*3],[-4+i*3.4,-19]],'#a855f7');
      // Núcleo do Vazio no tórax
      C(0.5,-13,4.2,'#7e22ce');C(0.5,-13,2.6,'#e879f9');C(0.5,-13,1.2,'#ffffff');
      // Elmo coroado e chifres incandescentes
      P([[-6,-28],[6,-28],[6.5,-19.5],[-5.5,-19.5]],'#0f0720');
      P([[-5,-27],[-10,-35],[-2,-27]],'#f59e0b');
      P([[2,-27],[8,-35],[5,-27]],'#f59e0b');
      R(-2.5,-24.5,2.2,2,'#e879f9');R(1.5,-24.5,2.8,2,'#ff2a55');
      // Canhão/Lâmina de Plasma Apocalíptico no braço dianteiro
      R(1.5,-15+ar,10,4.5,'#3b0764');
      P([[10,-16+ar],[17,-13+ar],[10,-10+ar]],'#c084fc');
      P([[11,-14.5+ar],[15.5,-13+ar],[11,-11.5+ar]],'#ffffff');
      break;
    case 'speedboss':
      // PREDADOR VELOZ: Chefe Ciber-Mutante de Alta Velocidade com propulsores de plasma ciano, barbatanas aerodinâmicas e garras duplas
      P([[-8.5,-19],[7.5,-19],[7,-7],[-8,-7]],'#0f172a');
      R(-7.5,-18,14,3,'#0284c7');
      // Propulsores dorsais de plasma ciano
      R(-11,-18,3.5,8,'#1e293b');
      C(-11,-14,2.8,'#38bdf8');C(-11,-14,1.4,'#ffffff');
      // Barbatanas aerodinâmicas na cabeça e costas
      P([[-5,-27],[-13,-31],[-2,-25]],'#38bdf8');
      P([[0,-27],[-8,-33],[4,-26]],'#7dd3fc');
      // Visor predador néon e garras energéticas longas
      R(0,-24.5,5.5,2.4,'#38bdf8');R(1.2,-24.1,3.5,1.2,'#ffffff');
      P([[9,-15+ar],[17,-16.5+ar],[11,-12.5+ar]],'#38bdf8');
      P([[9,-12.5+ar],[16.5,-11.5+ar],[10.5,-10+ar]],'#bae6fd');
      break;
  }
}
function zombieSprite(z,moving,tm){
  const isFly=!!z.D.flying;
  let ph=0;if(moving||isFly)ph=1+(Math.floor((((tm%12.566)+12.566)%12.566)/12.566*16)%16);
  const k=z.type+'|'+ph+(z.type==='toxic'?'|'+(((G.simT*4)|0)%2):'')+(z.type==='explosive'?'|'+(((G.simT*8)|0)%2):'');
  let c=ZCACHE[k];
  if(!c){c=ZCACHE[k]=document.createElement('canvas');c.width=56;c.height=56;const old=ctx;ctx=c.getContext('2d');ctx.translate(28,44);
    const t2=(moving||isFly)?(ph-1)/16*12.566:0;
    paintZombieBody(z.type,z.D,(!isFly&&moving)?Math.sin(t2)*2.6:0,(moving||isFly)?Math.sin(t2*(isFly?1:.5))*1.1:0);ctx=old;}
  return c;
}
function drawZombie(z){
  const D=z.D,s=D.size,tm=G.simT*(D.flying?5.2:D.anim)+z.phase;
  if(D.boss){
    const pr=.5+.5*Math.sin(G.simT*3.5);
    ctx.fillStyle=D.speedBoss?'rgba(56,189,248,'+(0.16+0.1*pr)+')':D.nemesis?'rgba(168,85,247,'+(0.16+0.1*pr)+')':'rgba(225,29,72,'+(0.15+0.1*pr)+')';
    ctx.beginPath();ctx.ellipse(z.x,z.y+10,38+pr*6,18,0,0,6.283);ctx.fill();
    ctx.strokeStyle=D.speedBoss?'rgba(125,211,252,.65)':D.nemesis?'rgba(232,121,249,.55)':'rgba(251,113,133,.5)';
    ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(z.x,z.y+10,30+pr*4,13,0,0,6.283);ctx.stroke();
  } else if(D.commander){
    ctx.strokeStyle='rgba(251,191,36,.35)';ctx.lineWidth=1.3;
    ctx.beginPath();ctx.ellipse(z.x,z.y+9,20,9,0,0,6.283);ctx.stroke();
  } else if(D.heal){
    ctx.strokeStyle='rgba(43,227,161,.28)';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.ellipse(z.x,z.y+9,16,7,0,0,6.283);ctx.stroke();
  }
  ctx.save(); ctx.translate(Math.round(z.x),Math.round(z.y+10*s));
  const moving=z.cur>0.1;
  if(D.flying){
    // Levitação contínua e suave: sombra menor e distante no chão + ondulação de ar
    const flt=Math.sin(G.simT*3.4+z.phase);
    const hoverH=14+flt*4.2;
    const shScale=0.72-flt*0.12;
    ctx.fillStyle='rgba(0,0,0,.22)';
    ctx.beginPath();ctx.ellipse(0,2,6.5*s*shScale,2.4*s*shScale,0,0,6.283);ctx.fill();
    ctx.strokeStyle='rgba(125,211,252,'+(0.22+0.1*flt)+')';
    ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,2,8.5*s*shScale,3*s*shScale,0,0,6.283);ctx.stroke();
    ctx.scale(z.face*s,s);
    ctx.translate(0,-hoverH);
    // Inclinação suave de voo planado
    ctx.rotate(0.14+Math.cos(G.simT*3.4+z.phase)*0.05);
  } else {
    ctx.fillStyle='rgba(0,0,0,.36)';ctx.beginPath();ctx.ellipse(0,0,7.5*s,3*s,0,0,6.283);ctx.fill();
    ctx.scale(z.face*s,s);
    const bob=moving?Math.abs(Math.sin(tm))*1.6:0;
    ctx.translate(0,-bob);
  }
  ctx.drawImage(zombieSprite(z,moving,tm),-28,-44);
  // Feedback visual estilo Bloons: congelamento, lentidão, vulnerabilidade, choque/stun, veneno, queimadura e piscada de dano
  if(z.freezeT>0){
    R(-8,-28,16,28,'rgba(125,211,252,.58)');R(-8,-28,16,1.8,'#ffffff');
    R(-6,-12,12,2,'#bae6fd');
  } else if(z.slowT>0){
    R(-7,-27,14,27,'rgba(56,189,248,.30)');
  }
  if(z.stunT>0){
    R(-7,-27,14,27,'rgba(250,204,21,.28)');
    const sa=G.simT*9;
    R(Math.cos(sa)*6-1.5,-31+Math.sin(sa)*2,3,3,'#fde047');
    R(Math.cos(sa+3.14)*6-1.5,-31+Math.sin(sa+3.14)*2,3,3,'#38bdf8');
  }
  if(z.vulnT>0)R(-7,-27,14,27,'rgba(192,132,252,.26)');
  if(z.flash>0)R(-7,-27,14,27,z.flashType==='elec'?'rgba(186,230,253,.72)':z.flashType==='poison'?'rgba(190,242,100,.65)':'rgba(255,255,255,.65)');
  if(z.burnT>0){const f=(((G.simT*10)|0)+z.id)%3;R(-3,-29-f,3,4.5,'#f97316');R(1,-28-(2-f),2.5,3.5,'#fde047');}
  if(z.poisonT>0){R(-5,-28+(((G.simT*6)|0)%2),2.8,2.8,'#a3e635');R(2,-26+(((G.simT*5)|0)%2),2.2,2.2,'#bef264');}
  ctx.restore();
  // Indicadores táticos e barra de vida
  const flyOff=D.flying?12:0;
  if(z.D.camo){ctx.fillStyle='rgba(43,227,161,.85)';ctx.fillRect(z.x-8,z.y-36-flyOff,16,2);}
  if(z.D.flying){ctx.fillStyle='rgba(125,211,252,.85)';ctx.fillRect(z.x-8,z.y-39-flyOff,16,2);}
  if(z.hp<z.max||D.big){
    const bw=D.boss?66:Math.round(16+s*7),bx=Math.round(z.x-bw/2),by=Math.round(z.y-14*s-10-flyOff-(D.boss?6:0)),bh=D.boss?7:4,f=Math.max(0,z.hp/z.max);
    R(bx-1,by-1,bw+2,bh+2,'#050811');R(bx,by,bw,bh,'#3b0a0e');
    R(bx,by,Math.round(bw*f),bh,f>.5?'#2be3a1':f>.25?'#f59e0b':'#ef4444');
    if(f>0)R(bx,by,Math.round(bw*f),1,'rgba(255,255,255,.28)');
    if(D.boss){
      ctx.fillStyle=D.speedBoss?'#38bdf8':D.nemesis?'#e879f9':'#fda4af';
      ctx.font='bold 11px "Segoe UI",sans-serif';ctx.textAlign='center';
      ctx.fillText('☠ '+D.name,z.x,by-4);ctx.textAlign='left';
    }
  }
}

// Desenha uma torre em (x,y). Usado no jogo, na prévia e nos ícones.
const BASE_CACHE={};
const TOWER_ACCENT={
  gunner:'#84cc16',sniper:'#38bdf8',mortar:'#f59e0b',flame:'#f97316',tesla:'#38bdf8',
  ice:'#7dd3fc',poison:'#a3e635',antitank:'#fbbf24',archer:'#fbbf24',boomerang:'#2dd4bf',
  engineer:'#f59e0b',radar:'#38bdf8',shotgun:'#fb923c',drone:'#7dd3fc',demolition:'#ef4444',
  railgun:'#a855f7',medstation:'#10b981',acid:'#bef264',
  beacon:'#fbbf24',supplydepot:'#f59e0b',cryogen:'#c084fc',nanomed:'#2be3a1',
  dartgun:'#38bdf8',dino:'#f97316',minefactory:'#fbbf24',portal:'#c084fc'
};
const PATH_SKIN_ACCENT=['#f97316','#38bdf8','#a855f7'];
function drawTowerSprite(key,x,y,ang,rec,lvl,spec,tm,tw,pathIdx,tier){
  ctx.save(); ctx.translate(Math.round(x),Math.round(y));
  const poly=(pts,fill,stroke,lw)=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||.9;ctx.stroke();}};
  const circ=(cx,cy,r,fill,stroke,lw)=>{ctx.beginPath();ctx.arc(cx,cy,r,0,6.283);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke();}};
  const flash=(fx,fy,c1,c2)=>{if(rec>0.22){const fr=(rec-0.2)*5.2;poly([[fx,fy-2.4*fr],[fx+7.2*fr,fy],[fx,fy+2.4*fr]],c1||'#fb923c');circ(fx+1.5,fy,1.9*fr,c2||'#fef08a');}};
  const pCol=(pathIdx>=0&&PATH_SKIN_ACCENT[pathIdx])?PATH_SKIN_ACCENT[pathIdx]:null;
  const ac=(tier>=2&&pCol)?pCol:(TOWER_ACCENT[key]||'#38bdf8');
  const band=spec>=0?SPEC_COL[spec]:(pCol||LVL_COL[Math.min(3,(lvl||1)-1)]);
  const isSup=SUPPORT_ORDER.includes(key)||key==='medstation';
  const _bk=lvl+'|'+spec+'|'+ac+'|'+(isSup?1:0)+'|'+(tier||0);
  let _bc=BASE_CACHE[_bk];
  if(!_bc){
    _bc=BASE_CACHE[_bk]=document.createElement('canvas');_bc.width=54;_bc.height=48;
    const _old=ctx;ctx=_bc.getContext('2d');ctx.translate(27,21);
    // Sombra projetada suave no solo
    ctx.fillStyle='rgba(0,0,0,.52)';ctx.beginPath();ctx.ellipse(0,9.5,20,9,0,0,6.283);ctx.fill();
    // Sapatas hidráulicas de ancoragem nos 4 cantos com LED de status
    for(const [sx,sy] of [[-13.5,-6],[13.5,-6],[-14.5,7.2],[14.5,7.2]]){
      poly([[sx-3.4,sy-2.2],[sx+3.4,sy-2.2],[sx+4.2,sy+3.2],[sx-4.2,sy+3.2]],'#1e293b','#060911',.9);
      R(sx-2.2,sy-1.4,4.4,1.2,'#475569');
      R(sx-1.1,sy+.2,2.2,1.8,ac);
    }
    // Plataforma octogonal blindada 2.5D (chanfro inferior profundo + topo metálico escovado)
    poly([[-16.5,2],[-11.5,-5.5],[11.5,-5.5],[16.5,2],[16.5,10.5],[11.5,15.5],[-11.5,15.5],[-16.5,10.5]],'#090e1a','#04070d',1.1);
    const baseGrd=ctx.createLinearGradient(-15,-6,15,12);
    baseGrd.addColorStop(0,isSup?'#24465c':'#3b4b61');
    baseGrd.addColorStop(.5,isSup?'#122b3d':'#1e293b');
    baseGrd.addColorStop(1,'#0b1120');
    poly([[-15.2,1],[-10.4,-6.2],[10.4,-6.2],[15.2,1],[10.4,9.4],[-10.4,9.4]],baseGrd,'#64748b',.95);
    // Reflexo especular superior no chanfro frontal
    ctx.strokeStyle='rgba(226,232,240,.38)';ctx.lineWidth=.9;
    ctx.beginPath();ctx.moveTo(-10,-5.6);ctx.lineTo(10,-5.6);ctx.stroke();
    // Anel giratório rebaixado + trilho de rolamento e aro neon de energia
    ctx.beginPath();ctx.ellipse(0,1,11.4,7.8,0,0,6.283);ctx.fillStyle='#070b14';ctx.fill();
    ctx.strokeStyle=ac;ctx.lineWidth=1.4;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,1,8.8,5.8,0,0,6.283);ctx.strokeStyle='rgba(148,163,184,.32)';ctx.lineWidth=.8;ctx.stroke();
    // Chevrons luminosos de nível na face frontal do pedestal
    for(let i=0;i<lvl;i++){
      const lx=-9+i*5.5;
      R(lx,11.8,4.2,3.2,'#060911');
      R(lx+.6,12.3,3,2.2,i===3&&spec>=0?SPEC_COL[spec]:ac);
    }
    ctx=_old;
  }
  ctx.drawImage(_bc,-27,-21);
  ctx.translate(0,-3);

  // Escudos laterais e acessórios tecnológicos conforme o nível/tier da torre (evolução visual de skin)
  const tr=tier||0;
  if(lvl>=2||tr>=1){
    poly([[-16.5,-2],[-12,-6.5],[-11,4.5],[-15.5,6.5]],'#334155','#0f172a',.85);
    poly([[16.5,-2],[12,-6.5],[11,4.5],[15.5,6.5]],'#334155','#0f172a',.85);
    R(-14.2,-1.2,1.6,4.4,ac);R(12.6,-1.2,1.6,4.4,ac);
  }
  if(tr>=2){
    // Placas de blindagem reativa pesada nos flancos
    poly([[-18.5,0],[-14,-5.5],[-13,5.5],[-17.5,8.5]],'#1e293b',ac,.9);
    poly([[18.5,0],[14,-5.5],[13,5.5],[17.5,8.5]],'#1e293b',ac,.9);
  }
  if(tr>=3){
    // Estabilizadores tecnológicos e condutores de energia do caminho dominante
    R(-16.5,-8.5,4.4,3.2,ac);R(12.1,-8.5,4.4,3.2,ac);
    circ(-14.2,6.2,2,ac,'#090d16',.7);circ(14.2,6.2,2,ac,'#090d16',.7);
  }
  if(lvl>=4||tr>=4){
    ctx.strokeStyle=ac;ctx.lineWidth=1.5;ctx.globalAlpha=.85;
    ctx.beginPath();ctx.arc(0,1,17.8,0,6.283);ctx.stroke();ctx.globalAlpha=1;
    // Módulos capacitores traseiros de alta potência (Tier 4+)
    R(-12.5,-11.5,4.4,4.4,'#0f172a');R(-11.3,-10.3,2.2,2.2,ac);
    R(8.1,-11.5,4.4,4.4,'#0f172a');R(9.3,-10.3,2.2,2.2,ac);
  }

  const rot=(fn)=>{ctx.save();ctx.rotate(ang);fn();ctx.restore();};
  const rc=rec*3.2;

  switch(key){
    case 'gunner':{
      // Cúpula blindada + tambor de munição em latão + metralhadora rotativa dupla/tripla com camisa ventilada
      circ(0,0,8.8,'#374733','#11170f',1.1);
      circ(0,-1,6.4,'#53664d','#243020',.8);
      rot(()=>{
        const L=13.5+lvl*2;
        // Caixa de munição lateral blindada + fita de cartuchos dourados
        R(-5.5,-8.8,7.5,4.4,'#5c451d');R(-4.5,-7.8,5.5,2.2,'#facc15');
        for(let i=0;i<3;i++)R(-4+i*1.8,-5,1.2,2.2,'#eab308');
        // Canos gêmeos / Gatling com camisa térmica perfurada e trilho especular
        R(2-rc,-4.3,L,2.7,'#1e293b');R(2-rc,1.6,L,2.7,'#1e293b');
        R(2-rc,-3.9,L,0.9,'#64748b');R(2-rc,2.0,L,0.9,'#64748b');
        R(3-rc,-3.1,L-4,6.2,'#334155');
        for(let i=0;i<3;i++)R(4.8-rc+i*3.2,-2.1,1.7,4.2,'#0f172a');
        if(lvl>=3||tr>=3)R(2-rc,-1.1,L+2.2,2.2,'#94a3b8');
        // Quebra-chamas duplo chanfrado
        R(2-rc+L,-4.7,3.2,3.4,'#64748b');R(2-rc+L,1.3,3.2,3.4,'#64748b');
        flash(5-rc+L,0,'#fb923c','#fef08a');
        // Escudo frontal angulado da torreta + visor tático
        poly([[-6.5,-5.5],[3.5,-6.5],[5.5,0],[3.5,6.5],[-6.5,5.5]],'#4a5c44','#162014',1);
        poly([[-4.8,-4],[2,-4.5],[3.5,0],[2,4.5],[-4.8,4]],'#62785b');
        R(-4.2,-2,5.2,4,band);R(-3.2,-1,3.2,1.4,'#ffffff');
      });
      break;}
    case 'sniper':{
      // Base camuflada de elite + bipé retrátil + cano flutuante canelado + luneta térmica HD + mira laser
      circ(0,0,8.4,'#283828','#0d140d',1.1);
      circ(0,-0.8,5.8,'#3f543d');
      rot(()=>{
        const L=22.5+lvl*3;
        // Bipé dianteiro articulado com sapatas
        ctx.strokeStyle='#334155';ctx.lineWidth=1.7;
        ctx.beginPath();ctx.moveTo(10-rc,0);ctx.lineTo(14.5-rc,-6.5);ctx.moveTo(10-rc,0);ctx.lineTo(14.5-rc,6.5);ctx.stroke();
        circ(14.5-rc,-6.5,1.4,'#475569');circ(14.5-rc,6.5,1.4,'#475569');
        // Feixe laser de precisão
        ctx.strokeStyle='rgba(239,68,68,.65)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(L-rc,0);ctx.lineTo(L+16-rc,0);ctx.stroke();
        // Cano longo canelado + camisa perfurada + freio de boca multi-câmara
        R(2-rc,-2,L,4,'#1e293b');R(2-rc,-1.1,L,1.3,'#94a3b8');
        R(3-rc,-2.8,9,5.6,'#334155');
        R(2-rc+L,-3.3,4,6.6,'#334155');R(3.5-rc+L,-3.6,1.2,7.2,'#0f172a');
        flash(6-rc+L,0,'#f97316','#fef08a');
        // Chassi do rifle antimaterial
        poly([[-8.5,-4.8],[5.5,-4.8],[7.5,0],[5.5,4.8],[-8.5,4.8]],'#3b4f37','#121a10',1);
        // Luneta óptica térmica iluminada com lente ciano
        R(-2.5-rc*0.4,-6.8,11,3.8,'#0f172a');
        R(6.2-rc*0.4,-6.3,2.6,2.8,'#38bdf8');R(-3.2-rc*0.4,-6.3,2,2.8,'#ef4444');
        circ(0,0,2.7,band,'#ffffff',.7);
      });
      break;}
    case 'mortar':{
      // Trincheira de artilharia pesada + sacos de areia + obus de grosso calibre com anéis de latão
      for(const [bx,by] of [[-9.5,5.2],[-3.2,7.4],[3.8,7.4],[9.5,5.2]]){
        ctx.fillStyle='#78684c';ctx.strokeStyle='#3f3524';ctx.lineWidth=.8;
        ctx.beginPath();ctx.ellipse(bx,by,4.8,2.7,0,0,6.283);ctx.fill();ctx.stroke();
      }
      // Munições de artilharia empilhadas ao lado
      R(-13.5,-4.5,3.2,7.5,'#334155');R(-13.5,-5.8,3.2,2.2,'#facc15');
      R(-10,-4.5,2.8,6.5,'#475569');R(-10,-5.5,2.8,1.8,'#ef4444');
      circ(0,0,9.4,'#242c28','#0d1210',1.1);
      rot(()=>{
        const L=12.5+lvl*2;
        // Trilhos amortecedores hidráulicos
        R(-4-rc,-7.8,11,2,'#64748b');R(-4-rc,5.8,11,2,'#64748b');
        // Tubo de morteiro largo com sombreamento cilíndrico e anéis de reforço dourados
        poly([[-5.5-rc,-6.8],[L-rc,-5.8],[L-rc,5.8],[-5.5-rc,6.8]],'#334155','#0f172a',1.1);
        R(-3.5-rc,-4.6,L+1.5,2.8,'#64748b');
        R(0.8-rc,-6.4,2.2,12.8,'#eab308');R(L-4.8-rc,-6,2.2,12,'#eab308');
        // Boca profunda do obus
        ctx.fillStyle='#090d14';ctx.strokeStyle='#94a3b8';ctx.lineWidth=.9;
        ctx.beginPath();ctx.ellipse(L-rc,0,2.5,5.2,0,0,6.283);ctx.fill();ctx.stroke();
        flash(L+2-rc,0,'#fb923c','#fef08a');
      });
      break;}
    case 'flame':{
      // Tanques gêmeos pressurizados de napalm + manômetro + bico incinerador pesado com chama piloto
      circ(0,0,8.8,'#451a14','#180806',1.1);
      rot(()=>{
        const L=12.5+lvl*2;
        // Cilindros duplos de combustível com reflexo e faixas de alerta
        R(-10.5,-7.5,8.5,5.2,'#dc2626');R(-9.5,-6.6,6.5,1.6,'#fca5a5');R(-7.2,-7.5,2.2,5.2,'#fbbf24');
        R(-10.5,2.3,8.5,5.2,'#dc2626');R(-9.5,3.2,6.5,1.6,'#fca5a5');R(-7.2,2.3,2.2,5.2,'#fbbf24');
        // Camisa térmica ventilada e bocal difusor de plasma/fogo
        R(1-rc,-3.8,L,7.6,'#374151');R(2-rc,-2.2,L-2,4.4,'#111827');
        for(let i=0;i<3;i++)R(3.5-rc+i*3,-3.2,1.4,6.4,'#fb923c');
        R(1-rc+L,-4.8,3.4,9.6,'#f97316');
        // Cúpula blindada central + núcleo térmico
        poly([[-5.5,-5.5],[4.5,-4.5],[4.5,4.5],[-5.5,5.5]],'#7f1d1d','#1f0909',1);
        R(-3.2,-2.2,5.2,4.4,band);
        // Chama piloto dinâmica na ponta
        const fl=2.8+Math.sin(tm*16)*1.3+(rec*3);
        circ(L+5.5-rc,0,fl,'#fb923c');circ(L+5-rc,0,fl*.58,'#fef08a');
      });
      break;}
    case 'tesla':{
      // Bobina de Tesla Industrial com enrolamento de cobre, 3 anéis toroidais e esfera de plasma elétrico
      circ(0,0,9.5,'#1e293b','#090d16',1.1);
      circ(0,0,6.8,'#b45309','#78350f',.9);
      // Capacitores laterais na base
      R(-11,-2,3,5,'#0284c7');R(8,-2,3,5,'#0284c7');
      // Coluna isolante vertical e anéis de indução
      R(-3.8,-19.5,7.6,18.5,'#334155');R(-1.6,-19.5,3.2,18.5,'#cbd5e1');
      for(const ry of [-6,-11.2,-16.4]){
        ctx.fillStyle='#0f172a';ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.3;
        ctx.beginPath();ctx.ellipse(0,ry,9.4+ry*.15,2.7,0,0,6.283);ctx.fill();ctx.stroke();
      }
      const pl=.68+.35*Math.sin(tm*9)+(tw||0)*2;
      // Halo e Orbe de Plasma de Alta Tensão no topo
      circ(0,-21.5,7+lvl*.55,'rgba(56,189,248,'+Math.min(.88,.38*pl)+')');
      circ(0,-21.5,4.3+lvl*.32,'#38bdf8','#e0f2fe',1.3);
      circ(-1.2,-22.5,1.8,'#ffffff');
      // Arcos voltaicos animados
      ctx.strokeStyle='#e0f2fe';ctx.lineWidth=1.2;
      for(let i=0;i<3;i++){
        const a=tm*7.5+i*2.09;
        ctx.beginPath();ctx.moveTo(0,-21.5);
        ctx.lineTo(Math.cos(a)*6.5,-15+Math.sin(a*2)*2);
        ctx.lineTo(Math.cos(a)*9.5,-7.5);ctx.stroke();
      }
      break;}
    case 'ice':{
      // Reator Criogênico Hexagonal com coroa de cristais giratórios e monolito de gelo facetado
      circ(0,0,9.8,'#0c4a6e','#082f49',1.1);
      circ(0,0,7,'#0284c7','#bae6fd',.9);
      ctx.save();ctx.rotate(tm*1.25);
      for(let i=0;i<6;i++){
        ctx.rotate(Math.PI/3);
        poly([[-2.4,-3],[0,-12.5-lvl],[2.4,-3]],'#38bdf8','#e0f2fe',.8);
      }
      ctx.restore();
      const gl=.78+.22*Math.sin(tm*4.5);
      poly([[0,-22],[7.5,-9.5],[0,-1],[-7.5,-9.5]],'rgba(125,211,252,'+gl+')','#ffffff',1.1);
      poly([[0,-22],[0,-1],[-7.5,-9.5]],'rgba(224,242,254,.88)');
      circ(0,-11,2.2,'#ffffff');
      break;}
    case 'poison':{
      // Torre Bio-Química com reator de vidro pressurizado borbulhante e pulverizador duplo
      circ(0,0,8.8,'#1a2e15','#0a1408',1.1);
      rot(()=>{
        const L=11.5+lvl*2;
        // Mangueiras laterais de toxina
        ctx.strokeStyle='#84cc16';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(-2,-5);ctx.lineTo(6-rc,-4);ctx.moveTo(-2,5);ctx.lineTo(6-rc,4);ctx.stroke();
        // Canos injetores duplos + bocal bio-hazard
        R(2-rc,-3.8,L,3,'#273822');R(2-rc,.8,L,3,'#273822');
        R(2-rc+L,-4.4,3.2,8.8,'#84cc16');
        flash(5-rc+L,0,'#a3e635','#ecfccb');
        poly([[-7.5,-6.2],[4.2,-5.2],[5.5,0],[4.2,5.2],[-7.5,6.2]],'#2d4722','#111c0c',1);
        // Câmara de vidro com toxina neon e bolhas animadas
        circ(-2,0,5.1,'#14260d','#a3e635',1.1);
        circ(-2,0,3.8,'#84cc16');
        const by=Math.sin(tm*6.5)*1.9;
        circ(-3.1,by,1.3,'#ecfccb');circ(-0.6,-by,1,'#ecfccb');
      });
      break;}
    case 'antitank':{
      // Caça-tanques pesado com blindagem reativa ERA, amortecedores hidráulicos e canhão longo com freio em T
      circ(0,0,10.4,'#292e24','#0f120d',1.2);
      rot(()=>{
        const L=22.5+lvl*3;
        // Cilindros hidráulicos duplos de recuo com brilho metálico
        R(1-rc,-6,9.5,2.4,'#64748b');R(1-rc,3.6,9.5,2.4,'#64748b');
        R(2-rc,-5.5,7.5,1,'#cbd5e1');R(2-rc,4.1,7.5,1,'#cbd5e1');
        // Canhão principal pesado + extrator de fumaça central
        R(2-rc,-3.2,L,6.4,'#1f241d');R(2-rc,-1.8,L,2.2,'#6b7280');
        R(9-rc,-4,6,8,'#374151');
        // Freio de boca duplo em T de alto calibre
        R(L-1-rc,-6.5,3.2,13,'#374151');R(L+3-rc,-5.4,2.8,10.8,'#4b5563');
        flash(L+6-rc,0,'#f97316','#fef08a');
        // Torreta chanfrada com blocos de blindagem reativa
        poly([[-10.5,-7.5],[4.5,-6.5],[7.5,0],[4.5,6.5],[-10.5,7.5]],'#3f4736','#141710',1.1);
        poly([[-8.2,-5.2],[2.2,-4.2],[4.5,0],[2.2,4.2],[-8.2,5.2]],'#57634c');
        R(-7.2,-2.2,6.2,4.4,band);
        R(-9.2,-7,5.5,1.6,'#fbbf24');R(-9.2,5.4,5.5,1.6,'#fbbf24');
      });
      break;}
    case 'archer':{
      // Balista Composta Tática de Carbono e Titânio com polias douradas e virote energético
      circ(0,0,8.4,'#422d1b','#1c120a',1.1);
      rot(()=>{
        const L=14.5+lvl*2;
        // Lâminas duplas recurvas do arco composto
        ctx.strokeStyle='#d97706';ctx.lineWidth=2.8;
        ctx.beginPath();ctx.moveTo(4.5,-11.5);ctx.quadraticCurveTo(11.5,-6,7.5,0);ctx.quadraticCurveTo(11.5,6,4.5,11.5);ctx.stroke();
        // Polias mecânicas nas extremidades
        circ(4.5,-11.5,2.3,'#fbbf24','#0f172a',.8);circ(4.5,11.5,2.3,'#fbbf24','#0f172a',.8);
        // Corda tensionada a laser
        ctx.strokeStyle='#bae6fd';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(4.5,-11.5);ctx.lineTo(-3.5-rc,0);ctx.lineTo(4.5,11.5);ctx.stroke();
        // Trilho central em fibra e flecha com ponta de plasma ciano
        R(-6.5,-2.4,L,4.8,'#475569');R(-5.5,-1.2,L-2,2.4,'#1e293b');
        R(-2.5-rc,-1,L+3.5,2,'#f8fafc');
        poly([[L+1-rc,-3.4],[L+6.8-rc,0],[L+1-rc,3.4]],'#38bdf8','#ffffff',.7);
      });
      break;}
    case 'boomerang':{
      // Lançador Magnético Orbital com Glaive / Chakram de 3 lâminas douradas e núcleo turquesa
      circ(0,0,8.8,'#115e59','#042f2e',1.1);
      circ(0,0,5.8,'#0f766e','#2dd4bf',1);
      ctx.save();ctx.translate(0,-3);ctx.rotate(tm*7.5);
      for(let i=0;i<3;i++){
        ctx.rotate(Math.PI*2/3);
        poly([[0,-2.2],[11.8,-4.5],[8.5,1.4],[2,2.4]],'#fbbf24','#fef08a',.85);
      }
      circ(0,0,3.3,'#2dd4bf','#ffffff',.9);
      ctx.restore();
      break;}
    case 'engineer':{
      // Torre de Engenharia Robótica com braços servo-assistidos, emissor duplo e bobina de plasma
      circ(0,0,9.2,'#334155','#0f172a',1.1);
      rot(()=>{
        const L=11.5+lvl*2;
        poly([[-8.5,-6.5],[3.5,-6.5],[5.5,0],[3.5,6.5],[-8.5,6.5]],'#475569','#0f172a',1);
        R(-6.2,-4.2,8.4,8.4,'#1e293b');
        // Braços servo-industriais amarelos com listras
        R(2-rc,-4.3,L,2.7,'#f59e0b');R(2-rc,1.6,L,2.7,'#f59e0b');
        R(5-rc,-4.3,2,2.7,'#0f172a');R(5-rc,1.6,2,2.7,'#0f172a');
        circ(L+2.2-rc,0,3.4,'#38bdf8','#ffffff',.95);
        flash(L+4-rc,0,'#38bdf8','#e0f2fe');
      });
      // Reator de plasma superior com pulso magnético
      circ(0,-4,4.5,'#0284c7','#bae6fd',1.1);
      ctx.strokeStyle='rgba(56,189,248,.7)';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.arc(0,-4,7.2+Math.sin(tm*6)*1.5,0,6.283);ctx.stroke();
      break;}
    case 'radar':{
      // Sentinela Radar Tática com canhão duplo de precisão e prato parabólico giratório com varredura
      circ(0,0,9.2,'#1e293b','#090d16',1.1);
      rot(()=>{
        const L=12.5+lvl*2;
        R(2-rc,-3.5,L,2.4,'#0f172a');R(2-rc,1.1,L,2.4,'#0f172a');
        R(2-rc+L,-4,2.8,8,'#38bdf8');
        flash(5-rc+L,0,'#38bdf8','#e0f2fe');
        poly([[-6.5,-5.5],[4.5,-4.5],[4.5,4.5],[-6.5,5.5]],'#334155','#0f172a',.95);
      });
      // Antena parabólica giratória no topo com LED de telemetria
      ctx.save();ctx.translate(0,-6.2);ctx.rotate(tm*2.4);
      ctx.fillStyle='#e2e8f0';ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.ellipse(0,0,9.5,3.8,0,0,6.283);ctx.fill();ctx.stroke();
      R(-1,-6.5,2,6.5,'#38bdf8');circ(0,-6.5,2.2,((tm*4)|0)%2?'#ef4444':'#38bdf8','#ffffff',.7);
      ctx.restore();
      break;}
    case 'shotgun':{
      // Escopeta Automática de Cano Duplo Pesado com escudo térmico e cartucheira vermelha/dourada
      circ(0,0,8.8,'#452c1e','#1c110b',1.1);
      rot(()=>{
        const L=11.5+lvl*2;
        // Canos duplos largos com fita ventilada superior
        R(1-rc,-4.5,L,3.8,'#1f2937');R(1-rc,.7,L,3.8,'#1f2937');
        R(2-rc,-3.6,L-2,7.2,'#374151');
        for(let i=0;i<3;i++)R(3.5-rc+i*2.6,-1.2,1.4,2.4,'#111827');
        R(1-rc+L,-4.8,2.8,9.6,'#cbd5e1');
        flash(4-rc+L,0,'#fb923c','#fef08a');
        poly([[-7.5,-5.8],[3.5,-5.2],[4.5,0],[3.5,5.2],[-7.5,5.8]],'#78350f','#291305',1);
        // Cartuchos calibre 12 na lateral (vermelho + base de latão)
        for(let i=0;i<3;i++){
          R(-5.2+i*2.6,-6.5,1.9,2.2,'#ef4444');
          R(-5.2+i*2.6,-4.8,1.9,.8,'#facc15');
        }
      });
      break;}
    case 'drone':{
      // Heliponto Tático Iluminado + Drone Quadricóptero Militar com rotores de alta rotação e torre laser
      circ(0,0,9.8,'#0f172a','#38bdf8',1.25);
      ctx.strokeStyle='rgba(56,189,248,.65)';ctx.lineWidth=1.1;
      ctx.beginPath();ctx.arc(0,0,6.2,0,6.283);ctx.stroke();
      // Marcação "H" no heliponto
      R(-2.5,-2.5,1.2,5,'#38bdf8');R(1.3,-2.5,1.2,5,'#38bdf8');R(-2.5,-0.6,5,1.2,'#38bdf8');
      // Drone pairando acima da base
      const bob=Math.sin(tm*4.8)*2.3;
      ctx.save();ctx.translate(0,-11.5+bob);
      // 4 braços de fibra de carbono e rotores translúcidos
      ctx.strokeStyle='#64748b';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-8.5,-6.5);ctx.lineTo(8.5,6.5);ctx.moveTo(-8.5,6.5);ctx.lineTo(8.5,-6.5);ctx.stroke();
      for(const [rx,ry] of [[-8.5,-6.5],[8.5,-6.5],[-8.5,6.5],[8.5,6.5]]){
        circ(rx,ry,4.2,'rgba(125,211,252,.35)','#bae6fd',.85);
        circ(rx,ry,1.3,'#0f172a');
      }
      // Corpo central do drone + canhão direcional
      rot(()=>{
        R(2-rc,-1.4,9.5+lvl,2.8,'#0f172a');R(9.5+lvl-rc,-2,2.2,4,'#38bdf8');
        flash(12+lvl-rc,0,'#38bdf8','#ffffff');
      });
      poly([[-5.5,-3.2],[5.5,-3.2],[6.5,0],[5.5,3.2],[-5.5,3.2]],'#334155','#0f172a',.95);
      circ(0,0,2.5,'#38bdf8','#ffffff',.7);
      ctx.restore();
      break;}
    case 'demolition':{
      // Lançador Múltiplo de Mísseis (MLRS) com casulo blindado, listras hazard e 3 ogivas prontas
      circ(0,0,9.8,'#3b1d1d','#170909',1.1);
      rot(()=>{
        const L=13.5+lvl*2;
        // Casulo blindado de mísseis
        poly([[-7.5-rc,-7.8],[L-rc,-6.8],[L-rc,6.8],[-7.5-rc,7.8]],'#451a1a','#0f172a',1.1);
        R(-5.5-rc,-5.5,L,11,'#1e293b');
        // Faixas de alerta amarelo/preto
        for(let i=0;i<3;i++)R(-5-rc+i*4.2,-7.3,2,14.6,'#fbbf24');
        // 3 ogivas táticas armadas nos tubos de lançamento
        for(const oy of [-3.4,0,3.4]){
          circ(L-rc,oy,2.3,'#ef4444','#fecaca',.8);
          circ(L+0.6-rc,oy,0.9,'#ffffff');
        }
        flash(L+3-rc,0,'#f97316','#fef08a');
      });
      break;}
    case 'railgun':{
      // Canhão Eletromagnético Orbital com trilhos paralelos energizados, bobinas capacitivas e núcleo violeta
      circ(0,0,9.8,'#1e1b4b','#0f0d26',1.1);
      rot(()=>{
        const L=20.5+lvl*3;
        // Canal de plasma brilhante entre os trilhos magnéticos
        ctx.fillStyle='rgba(192,132,252,'+(.6+.35*Math.sin(tm*10))+')';
        ctx.fillRect(2-rc,-1.8,L,3.6);
        // Trilhos aceleradores paralelos com chanfro luminoso
        R(1-rc,-4.8,L+2.5,2.5,'#312e81');R(1-rc,2.3,L+2.5,2.5,'#312e81');
        R(2-rc,-4.2,L+1,1.2,'#c084fc');R(2-rc,3.0,L+1,1.2,'#c084fc');
        // Aletas de indução eletromagnética
        for(const cx of [5,10,15])R(cx-rc,-6.4,2,12.8,'#e879f9');
        flash(L+4-rc,0,'#c084fc','#ffffff');
        // Culatra blindada de fusão
        poly([[-9.5,-6.4],[3.5,-5.4],[5.5,0],[3.5,5.4],[-9.5,6.4]],'#1e1b4b','#818cf8',1.1);
        circ(-2,0,3.3,'#e879f9','#ffffff',.9);
      });
      break;}
    case 'medstation':{
      // Estação Médica Tática com domo blindado branco/esmeralda, cruz luminosa e antena emissora de pulso
      circ(0,0,9.4,'#ecfdf5','#065f46',1.2);
      poly([[-7.5,-7.5],[7.5,-7.5],[8.5,5.5],[-8.5,5.5]],'#f8fafc','#0f172a',.95);
      // Cruz médica tática verde-esmeralda com brilho
      R(-1.6,-5.4,3.2,8.8,'#10b981');R(-4.4,-2.6,8.8,3.2,'#10b981');
      // Antena emissora de bio-pulso
      R(-1.1,-16.5,2.2,10.5,'#64748b');
      const mp=3.8+Math.sin(tm*6)*1.3;
      circ(0,-17.5,mp,'rgba(16,185,129,.48)');
      circ(0,-17.5,2.5,'#10b981','#ffffff',.95);
      break;}
    case 'acid':{
      // Canhão Corrosivo Pressurizado com tanque de ácido incandescente e bocal atomizador
      circ(0,0,9.2,'#1a2e05','#0a1402',1.1);
      rot(()=>{
        const L=12.5+lvl*2;
        R(2-rc,-3.2,L,6.4,'#365314');R(2-rc,-1.4,L,2.8,'#4d7c0f');
        R(2-rc+L,-4.2,3.4,8.4,'#bef264');
        flash(5-rc+L,0,'#a3e635','#ecfccb');
        poly([[-8.5,-6.4],[3.5,-5.4],[4.5,0],[3.5,5.4],[-8.5,6.4]],'#365314','#142406',1);
        // Câmara de ácido verde-limão fluorescente
        R(-6.4,-3.8,8.4,7.6,'#a3e635');R(-5.4,-2.8,6.4,2.2,'#ecfccb');
      });
      break;}
    case 'beacon':{
      // TORRE DE SUPORTE: Farol de Comando (Aura Tática Dourada/Ciano + Radar Orbital)
      circ(0,0,10.2,'#0f172a','#fbbf24',1.35);
      // Anel holográfico giratório
      ctx.save();ctx.rotate(tm*1.8);
      ctx.strokeStyle='rgba(251,191,36,.88)';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
      ctx.beginPath();ctx.arc(0,0,12.4,0,6.283);ctx.stroke();ctx.setLineDash([]);
      ctx.restore();
      rot(()=>{
        const L=11.5+lvl*2;
        R(2-rc,-1.6,L,3.2,'#1e293b');R(2-rc+L,-2.4,2.8,4.8,'#38bdf8');
      });
      // Torre de comando central e antenas gêmeas
      poly([[-6.4,-6.4],[6.4,-6.4],[7.4,5.4],[-7.4,5.4]],'#1e293b','#fbbf24',1.05);
      R(-5.2,-15.5,2.2,10.5,'#94a3b8');R(3,-15.5,2.2,10.5,'#94a3b8');
      circ(0,-12.5,4.8,'rgba(56,189,248,'+(.48+.3*Math.sin(tm*5))+')');
      circ(0,-12.5,2.8,'#fbbf24','#ffffff',1);
      break;}
    case 'supplydepot':{
      // TORRE DE SUPORTE: Base de Suprimentos (Bunker Logístico Blindado + Guindaste + Lingotes de Ouro)
      poly([[-11.5,-6.5],[11.5,-6.5],[12.5,7.5],[-12.5,7.5]],'#1e293b','#f59e0b',1.15);
      R(-9.5,-4.5,19,9.5,'#0f172a');
      // Caixas de suprimento / lingotes dourados com brilho especular
      R(-7.4,-2.4,6.4,4.2,'#d97706');R(-6.4,-1.4,4.4,2.2,'#fde047');
      R(1,-2.4,6.4,4.2,'#d97706');R(2,-1.4,4.4,2.2,'#fde047');
      R(-3.2,2,6.4,4,'#eab308');R(-2.2,2.6,4.4,1.6,'#fef08a');
      // Braço de guindaste / antena logística girando suavemente
      ctx.save();ctx.rotate(Math.sin(tm*1.6)*.6);
      R(-1.6,-11.5,3.2,11.5,'#64748b');R(-1,-11.5,2,9.5,'#fbbf24');
      circ(0,-11.5,2.7,'#2be3a1','#ffffff',.85);
      ctx.restore();
      break;}
    case 'cryogen':{
      // TORRE DE SUPORTE: Torre de Estase (Anéis Giroscópicos Duplos + Singularidade Criogênica)
      circ(0,0,9.8,'#1e1b4b','#a855f7',1.25);
      ctx.save();ctx.translate(0,-6.2);
      // Anel giroscópico 1
      ctx.save();ctx.rotate(tm*2.5);
      ctx.strokeStyle='#c084fc';ctx.lineWidth=1.7;
      ctx.beginPath();ctx.ellipse(0,0,10.5,4.2,0,0,6.283);ctx.stroke();
      ctx.restore();
      // Anel giroscópico 2
      ctx.save();ctx.rotate(-tm*2.1);
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(0,0,4.2,10.5,0,0,6.283);ctx.stroke();
      ctx.restore();
      // Núcleo de singularidade
      const sp=3.7+Math.sin(tm*7)*1;
      circ(0,0,sp+2.2,'rgba(168,85,247,.42)');
      circ(0,0,sp,'#e879f9','#ffffff',1);
      ctx.restore();
      break;}
    case 'nanomed':{
      // TORRE DE SUPORTE: Estação Nano-Médica (Domo Futurista + Drones Reparadores Orbitais)
      circ(0,0,10.2,'#064e3b','#2be3a1',1.35);
      circ(0,-2,7.8,'#ecfdf5','#10b981',1.05);
      // Cruz holográfica neon brilhante
      R(-1.6,-6.2,3.2,8.4,'#10b981');R(-4.2,-3.6,8.4,3.2,'#10b981');
      // Dois nano-drones orbitando a estação com trilha luminosa
      for(let i=0;i<2;i++){
        const a=tm*3.6+i*Math.PI;
        const dx=Math.cos(a)*12.4,dy=-4+Math.sin(a)*6.2;
        circ(dx,dy,2.4,'#2be3a1','#ffffff',.85);
      }
      circ(0,-14.5,3.2+Math.sin(tm*6)*.85,'rgba(43,227,161,.58)');
      circ(0,-14.5,2,'#ffffff');
      break;}
    case 'dartgun':{
      // TORRE DIRECIONAL: Tripé tático militar + canhão Gatling / plasma direcional + mira laser travada
      const isEnergy=(tier||0)>=4;
      const bodyCol=isEnergy?'#0c4a6e':((tier||0)>=2?'#1e293b':'#334155');
      const barrelCol=isEnergy?'#0284c7':((tier||0)>=2?'#475569':'#64748b');
      const glowCol=isEnergy?'#38bdf8':ac;
      // Tripé tático militar (3 hastes de aço com sapatas estabilizadoras)
      ctx.strokeStyle='#1e293b';ctx.lineWidth=2.5;
      for(const [tx,ty] of [[-12.5,-9.2],[-12.5,9.2],[11.5,0]]){
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(tx,ty);ctx.stroke();
        circ(tx,ty,2.3,'#334155',glowCol,.85);
      }
      circ(0,0,8.8,'#0f172a',glowCol,1.25);
      if(isEnergy){
        circ(0,0,12.5,'rgba(56,189,248,'+(0.28+0.15*Math.sin(tm*8))+')');
      }
      rot(()=>{
        const L=16.5+lvl*2.5;
        // Feixe de mira laser direcional
        ctx.strokeStyle=isEnergy?'rgba(56,189,248,.88)':'rgba(239,68,68,.68)';
        ctx.lineWidth=isEnergy?1.6:1.1;
        ctx.beginPath();ctx.moveTo(L-rc,0);ctx.lineTo(L+17-rc,0);ctx.stroke();
        // Bloco receptor e canos rotativos / canhão de energia azul
        R(-4.2-rc,-6.4,10.4,12.8,bodyCol);
        R(2-rc,-4.7,L,2.5,barrelCol);
        R(2-rc,-1.25,L+2.2,2.5,isEnergy?'#bae6fd':barrelCol);
        R(2-rc,2.2,L,2.5,barrelCol);
        // Anéis de contenção magnética / bobinas de energia azul
        R(8-rc,-5.2,2.6,10.4,glowCol);
        if((tier||0)>=3||lvl>=3)R(14-rc,-5.2,2.6,10.4,isEnergy?'#e0f2fe':'#fde047');
        if(isEnergy){
          circ(L+3.2-rc,0,3.4,'#38bdf8','#ffffff',.95);
        }
        flash(L+4-rc,0,isEnergy?'#38bdf8':'#fb923c','#ffffff');
        // Escudo de operador + Painel Luminoso Tático
        poly([[-9.2,-6.2],[3.2,-5.2],[5.2,0],[3.2,5.2],[-9.2,6.2]],bodyCol,glowCol,1.05);
        R(-8.2,-3.6,5.6,7.2,'#090d16');
        R(-7.4,-2.8,4.2,5.6,isEnergy?'#38bdf8':'#22d3ee');
        R(-7,-1.5,3.2,1.1,'#ffffff');
        circ(0,0,2.9,band,'#ffffff',.85);
      });
      break;}
    case 'dino':{
      // TORRE DOMADOR JURÁSSICO: Centro de Comando Bio-Tático com Reator de Âmbar, Radar Neural, Holograma 3D e Canhão Bio-Sônico
      const ledOn=Math.min(1,(tw||0)*1.6);
      const ledCol=ledOn>0.2?'#34d399':((tier||0)>=3?ac:'#10b981');
      const warnCol=((tier||0)>=4)?'#fbbf24':'#f59e0b';
      for(const [px,py] of [[-12,-7],[10,-7],[-12,5],[10,5]]){
        R(px,py,3.2,3.2,'#334155');
        R(px+0.6,py+0.6,2,2,ledCol);
      }
      poly([[-12,-8],[12,-8],[14,0],[12,8],[-12,8],[-14,0]],'#090e1a','#475569',1.3);
      poly([[-10,-6],[10,-6],[11.5,0],[10,6],[-10,6],[-11.5,0]],'#1e293b',ledCol,1.0);
      for(let i=0;i<4;i++){
        R(-8+i*4.4,-7.4,2.2,1.5,warnCol);
        R(-8+i*4.4,5.9,2.2,1.5,warnCol);
      }
      if(ledOn>0.06){
        ctx.save();
        ctx.strokeStyle='rgba(52,211,153,'+(0.4+ledOn*0.55)+')';
        ctx.lineWidth=2.4;
        ctx.beginPath();ctx.arc(0,0,14+ledOn*4,0,6.283);ctx.stroke();
        ctx.restore();
      }
      circ(0,0,6.8,'#064e3b','#34d399',1.1);
      ctx.save();ctx.rotate(tm*2.2);
      R(-5.5,-1,11,2,'rgba(52,211,153,0.45)');
      R(-1,-5.5,2,11,'rgba(52,211,153,0.45)');
      ctx.restore();
      circ(0,0,3.8,ledOn>0.15?'#fef08a':'#f59e0b','#ffffff',0.9);
      rot(()=>{
        const L=13+lvl*2.2;
        ctx.strokeStyle='rgba(52,211,153,0.45)';ctx.lineWidth=1.1;
        ctx.beginPath();ctx.moveTo(L-rc,0);ctx.lineTo(L+14-rc,0);ctx.stroke();
        R(-4-rc,-4.8,10,9.6,'#0f172a');
        R(-2-rc,-3.8,6,7.6,'#1e293b');
        R(3-rc,-3.6,L,2.4,'#334155');
        R(3-rc,1.2,L,2.4,'#334155');
        R(4-rc,-1.0,L-1,2.0,ledOn>0.15?'#fef08a':ledCol);
        poly([[L+1-rc,-4.5],[L+6-rc,0],[L+1-rc,4.5]],ledCol,'#ffffff',0.8);
        flash(L+6-rc,0,'#34d399','#fef08a');
      });
      R(-10,-12,10,6,'rgba(6,78,59,0.92)');
      ctx.strokeStyle='#34d399';ctx.lineWidth=1.0;ctx.strokeRect(-10,-12,10,6);
      R(-8.8,-10.6,7.2,1.1,'#a7f3d0');
      R(-8.8,-8.6,5.2,1.1,'#38bdf8');
      R(5,-15,2.2,11,'#64748b');
      ctx.strokeStyle='#cbd5e1';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.arc(6,-15,4.2,-2.4,-0.7);ctx.stroke();
      circ(6,-16,2.5+(ledOn*1.4),ledOn>0.15?'#34d399':'#f97316','#ffffff',0.9);
      break;}
    case 'minefactory':{
      // USINA DE MINAS TERRESTRES: Unidade industrial militar compacta com rampa ejetora e tambor rotativo
      poly([[-13.5,-8.2],[13.5,-8.2],[14.5,8.2],[-14.5,8.2]],'#1e293b','#475569',1.25);
      R(-11.2,-6.2,22.4,12.4,'#0f172a');
      for(let i=0;i<4;i++){
        R(-11+i*5.5,-7.7,2.8,1.9,'#facc15');
        R(-11+i*5.5,5.8,2.8,1.9,'#facc15');
      }
      circ(-9.2,-4.2,2.7,'#334155','#090d16',.85);
      circ(-9.2,4.2,2.7,'#334155','#090d16',.85);
      rot(()=>{
        const L=11.5+lvl*1.5;
        R(2,-5.2,L,10.4,'#1e293b');
        R(2,-5.2,L,1.9,'#64748b');
        R(2,3.3,L,1.9,'#64748b');
        const ej=Math.max(0,(0.8-rec)*6);
        R(3+ej,-3.2,4.2,6.4,'#f59e0b');
        circ(L-1,-0.2,3.6,'#334155','#94a3b8',.85);
        circ(L-1,-0.2,1.5,((tm*6)|0)%2?'#ef4444':'#facc15');
      });
      ctx.save();ctx.rotate(tm*2.8);
      R(-6.2,-1.9,12.4,3.8,'#475569');R(-1.9,-6.2,3.8,12.4,'#475569');
      ctx.restore();
      circ(0,0,5.8,'#1e293b',ac,1.25);
      const blink=((tm*5)|0)%2;
      circ(0,0,2.6,blink?'#ef4444':'#facc15','#ffffff',.85);
      break;}
    case 'portal':{
      // TORRE DE PORTAL TÁTICO: Pórtico Dimensional Quântico com anéis de dobra e horizonte de eventos
      circ(0,0,10.4,'#1e1b4b','#c084fc',1.35);
      ctx.save();ctx.rotate(tm*2.4);
      poly([[0,-12.5],[10.5,0],[0,12.5],[-10.5,0]],'rgba(192,132,252,.24)','#38bdf8',1.25);
      ctx.restore();
      ctx.save();ctx.rotate(-tm*1.8);
      poly([[-8.5,-8.5],[8.5,-8.5],[8.5,8.5],[-8.5,8.5]],'rgba(56,189,248,.12)','#c084fc',.9);
      ctx.restore();
      rot(()=>{
        const L=11.5+lvl*2;
        R(2-rc,-2.2,L,4.4,'#312e81');R(3-rc,-1,L-1,2,'#a855f7');
        circ(L+2.2-rc,0,3.2,'#38bdf8','#ffffff',.9);
      });
      const wp=4.2+Math.sin(tm*7)*1.25;
      circ(0,-3,wp+2.2,'rgba(56,189,248,.42)');
      circ(0,-3,wp,'#c084fc','#ffffff',1.15);
      break;}
  }
  // Insígnia de Skin Nível 5 (Coroa de Maestria dinâmica + nodos orbitais por caminho)
  if((tier||0)>=5){
    ctx.strokeStyle='#fde047';ctx.lineWidth=1.3;
    ctx.beginPath();ctx.arc(0,-16.5,4.8,0,6.283);ctx.stroke();
    ctx.fillStyle=ac;
    ctx.beginPath();ctx.arc(0,-16.5,3.3,0,6.283);ctx.fill();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();
    R(-10.5,-15.5,3.2,3.2,'#fde047');R(7.3,-15.5,3.2,3.2,'#fde047');
  }
  ctx.restore();
}
const GLOW_CACHE={};
function glowSprite(c,r,a){const k=c+r+a;let g=GLOW_CACHE[k];if(!g){g=GLOW_CACHE[k]=document.createElement('canvas');g.width=g.height=r*2;const x=g.getContext('2d'),gr=x.createRadialGradient(r,r,4,r,r,r);gr.addColorStop(0,c+a);gr.addColorStop(1,c+'00');x.fillStyle=gr;x.fillRect(0,0,r*2,r*2);}return g;}
const TIER_GLOW=['','#7fd0ff','#3ee0a0','#ffb020','#ff6a3a','#d070ff'];

function drawDinoCompanion(t){
  const dn=t._dino;
  if(!dn)return;
  const poly=(pts,fill,stroke,lw)=>{
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke();}
  };
  const circ=(cx,cy,r,fill,stroke,lw)=>{
    ctx.beginPath();ctx.arc(cx,cy,r,0,6.283);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke();}
  };
  ctx.save();
  // Linha de vínculo bio-neural quando a torre está selecionada
  if(G.selected===t){
    ctx.strokeStyle='rgba(52,211,153,.65)';ctx.lineWidth=1.6;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(dn.x,dn.y);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.translate(Math.round(dn.x),Math.round(dn.y));
  const tr=t.paragon?6:(t.tier||0);
  // Escala imponente: o Dinossauro é visivelmente MAIOR e mais robusto que a torre que o invoca!
  const sc=1.38+Math.min(0.56,tr*0.10)+(t.paragon?0.28:0);
  const face=Math.cos(dn.angle)>=0?1:-1;

  // Ondas de choque do Rugido Sísmico e Pisão quando ativos
  if(dn.roarT>0||dn.stompT>0){
    const rp=1-Math.max(dn.roarT||0,dn.stompT||0)/0.65;
    ctx.save();
    ctx.strokeStyle=t.paragon?'rgba(251,191,36,0.85)':'rgba(249,115,22,'+Math.min(0.85,(dn.roarT||0.4)*1.4)+')';
    ctx.lineWidth=2.8;
    ctx.beginPath();ctx.ellipse(0,4,18+rp*34,9+rp*17,0,0,6.283);ctx.stroke();
    ctx.strokeStyle='rgba(253,224,71,'+Math.min(0.75,(dn.roarT||0.4)*1.2)+')';
    ctx.lineWidth=1.8;
    ctx.beginPath();ctx.ellipse(0,-4,10+rp*24,5+rp*12,0,0,6.283);ctx.stroke();
    ctx.restore();
  }

  // Sombra projetada ampla e halo de predador alfa no solo
  ctx.fillStyle='rgba(0,0,0,.46)';
  ctx.beginPath();ctx.ellipse(0,8.5,14.5*sc,5.6*sc,0,0,6.283);ctx.fill();
  if(tr>=3||t.paragon){
    ctx.strokeStyle=t.paragon?'rgba(251,191,36,0.45)':'rgba(249,115,22,0.32)';
    ctx.lineWidth=1.6;
    ctx.beginPath();ctx.ellipse(0,8.5,16*sc,6.4*sc,0,0,6.283);ctx.stroke();
  }

  ctx.scale(face*sc,sc);
  const walkPhase=dn.moving?(dn.walkT||G.simT*11):G.simT*3.2;
  const stride=dn.moving?Math.sin(walkPhase)*4.2:Math.sin(walkPhase)*0.4;
  const kneeLift=dn.moving?Math.max(0,Math.cos(walkPhase))*2.2:0;
  const kneeLiftOpp=dn.moving?Math.max(0,-Math.cos(walkPhase))*2.2:0;
  const breath=Math.sin(G.simT*4.5)*0.6;
  const pounceLift=(dn.pounceT||0)*4.5;
  const bob=(dn.moving?Math.abs(Math.cos(walkPhase))*2.0:Math.sin(G.simT*4.5)*0.8)+pounceLift;
  const bite=dn.biteT||0;
  const roar=dn.roarT>0?Math.min(1,dn.roarT*2):0;
  const tailWhip=dn.tailT||0;

  ctx.translate((dn.lunge||0)*6.5,-bob);
  if(dn.moving||dn.lunge>0){
    ctx.rotate(dn.lunge>0?0.08:0.04);
  }

  // Paleta rica por evolução (Tier 0-1: Raptor/Alossauro Verde-Selva, Tier 2-3: Tirano Magma, Tier 4-5: Cyber T-Rex Rubro, Ascendida: Apex Mecha-Rex Dourado)
  const colShadow=t.paragon?'#451a03':tr>=4?'#450a0a':tr>=2?'#431407':'#052e16';
  const colDark=t.paragon?'#92400e':tr>=4?'#991b1b':tr>=2?'#9a3412':'#14532d';
  const colMid=t.paragon?'#d97706':tr>=4?'#dc2626':tr>=2?'#ea580c':'#15803d';
  const colLight=t.paragon?'#fbbf24':tr>=4?'#f87171':tr>=2?'#fb923c':'#22c55e';
  const colBelly=t.paragon?'#fef3c7':tr>=4?'#fecaca':tr>=2?'#fed7aa':'#bbf7d0';
  const colCrest=t.paragon?'#38bdf8':tr>=4?'#fde047':tr>=2?'#facc15':'#a3e635';
  const colArmor=t.paragon?'#0f172a':tr>=4?'#1e293b':'#334155';
  const colGlow=t.paragon?'#38bdf8':tr>=4?'#38bdf8':tr>=2?'#facc15':'#34d399';

  // 1. CAUDA LONGA ARTICULADA EM CURVA S (com chicotada de combate e placas dorsais)
  const tw1=Math.sin(walkPhase-0.5)*2.4+(tailWhip*5);
  const tw2=Math.sin(walkPhase-1.1)*3.8+(tailWhip*8);
  ctx.fillStyle=colDark;
  ctx.beginPath();
  ctx.moveTo(-5,-9);
  ctx.quadraticCurveTo(-15,-11+tw1*0.5,-25,-12+tw2);
  ctx.quadraticCurveTo(-16,-4+tw1*0.4,-4,-3);
  ctx.closePath();
  ctx.fill();
  // Sub-camada ventral clara da cauda
  ctx.fillStyle=colMid;
  ctx.beginPath();
  ctx.moveTo(-5,-6.5);
  ctx.quadraticCurveTo(-14,-7.5+tw1*0.4,-22,-10+tw2*0.85);
  ctx.lineTo(-14,-4+tw1*0.3);
  ctx.closePath();
  ctx.fill();

  // 2. PERNA TRASEIRA ESQUERDA (FUNDO — 3 segmentos: coxa, canela e garra tridáctila)
  ctx.save();
  ctx.translate(-3.5-stride*0.75,-4-kneeLiftOpp);
  ctx.fillStyle=colShadow;
  ctx.beginPath();ctx.ellipse(0,1,4.2,5.5,0.2,0,6.283);ctx.fill();
  R(-2,4,3.4,5.5,colShadow);
  // Pata com 3 garras curvas
  poly([[-2.5,9],[3.8,9],[4.8,11],[-3,11]],'#0f172a');
  poly([[3.5,9.2],[6.2,10.2],[3.5,11]],'#fef3c7');
  ctx.restore();

  // 3. TORSO MUSCULOSO DE T-REX ALFA (com respiração, escamas dorsais e ventre segmentado)
  ctx.fillStyle=colDark;
  ctx.beginPath();ctx.ellipse(-1,-8.5,12.5,7.2+breath*0.4,-0.16,0,6.283);ctx.fill();
  ctx.fillStyle=colMid;
  ctx.beginPath();ctx.ellipse(0,-8.2,11.2,6.2+breath*0.35,-0.16,0,6.283);ctx.fill();
  // Ventre escamoso claro
  ctx.fillStyle=colBelly;
  ctx.beginPath();ctx.ellipse(1.5,-5.2,8.2,2.8,-0.12,0,6.283);ctx.fill();
  // Listras de predador alfa no dorso
  ctx.fillStyle=colShadow;
  for(let i=0;i<3;i++){
    const bx=-6+i*3.8;
    poly([[bx,-13.5],[bx+2.2,-13.8],[bx+1,-8.5],[bx-0.6,-8.8]],colShadow);
  }

  // 4. CRISTA DORSAL / PLACAS DE ENERGIA AO LONGO DA ESPINHA
  for(let i=0;i<6;i++){
    const sx=-14+i*3.8;
    const sy=-11.5-Math.sin(i*0.5)*3.2+(i<2?tw1*0.25:0);
    poly([[sx,-9.5],[sx+1.8,sy-3.2],[sx+3.2,-9.5]],colCrest,colShadow,0.6);
  }

  // 5. ARMADURA TECNOLÓGICA / SELA CIBERNÉTICA (evolui com o tier)
  if(tr>=2||t.paragon){
    poly([[-6,-12.5],[5,-13.5],[7,-6.5],[-5,-5.5]],colArmor,colGlow,1.0);
    // Núcleo reator peitoral/lateral brilhante
    circ(0.5,-9.2,2.6,'#090d16',colGlow,1.0);
    circ(0.5,-9.2,1.4,colGlow);
    if(tr>=4||t.paragon){
      // Canhão dorsal / propulsor térmico Cyber-Rex
      R(-5.5,-15.5,7.5,2.6,'#0f172a');
      R(-4.5,-14.8,5.5,1.2,colGlow);
    }
  } else {
    // Arnês tático bio-neural com LED esmeralda
    poly([[2,-13],[5,-13],[6,-5.5],[3,-5.5]],'#0f172a','#34d399',0.8);
    circ(4.2,-9.2,1.5,'#34d399');
  }

  // 6. PERNA TRASEIRA DIREITA (FRENTE — coxa musculosa, articulação e garras de rapina)
  ctx.save();
  ctx.translate(-0.5+stride*0.75,-4-kneeLift);
  ctx.fillStyle=colDark;
  ctx.beginPath();ctx.ellipse(0,0.5,4.8,6.0,-0.15,0,6.283);ctx.fill();
  ctx.fillStyle=colMid;
  ctx.beginPath();ctx.ellipse(0.4,0.2,3.6,4.6,-0.15,0,6.283);ctx.fill();
  if(tr>=3||t.paragon){
    // Joelheira blindada
    R(-1.8,2.2,4.2,2.8,colArmor);
    R(-0.8,3.0,2.2,1.2,colGlow);
  }
  R(-1.5,4.2,3.8,5.5,colDark);
  // Pata frontal com garra falciforme afiada
  poly([[-2,9.2],[4.5,9.2],[5.8,11.4],[-2.8,11.4]],'#1e293b');
  poly([[4.2,9.2],[7.2,10.4],[4.2,11.4]],'#fef3c7');
  poly([[2.0,9.5],[4.2,10.8],[2.0,11.4]],'#e2e8f0');
  ctx.restore();

  // 7. BRAÇO DIANTEIRO ARTICULADO COM GARRAS AFIADAS
  ctx.save();
  ctx.translate(6.5,-7.5+bite*1.2);
  ctx.rotate(bite*0.5-0.2);
  R(-1,-1,5.2,2.6,colDark);
  poly([[3.8,-1.2],[6.8,-0.2],[3.8,0.8]],'#fef3c7');
  poly([[3.6,0.4],[6.4,1.6],[3.6,2.2]],'#fef3c7');
  ctx.restore();

  // 8. PESCOÇO MUSCULOSO E CABEÇA ESCULPIDA DE T-REX COM MANDÍBULA DUPLA ARTICULADA
  const jawAng=Math.max(bite*0.55,roar*0.68);
  // Pescoço forte
  poly([[3,-13.5],[9,-17.5],[10,-9.5],[4,-7.5]],colMid);

  // Crânio Superior Esculpido
  ctx.save();
  ctx.translate(6.5,-15.5-(roar*2.6));
  ctx.rotate(-jawAng*0.48);
  // Formato anatômico do crânio do T-Rex (focinho alto e arcada ocular pronunciada)
  poly([[-1,-4.5],[4,-6.2],[12.5,-4.8],[13.8,-0.5],[12,1.2],[0,1.2]],colMid,colShadow,0.8);
  poly([[0,-3.8],[4,-5.2],[11.5,-4.0],[11.5,-1.2],[0,-1.2]],colLight);

  if(tr>=3||t.paragon){
    // Capacete / Visor Blindado Cyber T-Rex
    poly([[-0.5,-5.5],[5,-6.8],[9.5,-5.2],[7,-1.8],[-0.5,-2.2]],colArmor,colGlow,0.8);
  }

  // Fileira de Presas Superiores Serrilhadas
  ctx.fillStyle='#fef3c7';
  for(const tx of [3.2,5.4,7.6,9.8,11.6]){
    poly([[tx,0.8],[tx+0.9,3.6],[tx+1.8,0.8]],'#fef3c7');
  }

  // Olho Feroz de Predador / Visor Laser
  ctx.fillStyle=t.paragon?'#38bdf8':tr>=4?'#fde047':'#fef08a';
  poly([[3.5,-4.2],[7.2,-4.6],[6.8,-2.4],[3.5,-2.4]],ctx.fillStyle);
  // Pupila vertical reptiliana
  R(5.2,-4.4,1.0,1.9,'#090d16');
  // Narina
  R(11.2,-3.6,1.2,1.0,colShadow);
  ctx.restore();

  // Mandíbula Inferior Articulada + Língua
  ctx.save();
  ctx.translate(6.8,-12.2-(roar*1.4));
  ctx.rotate(jawAng*0.72);
  if(jawAng>0.12){
    // Língua carmesim visível quando a boca abre
    poly([[1,-0.5],[8,-1.2],[6,0.8],[1,0.5]],'#ef4444');
  }
  poly([[0,0],[11.5,0],[10.5,3.2],[1,3.5]],colDark,colShadow,0.7);
  // Presas Inferiores
  for(const tx of [3.8,6.2,8.5,10.2]){
    poly([[tx,0.2],[tx+0.8,-2.3],[tx+1.6,0.2]],'#fef3c7');
  }
  ctx.restore();

  // 9. EFEITO CINEMÁTICO DE RASGO DE MORDIDA & GARRAS
  if(bite>0.12){
    ctx.strokeStyle=t.paragon?'#38bdf8':'#fde047';
    ctx.lineWidth=2.4;
    ctx.beginPath();
    ctx.arc(16,-12,7+bite*4,-0.95,0.95);
    ctx.stroke();
    ctx.strokeStyle='#ef4444';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.arc(18,-12,5+bite*3,-0.75,0.75);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTower(t){
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(t.x,t.y+13,17,6.5,0,0,6.283);ctx.fill();
  // Se for Torre Direcional (dartgun), desenha linha de mira laser travada quando selecionada (ou sutil sempre)
  if(t.key==='dartgun'&&Number.isFinite(t.aimX)&&Number.isFinite(t.aimY)){
    ctx.save();
    const sel=G.selected===t;
    ctx.strokeStyle=sel?'rgba(56,189,248,.75)':'rgba(56,189,248,.18)';
    ctx.lineWidth=sel?2:1;
    ctx.setLineDash([6,5]);
    ctx.beginPath();ctx.moveTo(t.x,t.y-4);ctx.lineTo(t.aimX,t.aimY);ctx.stroke();
    ctx.setLineDash([]);
    if(sel){
      ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.8;
      ctx.beginPath();ctx.arc(t.aimX,t.aimY,10,0,6.283);ctx.stroke();
      ctx.beginPath();ctx.moveTo(t.aimX-14,t.aimY);ctx.lineTo(t.aimX+14,t.aimY);ctx.moveTo(t.aimX,t.aimY-14);ctx.lineTo(t.aimX,t.aimY+14);ctx.stroke();
    }
    ctx.restore();
  }
  // Se for Torre de Portal Tático, desenha marcador do portal de saída quando selecionada
  if(t.key==='portal'&&G.selected===t&&Number.isFinite(t.exitX)&&Number.isFinite(t.exitY)){
    ctx.save();
    ctx.strokeStyle='rgba(192,132,252,.75)';ctx.lineWidth=1.8;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.exitX,t.exitY);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='#38bdf8';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(t.exitX,t.exitY,14,0,6.283);ctx.stroke();
    ctx.restore();
  }
  // Se for uma Torre de Suporte, desenha aura tática suave e conexões com torres aliadas quando selecionada
  if(t.def.role==='support'){
    const ac=TOWER_ACCENT[t.key]||'#2be3a1';
    ctx.save();
    ctx.strokeStyle=ac;ctx.globalAlpha=.18+.08*Math.sin(G.simT*3);ctx.lineWidth=1.2;
    ctx.setLineDash([6,6]);ctx.beginPath();ctx.arc(t.x,t.y,t.s.range,0,6.283);ctx.stroke();ctx.setLineDash([]);
    if(G.selected===t&&t.key!=='cryogen'){
      ctx.globalAlpha=.45;ctx.lineWidth=1.5;
      for(const o of towers){
        if(o!==t&&dist(o.x,o.y,t.x,t.y)<=t.s.range){
          ctx.beginPath();ctx.moveTo(t.x,t.y-4);ctx.lineTo(o.x,o.y-4);ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  // Indicador sob torres que estão recebendo buff de suporte
  if(t._auraDmg||t._auraRate||t._auraRange){
    ctx.save();
    ctx.strokeStyle='#fbbf24';ctx.globalAlpha=.55+.2*Math.sin(G.simT*5);ctx.lineWidth=1.4;
    ctx.beginPath();ctx.ellipse(t.x,t.y+8,16,7,0,0,6.283);ctx.stroke();
    ctx.restore();
  }
  const pIdx=t.dominantPath;
  const ac=(t.tier>=2&&pIdx>=0&&PATH_SKIN_ACCENT[pIdx])?PATH_SKIN_ACCENT[pIdx]:(TOWER_ACCENT[t.key]||'#38bdf8');
  // Anel tematico sutil na base para diferenciar classes rapidamente no mapa e no mobile
  ctx.strokeStyle=ac;ctx.globalAlpha=t.paragon?.65:.38;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(t.x,t.y+9,17.5,7.5,0,0,6.283);ctx.stroke();ctx.globalAlpha=1;
  const gc=t.paragon?'#ffd24a':TIER_GLOW[Math.min(5,t.tier)];
  if(gc){const gs=glowSprite(gc,t.paragon?34:26,t.paragon?'66':'38');ctx.drawImage(gs,Math.round(t.x-gs.width/2),Math.round(t.y-gs.height/2));}
  drawTowerSprite(t.key,t.x,t.y,t.angle,t.recoil,t.level,t.spec,G.simT,Math.max(t.pulse||0,t.spawnFlash||0),pIdx,t.tier);
  if(t._dino)drawDinoCompanion(t);
  if(t.paragon){
    // Ascensao: anel dourado pulsante + aro tracejado giratorio + 2 orbes orbitais
    const pu=.5+.5*Math.sin(G.simT*4);
    ctx.save();ctx.strokeStyle='#f2c230';ctx.lineWidth=2;ctx.globalAlpha=.75+.25*pu;ctx.beginPath();ctx.arc(t.x,t.y+3,22,0,6.283);ctx.stroke();
    ctx.setLineDash([4,5]);ctx.lineDashOffset=-G.simT*14;ctx.globalAlpha=.45+.3*pu;ctx.strokeStyle='#fff1a8';ctx.beginPath();ctx.arc(t.x,t.y+3,26,0,6.283);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<2;i++){const oa=G.simT*3.4+i*Math.PI,ox=t.x+Math.cos(oa)*23,oy=t.y-2+Math.sin(oa)*11;ctx.fillStyle='#facc15';ctx.globalAlpha=.92;ctx.beginPath();ctx.arc(ox,oy,3,0,6.283);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(ox,oy,1.3,0,6.283);ctx.fill();}
    ctx.restore();
  }
  // Pontos de nivel sob a torre: leitura rapida da evolucao em telas pequenas
  if(!t.paragon&&t.tier>0){const n=Math.min(5,t.tier),c=TIER_GLOW[n]||'#fff';ctx.fillStyle=c;for(let i=0;i<n;i++){ctx.fillRect(Math.round(t.x-(n*4-1)/2+i*4),t.y+19,3,3);}}
  if(t.recoil>.35&&t.key!=='flame'&&t.key!=='ice'&&t.def.kind!=='support_eco'&&t.def.kind!=='support_debuff'){const fx=t.x+Math.cos(t.angle)*22,fy=t.y-4+Math.sin(t.angle)*22;ctx.fillStyle='rgba(255,225,130,'+Math.min(.85,t.recoil)+')';ctx.beginPath();ctx.arc(fx,fy,7,0,6.283);ctx.fill();}
  if(t.weak>0){ctx.fillStyle='rgba(120,220,60,'+(.22+.12*Math.sin(G.simT*10))+')';ctx.beginPath();ctx.arc(t.x,t.y,18,0,6.283);ctx.fill();R(t.x-3,t.y-26,6,6,'#a6e05a');}
  if(t.key==='ice'){ctx.strokeStyle='rgba(160,220,255,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(t.x,t.y,t.s.range,0,6.283);ctx.stroke();}
  if(t.key==='flame'&&t.heat>.05){R(t.x-8,t.y-26,16,3,'#222');R(t.x-8,t.y-26,Math.round(16*t.heat),3,'#ff7a20');}
  if(COOP.active&&typeof t.ownerSlot==='number'){
    ctx.save();
    const pCol=(window.QZ_COOP&&typeof window.QZ_COOP.getSectorColor==='function')?window.QZ_COOP.getSectorColor(t.ownerSlot):(t.ownerSlot===0?'#38bdf8':'#4ade80');
    ctx.fillStyle='rgba(15,23,42,0.85)';ctx.strokeStyle=pCol;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.rect(t.x+10,t.y-22,17,13);ctx.fill();ctx.stroke();
    ctx.fillStyle=pCol;ctx.font='bold 9px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('P'+(t.ownerSlot+1),t.x+18.5,t.y-15);
    ctx.restore();
  }
}
function drawProj(p){
  if(p.x<-VIEW.padX-30||p.x>W+VIEW.padX+30||p.y<-VIEW.padY-60||p.y>H+VIEW.padY+30)return;
  if(p.kind==='shell'){
    R(p.x-3,p.y-p.hgt-3,6,6,'#222');R(p.x-2,p.y-p.hgt-2,4,4,'#f97316');R(p.x-1,p.y-p.hgt-1,2,2,'#fef08a');
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(p.x,p.y,4.5,2.2,0,0,6.283);ctx.fill();
    ctx.strokeStyle='rgba(255,80,40,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.tx,p.ty,p.splash,0,6.283);ctx.stroke();
  } else if(p.kind==='glob'){
    ctx.fillStyle='rgba(132,204,22,.3)';ctx.beginPath();ctx.arc(p.x,p.y,6.5,0,6.283);ctx.fill();
    ctx.fillStyle='#84cc16';ctx.beginPath();ctx.arc(p.x,p.y,4,0,6.283);ctx.fill();R(p.x-2,p.y-2,2,2,'#ecfccb');
  } else {
    const l=p.len||7,sp=Math.hypot(p.vx,p.vy)||1,tx=p.x-p.vx/sp*l,ty=p.y-p.vy/sp*l;
    ctx.strokeStyle=p.color;ctx.lineWidth=p.r>=4?4.5:2.6;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=p.r>=4?1.5:0.9;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx/sp*(l*.65),p.y-p.vy/sp*(l*.65));ctx.stroke();
  }
}
function drawFX(){
  // Obstáculos destrutíveis mediante pagamento em moedas
  for(const ob of obstacles){
    if(ob.cleared)continue;
    ctx.save();
    ctx.translate(ob.x,ob.y);
    ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(2,5,ob.r+2,ob.r*.65,0,0,6.283);ctx.fill();
    if(ob.kind==='wagon'){
      R(-16,-10,32,20,'#1e293b');R(-14,-8,28,16,'#334155');
      R(-12,-4,24,4,'#38bdf8');R(-10,3,20,3,'#facc15');
    } else if(ob.kind==='crate'){
      R(-14,-11,28,22,'#78350f');R(-12,-9,24,18,'#b45309');
      R(-12,-2,24,4,'#facc15');
    } else {
      ctx.fillStyle='#475569';ctx.beginPath();ctx.arc(0,0,ob.r-2,0,6.283);ctx.fill();
      R(-9,-6,18,12,'#64748b');R(-6,-3,12,4,'#f59e0b');
    }
    if(G.selectedObs===ob){
      ctx.strokeStyle='#fbbf24';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,ob.r+4,0,6.283);ctx.stroke();
    }
    ctx.fillStyle='rgba(15,23,42,.88)';ctx.fillRect(-20,ob.r-4,40,12);
    ctx.fillStyle='#fde047';ctx.font='bold 9px "Segoe UI",sans-serif';ctx.textAlign='center';
    ctx.fillText('💥 '+ob.cost+'●',0,ob.r+5);
    ctx.restore();
  }
  for(const hz of hazards){
    const a=Math.min(1,hz.life/1.2)*(hz.kind==='zt'?.28:.34);
    ctx.fillStyle=hz.kind==='zt'?'rgba(120,200,50,'+a+')':'rgba(80,220,60,'+a+')';
    ctx.beginPath();ctx.ellipse(hz.x,hz.y,hz.r,hz.r*.75,0,0,6.283);ctx.fill();
  }
  for(const a of areas){ctx.strokeStyle='rgba(255,60,40,'+(.4+.3*Math.sin(G.simT*8))+')';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,6.283);ctx.stroke();ctx.setLineDash([]);}
  // Portais táticos ativos na pista
  for(const pt of portals){
    ctx.save();
    const al=Math.min(1,pt.life*2);
    ctx.globalAlpha=al;
    for(const [px,py,col] of [[pt.inX,pt.inY,'#c084fc'],[pt.outX,pt.outY,'#38bdf8']]){
      ctx.strokeStyle=col;ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(px,py,18,11,G.simT*3,0,6.283);ctx.stroke();
      ctx.fillStyle=col+'44';ctx.fill();
    }
    ctx.restore();
  }
  // Minas terrestres metálicas táticas com luzes piscantes de alerta (vermelho/amarelo) e animação de ejeção
  for(const m of mines){
    const st=m.stacks||1;
    let mx=m.x, my=m.y;
    if(m.flyT>0&&Number.isFinite(m.sx)&&Number.isFinite(m.sy)){
      const f=m.flyT/(m.maxFly||0.22);
      mx=m.x*(1-f)+m.sx*f;
      my=m.y*(1-f)+m.sy*f-Math.sin(f*Math.PI)*18;
    }
    ctx.save();
    ctx.translate(Math.round(mx),Math.round(my));
    // Sombra no ladrilho da pista
    ctx.fillStyle='rgba(0,0,0,.42)';
    ctx.beginPath();ctx.ellipse(0,2,8.5,4.2,0,0,6.283);ctx.fill();
    // Base metálica octogonal/circular com garras de fixação
    R(-7,-2,14,4,'#0f172a');
    R(-2,-5,4,10,'#0f172a');
    ctx.fillStyle='#1e293b';ctx.strokeStyle='#64748b';ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(0,0,7.2,4.6,0,0,6.283);ctx.fill();ctx.stroke();
    // Placa de pressão superior de titânio
    ctx.fillStyle='#475569';
    ctx.beginPath();ctx.ellipse(0,-1.2,5,3,0,0,6.283);ctx.fill();
    // Luz de alerta piscante (vermelho / amarelo) + halo luminoso
    const blink=(((G.simT*6)+m.x*0.1)|0)%2===0;
    const ledCol=blink?'#ef4444':'#facc15';
    ctx.fillStyle=blink?'rgba(239,68,68,.35)':'rgba(250,204,21,.35)';
    ctx.beginPath();ctx.arc(0,-1.8,4.2,0,6.283);ctx.fill();
    ctx.fillStyle=ledCol;
    ctx.beginPath();ctx.arc(0,-1.8,2,0,6.283);ctx.fill();
    if(st>1){
      ctx.fillStyle='rgba(15,23,42,.88)';ctx.fillRect(-7,4,14,9);
      ctx.fillStyle='#facc15';ctx.font='bold 8.5px monospace';ctx.textAlign='center';
      ctx.fillText('x'+st,0,11);ctx.textAlign='left';
    }
    ctx.restore();
  }
  // Aliados Bio-Raptores invocados na pista com animação fluida de corrida, cauda em S, garras falciformes e mordida
  for(const a of allies){
    ctx.save();ctx.translate(Math.round(a.x),Math.round(a.y));
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,4,9,3.4,0,0,6.283);ctx.fill();
    const wph=a.walkT||G.simT*14;
    const st=Math.sin(wph)*2.8;
    const bob=Math.abs(Math.cos(wph))*1.2;
    ctx.scale((a.face||1)*1.18,1.18);
    ctx.translate(0,-bob);
    // Cauda longa equilibradora de Velociraptor
    ctx.fillStyle='#14532d';
    ctx.beginPath();ctx.moveTo(-3,-5);ctx.quadraticCurveTo(-11,-7+st*0.4,-16,-9+st*0.7);ctx.lineTo(-11,-3+st*0.3);ctx.closePath();ctx.fill();
    // Pernas ágeis com garra falciforme
    R(-3-st*0.6,-2,2.6,5,'#052e16');
    R(0.5+st*0.6,-2,2.8,5.2,'#15803d');
    R(1+st*0.6,2.8,3.6,1.4,'#fef3c7');
    // Torso aerodinâmico, ventre claro e sela bio-neural
    ctx.fillStyle='#16a34a';ctx.beginPath();ctx.ellipse(0,-5.8,7.2,4.2,-0.16,0,6.283);ctx.fill();
    ctx.fillStyle='#86efac';ctx.beginPath();ctx.ellipse(1,-4.2,4.8,2.0,-0.12,0,6.283);ctx.fill();
    R(-2.5,-9.2,4.8,2.4,'#0f172a');R(-1.2,-8.6,2.4,1.2,'#34d399');
    // Crista de predador, crânio alongado e mandíbula de mordida
    const bt=(a.biteT||0)*2.4;
    R(1,-12.5,2,2,'#a3e635');R(3.2,-13,2,2,'#a3e635');
    R(2.5+bt*0.5,-11.5,7,4.2,'#22c55e');
    R(5.5+bt*0.5,-10.6,2.2,1.5,'#fef08a');
    R(3.5+bt*0.5,-7.2+bt*0.3,6,1.8,'#14532d');
    R(6.5+bt*0.5,-7.4,1.4,1.6,'#fef3c7');
    ctx.restore();
  }
  for(const b of bombs){
    const f=b.wait>0?0:b.fall/.55;
    ctx.strokeStyle='rgba(255,70,40,.8)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(b.x,b.y,8+(b.wait>0?0:f*40),0,6.283);ctx.stroke();
    if(b.wait<=0){const by=b.y-(1-f)*320;R(b.x-3,by-8,6,10,'#222');R(b.x-3,by-12,6,4,'#c33');R(b.x-1,by-16,2,4,'#ff9');}
  }
}
function drawEffects(){
  for(const r of rings){const k=1-r.life/r.max;ctx.globalAlpha=Math.max(0,r.life/r.max);ctx.strokeStyle=r.c;ctx.lineWidth=r.lw;ctx.beginPath();ctx.arc(r.x,r.y,r.r0+(r.r1-r.r0)*k,0,6.283);ctx.stroke();}
  ctx.globalAlpha=1;
  for(const b of bolts){ctx.strokeStyle='#bff4ff';ctx.lineWidth=3;ctx.globalAlpha=Math.min(1,b.life*8);ctx.beginPath();ctx.moveTo(b.pts[0].x,b.pts[0].y);for(let i=1;i<b.pts.length;i++)ctx.lineTo(b.pts[i].x,b.pts[i].y);ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();}
  ctx.globalAlpha=1;
  for(const p of parts){if(p.x<-VIEW.padX-20||p.x>W+VIEW.padX+20||p.y<-VIEW.padY-20||p.y>H+VIEW.padY+20)continue;ctx.globalAlpha=Math.max(0,Math.min(1,p.life/p.max*1.6));R(p.x,p.y,p.s,p.s,p.c);}
  ctx.globalAlpha=1;
  ctx.textAlign='center';
  for(const p of popups){
    ctx.globalAlpha=Math.min(1,p.life/p.max*1.5);ctx.font=(p.big?'bold 16px':'bold 12px')+' "Courier New",monospace';
    if(!IS_MOBILE){ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.strokeText(p.text,p.x,p.y);}
    else{ctx.fillStyle='#000';ctx.fillText(p.text,p.x+1,p.y+1);}
    ctx.fillStyle=p.c;ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;ctx.textAlign='left';
  // Divisão de Setores Co-op (2 a 4 jogadores) e Marcadores Visuais de Alerta na Pista
  if(COOP.active){
    if(window.QZ_COOP&&typeof window.QZ_COOP.drawSectorLines==='function'){
      window.QZ_COOP.drawSectorLines(ctx,W,H,COOP.maxPlayers,COOP.division,COOP.mySlot,!!G.placing);
    }else if(COOP.division!=='free'){
      ctx.save();
      ctx.strokeStyle='rgba(56,189,248,0.32)';
      ctx.lineWidth=1.5;
      ctx.setLineDash([7,7]);
      if(COOP.maxPlayers===2){
        ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();
      }else if(COOP.maxPlayers===3){
        ctx.beginPath();ctx.moveTo(W/3,0);ctx.lineTo(W/3,H);ctx.moveTo((W*2)/3,0);ctx.lineTo((W*2)/3,H);ctx.stroke();
      }else{
        ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  if(COOP.pings&&COOP.pings.length){
    ctx.save();
    for(const pg of COOP.pings){
      const al=Math.min(1,pg.life/1.2);
      const pulseR=12+((G.simT*38)%26);
      ctx.globalAlpha=al;
      ctx.strokeStyle=pg.color||'#38bdf8';
      ctx.lineWidth=2.2;
      ctx.beginPath();ctx.arc(pg.x,pg.y,pulseR,0,6.283);ctx.stroke();
      ctx.fillStyle='rgba(15,23,42,0.88)';
      ctx.fillRect(pg.x-44,pg.y-26,88,16);
      ctx.strokeRect(pg.x-44,pg.y-26,88,16);
      ctx.fillStyle='#ffffff';
      ctx.font='bold 10px "Segoe UI",sans-serif';
      ctx.textAlign='center';
      ctx.fillText(pg.label||'⚠ ALERTA',pg.x,pg.y-14);
    }
    ctx.restore();
  }
}
function validSpot(x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return 'Coordenada inválida';
  if(x<CFG.towerR+2||x>W-CFG.towerR-2||y<CFG.towerR+2||y>H-CFG.towerR-2)return 'Fora do mapa';
  if(distToPath(x,y)<CFG.pathClear)return 'Não pode construir no caminho';
  if(x>845&&y>180&&y<320)return 'Muito perto da base';
  for(const [bx,by,bw,bh] of (MAPS[activeMap].blocked||[]))if(x>bx-14&&x<bx+bw+14&&y>by-14&&y<by+bh+14)return 'Terreno bloqueado (água)';
  for(const ob of obstacles)if(!ob.cleared&&dist(ob.x,ob.y,x,y)<ob.r+CFG.towerR)return 'Obstáculo no terreno (clique para demolir)';
  for(const t of towers)if(dist(t.x,t.y,x,y)<CFG.towerR*2)return 'Sobreposição com outra torre';
  if(COOP.active&&COOP.division!=='free'&&window.QZ_COOP&&typeof window.QZ_COOP.getPointSectorOwner==='function'){
    const ownerSlot=window.QZ_COOP.getPointSectorOwner(x,y,W,H,COOP.maxPlayers,COOP.division);
    if(ownerSlot!==(COOP.mySlot||0)){
      const secName=(typeof window.QZ_COOP.getSectorName==='function')?window.QZ_COOP.getSectorName(ownerSlot,COOP.maxPlayers,COOP.division):('P'+(ownerSlot+1));
      return '⛔ FORA DO SEU SETOR ('+secName+')';
    }
  }
  return null;
}
function drawLoSShadows(tx,ty,range,towerObj){
  const btd=window.QZ_BTD6_TOWERS;
  if(!btd||typeof btd.isTowerAffectedByLoS!=='function'||typeof btd.computeShadowCones!=='function')return;
  if(!btd.isTowerAffectedByLoS(towerObj))return;
  const cones=btd.computeShadowCones(tx,ty,range,obstacles);
  if(!cones||!cones.length)return;
  ctx.save();
  for(let i=0;i<cones.length;i++){
    const c=cones[i];
    const r0=Math.max(12,c.dist);
    const r1=Math.min(720,Math.max(r0+80,c.maxR));
    // Cone de sombra 2D projetado atrás da barreira tática
    ctx.fillStyle='rgba(239, 68, 68, 0.22)';
    ctx.beginPath();
    ctx.arc(tx,ty,r0,c.a1,c.a2,false);
    ctx.arc(tx,ty,r1,c.a2,c.a1,true);
    ctx.closePath();
    ctx.fill();
    // Linhas tangentes tracejadas do bloqueio de visão
    ctx.strokeStyle='rgba(248, 113, 113, 0.78)';
    ctx.lineWidth=1.5;
    ctx.setLineDash([5,4]);
    ctx.beginPath();
    ctx.moveTo(tx+Math.cos(c.a1)*r0,ty+Math.sin(c.a1)*r0);
    ctx.lineTo(tx+Math.cos(c.a1)*r1,ty+Math.sin(c.a1)*r1);
    ctx.moveTo(tx+Math.cos(c.a2)*r0,ty+Math.sin(c.a2)*r0);
    ctx.lineTo(tx+Math.cos(c.a2)*r1,ty+Math.sin(c.a2)*r1);
    ctx.stroke();
    ctx.setLineDash([]);
    // Destaque na barreira que está bloqueando a visão
    ctx.strokeStyle='#ef4444';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(c.obs.x,c.obs.y,(c.obs.r||18)+3,0,6.283);
    ctx.stroke();
    ctx.font='bold 9px "Courier New",monospace';
    ctx.textAlign='center';
    ctx.fillStyle='#fca5a5';
    ctx.fillText('🚫 VISÃO BLOQUEADA',c.obs.x,c.obs.y-(c.obs.r||18)-6);
  }
  ctx.restore();
}

function drawPreview(){
  if(!M.in)return;
  if(G.placing){
    const d=TOWERS[G.placing],bad=validSpot(M.x,M.y),ok=!bad;
    const rangeR=d.base.range*(1+getTechBonus('tower_range')*0.03);
    // 1. Sombra de Linha de Visão em tempo real (Sniper / Torre Direcional / Balísticas)
    drawLoSShadows(M.x,M.y,rangeR,{key:G.placing,levels:[0,0,0],s:d.base});
    // 2. Círculo de alcance em tempo real (Verde/Ciano = válido, Vermelho = proibido)
    ctx.fillStyle=ok?'rgba(16, 185, 129, 0.18)':'rgba(239, 68, 68, 0.22)';
    ctx.strokeStyle=ok?'rgba(56, 189, 248, 0.92)':'rgba(248, 113, 113, 0.92)';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(M.x,M.y,rangeR,0,6.283);ctx.fill();ctx.stroke();
    // 3. Linha de Laser em Tempo Real para a Torre Direcional (dartgun)
    let previewAng=-0.6;
    if(G.placing==='dartgun'){
      const np=nearestPathProg(M.x,M.y);pathPos(np.d,_pp);
      previewAng=Math.atan2(_pp.y-M.y,_pp.x-M.x);
      const btd=window.QZ_BTD6_TOWERS;
      const hit=btd&&typeof btd.raycastFirstBarrierHit==='function'
        ?btd.raycastFirstBarrierHit(M.x,M.y,previewAng,380,obstacles,{key:'dartgun',levels:[0,0,0],s:d.base})
        :null;
      const endX=hit?hit.x:(M.x+Math.cos(previewAng)*360);
      const endY=hit?hit.y:(M.y+Math.sin(previewAng)*360);
      ctx.save();
      ctx.strokeStyle=hit?'#ef4444':'#38bdf8';
      ctx.lineWidth=2.2;
      ctx.setLineDash([7,4]);
      ctx.beginPath();ctx.moveTo(M.x,M.y);ctx.lineTo(endX,endY);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=hit?'#ef4444':'#38bdf8';
      ctx.beginPath();ctx.arc(endX,endY,5,0,6.283);ctx.fill();
      ctx.restore();
    }
    // 4. Raio de Patrulha em Tempo Real para o Domador Jurássico (dino)
    if(G.placing==='dino'){
      const np=nearestPathProg(M.x,M.y);pathPos(np.d,_pp);
      ctx.save();
      ctx.strokeStyle='rgba(74, 222, 128, 0.75)';
      ctx.fillStyle='rgba(74, 222, 128, 0.16)';
      ctx.lineWidth=1.8;
      ctx.setLineDash([6,4]);
      ctx.beginPath();ctx.moveTo(M.x,M.y);ctx.lineTo(_pp.x,_pp.y);ctx.stroke();
      ctx.beginPath();ctx.arc(_pp.x,_pp.y,90,0,6.283);ctx.fill();ctx.stroke();
      ctx.setLineDash([]);
      ctx.font='bold 10px "Courier New",monospace';ctx.textAlign='center';ctx.fillStyle='#86efac';
      ctx.fillText('🦖 RAIO DE PATRULHA',_pp.x,_pp.y-4);
      ctx.restore();
    }
    ctx.globalAlpha=.88;drawTowerSprite(G.placing,M.x,M.y,previewAng,0,1,-1,G.anim);ctx.globalAlpha=1;
    ctx.strokeStyle=ok?'#34d399':'#ef4444';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(M.x,M.y,CFG.towerR+2,0,6.283);ctx.stroke();
    if(bad){ctx.fillStyle='#ff9080';ctx.font='bold 12px "Courier New",monospace';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.strokeText(bad,M.x,M.y-26);ctx.fillText(bad,M.x,M.y-26);ctx.textAlign='left';}
  } else if(G.targeting==='aim'&&G.selected){
    ctx.strokeStyle='#38bdf8';ctx.lineWidth=2;ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.moveTo(G.selected.x,G.selected.y-4);ctx.lineTo(M.x,M.y);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(M.x,M.y,12,0,6.283);ctx.stroke();
  } else if(G.targeting==='portal_exit'&&G.selected){
    const np=nearestPathProg(M.x,M.y);pathPos(np.d,_pp);
    ctx.strokeStyle='#c084fc';ctx.lineWidth=2;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(G.selected.x,G.selected.y);ctx.lineTo(_pp.x,_pp.y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(192,132,252,.28)';ctx.beginPath();ctx.arc(_pp.x,_pp.y,16,0,6.283);ctx.fill();ctx.stroke();
  } else if(G.targeting){
    const k=G.targeting,P=POWERS[k];
    if(!P)return;
    if(k==='mines'){
      const p=nearestPathProg(M.x,M.y);ctx.strokeStyle=p.dist<70?'rgba(255,220,60,.9)':'rgba(255,80,80,.7)';ctx.lineWidth=8;ctx.beginPath();
      for(let d=Math.max(0,p.d-100);d<=Math.min(PATH_LEN,p.d+100);d+=8){pathPos(d,_pp);if(d===Math.max(0,p.d-100))ctx.moveTo(_pp.x,_pp.y);else ctx.lineTo(_pp.x,_pp.y);}
      ctx.stroke();
    } else {
      ctx.fillStyle=k==='airstrike'?'rgba(255,60,40,.15)':'rgba(80,220,60,.18)';ctx.strokeStyle=k==='airstrike'?'#ff5a40':'#7fe03a';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(M.x,M.y,P.r,0,6.283);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(M.x-8,M.y);ctx.lineTo(M.x+8,M.y);ctx.moveTo(M.x,M.y-8);ctx.lineTo(M.x,M.y+8);ctx.stroke();
    }
  }
}
// Cache off-screen para o brilho radial da base (evita recriar RadialGradient a cada frame no mobile)
const BASE_GLOW_CACHE={};
function getBaseGlowSprite(lv){
  if(BASE_GLOW_CACHE[lv])return BASE_GLOW_CACHE[lv];
  const cv=document.createElement('canvas');cv.width=220;cv.height=300;
  const g=cv.getContext('2d');
  const pc=lv==='ok'?'43,227,161':lv==='mid'?'255,176,32':'255,74,61';
  const pg=g.createRadialGradient(150,150,10,150,150,150);
  pg.addColorStop(0,'rgba('+pc+',0.22)');
  pg.addColorStop(1,'rgba('+pc+',0)');
  g.fillStyle=pg;g.fillRect(0,0,220,300);
  return BASE_GLOW_CACHE[lv]=cv;
}

const _renderZombies=[];
const VIEW={scale:1,ox:0,oy:0,cssW:W,cssH:H,padX:0,padY:0};
function render(){
  const c=$('game'),s=VIEW.scale*CANVAS_DPR;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
  ctx.setTransform(s,0,0,s,VIEW.ox*CANVAS_DPR,VIEW.oy*CANVAS_DPR);
  ctx.imageSmoothingEnabled=false;
  if(IS_MOBILE)ctx.shadowBlur=0;
  ctx.save();
  if(G.shake>0)ctx.translate((rand(-G.shake,G.shake))|0,(rand(-G.shake,G.shake))|0);
  // Limpa e estiliza margens táticas em telas ultra-wide / widescreen sem distorções, repetições ou cortes
  if(VIEW.padX>0){
    ctx.fillStyle='#070b14';
    ctx.fillRect(-VIEW.padX-4,-VIEW.padY-4,VIEW.padX+4,H+VIEW.padY*2+8);
    ctx.fillRect(W,-VIEW.padY-4,VIEW.padX+4,H+VIEW.padY*2+8);
    ctx.fillStyle='rgba(30,41,59,0.7)';
    ctx.fillRect(-1,0,1,H);
    ctx.fillRect(W,0,1,H);
  }
  if(VIEW.padY>0){
    ctx.fillStyle='#070b14';
    ctx.fillRect(-VIEW.padX-4,-VIEW.padY-4,W+VIEW.padX*2+8,VIEW.padY+4);
    ctx.fillRect(-VIEW.padX-4,H,W+VIEW.padX*2+8,VIEW.padY+4);
    ctx.fillStyle='rgba(30,41,59,0.7)';
    ctx.fillRect(0,-1,W,1);
    ctx.fillRect(0,H,W,1);
  }
  ctx.drawImage(BG,0,0);
  if(G.mode!=='menu'){
    // barra de vida da base usando sprite pré-renderizado em off-screen canvas
    const f=G.life/CFG.baseLife;
    const lv=f>.5?'ok':f>.25?'mid':'low';
    const bgs=getBaseGlowSprite(lv);
    ctx.globalAlpha=.55+.35*Math.sin(G.simT*(f>.5?2:f>.25?4:8));
    ctx.drawImage(bgs,730,120);
    ctx.globalAlpha=1;
    R(890,194,52,6,'#000');R(891,195,Math.round(50*f),4,f>.5?'#5fc030':f>.25?'#e0b020':'#d03020');
  }
  drawFX();
  if(callinState.barricades.length>0){
    ctx.save();
    for(const b of callinState.barricades){
      const a=Math.min(1,b.duration/1.5);
      ctx.globalAlpha=a*0.35;
      ctx.fillStyle='#38bdf8';
      ctx.beginPath();ctx.arc(b.x,b.y,55,0,6.283);ctx.fill();
      ctx.globalAlpha=a*0.9;
      ctx.lineWidth=2;
      ctx.strokeStyle=(Math.floor(G.simT*12)%2===0)?'#38bdf8':'#c084fc';
      ctx.stroke();
    }
    ctx.restore();
  }
  if(callinState.activeOverclock>0){
    ctx.save();
    ctx.lineWidth=1.5;
    ctx.strokeStyle='rgba(56, 189, 248, 0.7)';
    for(const t of towers){
      ctx.beginPath();
      ctx.arc(t.x,t.y,24+Math.sin(G.simT*8)*3,0,6.283);
      ctx.stroke();
    }
    ctx.restore();
  }
  if(G.selected){
    drawLoSShadows(G.selected.x,G.selected.y,G.selected.s.range,G.selected);
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.strokeStyle='rgba(39,201,255,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(G.selected.x,G.selected.y,G.selected.s.range,0,6.283);ctx.fill();ctx.stroke();
  }
  for(const t of towers)drawTower(t);
  if(G.selected){ctx.strokeStyle='#27c9ff';ctx.shadowColor='#27c9ff';ctx.shadowBlur=IS_MOBILE?0:10;ctx.lineWidth=2;ctx.beginPath();ctx.arc(G.selected.x,G.selected.y,19,0,6.283);ctx.stroke();ctx.shadowBlur=0;}
  _renderZombies.length=zombies.length;
  for(let i=0;i<zombies.length;i++)_renderZombies[i]=zombies[i];
  _renderZombies.sort((a,b)=>a.y-b.y);   // buffer reutilizável: evita alocar array por frame
  for(let i=0;i<_renderZombies.length;i++)drawZombie(_renderZombies[i]);
  for(const p of projs)drawProj(p);
  drawEffects();
  drawPreview();
  drawWeather();
  ctx.restore();
  if(G.flash>0){ctx.globalAlpha=Math.min(.45,G.flash);ctx.fillStyle=G.flashCol;ctx.fillRect(-VIEW.padX,-VIEW.padY,W+VIEW.padX*2,H+VIEW.padY*2);ctx.globalAlpha=1;}
}
const PORTRAIT_CACHE={};
function makeIcon(key,lvl,spec,pathIdx,tier,paragon){
  const lv=lvl||2, sp=spec!==undefined?spec:-1, pi=pathIdx!==undefined?pathIdx:-1, tr=tier||0, pg=paragon?1:0;
  const ck=key+'|'+lv+'|'+sp+'|'+pi+'|'+tr+'|'+pg;
  if(PORTRAIT_CACHE[ck])return PORTRAIT_CACHE[ck];
  const c=document.createElement('canvas');c.width=c.height=64;const old=ctx;ctx=c.getContext('2d');
  const ac=pg?'#fbbf24':(tr>=2&&pi>=0&&PATH_SKIN_ACCENT[pi])?PATH_SKIN_ACCENT[pi]:(TOWER_ACCENT[key]||'#38bdf8');
  const gr=ctx.createRadialGradient(32,34,4,32,34,29);
  gr.addColorStop(0,ac+(tr>=3||pg?'77':'55'));gr.addColorStop(1,ac+'00');
  ctx.fillStyle=gr;ctx.fillRect(0,0,64,64);
  if(tr>0||pg){
    ctx.strokeStyle=ac;ctx.lineWidth=pg?2.6:(tr>=4?2:1.4);
    ctx.beginPath();ctx.arc(32,34,27,0,6.283);ctx.stroke();
    if(tr>=3||pg){
      ctx.save();ctx.setLineDash([4,3]);ctx.strokeStyle=pg?'#fef08a':'#ffffff';ctx.globalAlpha=0.55;
      ctx.beginPath();ctx.arc(32,34,29.5,0,6.283);ctx.stroke();ctx.restore();
    }
  }
  drawTowerSprite(key,32,38,-.45,0,lv,sp,0.8,key==='dino'?(tr>=1?0.75:0.25):0,pi,tr);
  // Emblema visual evoluído no retrato para Domador Jurássico (cabeça do Dinossauro evoluída) e Usina de Minas
  if(key==='dino'){
    const dCol=pg?'#dc2626':tr>=4?'#ef4444':tr>=2?'#f97316':'#16a34a';
    const dEye=pg?'#38bdf8':'#fef08a';
    ctx.fillStyle='#0f172a';ctx.beginPath();ctx.arc(14,14,10,0,6.283);ctx.fill();
    ctx.strokeStyle=dCol;ctx.lineWidth=1.4;ctx.stroke();
    ctx.fillStyle=dCol;ctx.fillRect(9,9,10,6);
    if(tr>=2||pg){ctx.fillStyle='#334155';ctx.fillRect(9,7.5,6,2);}
    ctx.fillStyle=dEye;ctx.fillRect(14,10.5,2.5,1.8);
    ctx.fillStyle='#fef3c7';ctx.fillRect(12,15,1.5,2);ctx.fillRect(15.5,15,1.5,2);
  } else if(key==='minefactory'){
    ctx.fillStyle='#0f172a';ctx.beginPath();ctx.arc(14,14,9.5,0,6.283);ctx.fill();
    ctx.strokeStyle='#facc15';ctx.lineWidth=1.3;ctx.stroke();
    ctx.fillStyle='#475569';ctx.beginPath();ctx.ellipse(14,14.5,5.5,3.5,0,0,6.283);ctx.fill();
    ctx.fillStyle=tr>=3?'#ef4444':'#facc15';ctx.beginPath();ctx.arc(14,13.5,2.2,0,6.283);ctx.fill();
  }
  ctx=old;
  return PORTRAIT_CACHE[ck]=c.toDataURL();
}
function getTowerPortrait(t){
  if(!t)return '';
  const key=t.key, lv=t.level||2, sp=t.spec!==undefined?t.spec:-1, pi=t.dominantPath, tr=t.tier||0, pg=t.paragon?1:0;
  const ck='wide|'+key+'|'+lv+'|'+sp+'|'+pi+'|'+tr+'|'+pg;
  if(PORTRAIT_CACHE[ck])return PORTRAIT_CACHE[ck];
  const c=document.createElement('canvas');c.width=120;c.height=84;const old=ctx;ctx=c.getContext('2d');
  const ac=pg?'#fbbf24':(tr>=2&&pi>=0&&PATH_SKIN_ACCENT[pi])?PATH_SKIN_ACCENT[pi]:(TOWER_ACCENT[key]||'#38bdf8');
  // Fundo tático da moldura do retrato estilo BTD6
  const bg=ctx.createLinearGradient(0,0,120,84);
  bg.addColorStop(0,'#090e1a');bg.addColorStop(0.55,'#111c30');bg.addColorStop(1,'#090d16');
  ctx.fillStyle=bg;ctx.fillRect(0,0,120,84);
  const gr=ctx.createRadialGradient(46,44,4,46,44,44);
  gr.addColorStop(0,ac+(tr>=3||pg?'66':'44'));gr.addColorStop(1,ac+'00');
  ctx.fillStyle=gr;ctx.fillRect(0,0,120,84);
  // Grade tecnológica sutil de fundo
  ctx.strokeStyle='rgba(148,163,184,0.1)';ctx.lineWidth=1;
  for(let gx=16;gx<120;gx+=20){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,84);ctx.stroke();}
  for(let gy=16;gy<84;gy+=20){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(120,gy);ctx.stroke();}
  // Halo de evolução da torre
  if(tr>0||pg){
    ctx.strokeStyle=ac;ctx.lineWidth=pg?2.6:(tr>=4?2:1.4);
    ctx.beginPath();ctx.arc(44,46,28,0,6.283);ctx.stroke();
    if(tr>=3||pg){
      ctx.save();ctx.setLineDash([4,3]);ctx.strokeStyle=pg?'#fef08a':'#ffffff';ctx.globalAlpha=0.55;
      ctx.beginPath();ctx.arc(44,46,32,0,6.283);ctx.stroke();ctx.restore();
    }
  }
  const hasCompanion=(key==='dino'||key==='minefactory');
  drawTowerSprite(key,hasCompanion?38:60,48,-.38,0,lv,sp,0.8,key==='dino'?(tr>=1?0.85:0.35):0,pi,tr);
  // No Domador Jurássico, desenha o Dinossauro Alfa gigante e esculpido ao lado da torre dentro do retrato
  if(key==='dino'){
    ctx.save();ctx.translate(82,62);
    const sc=1.28+Math.min(0.32,tr*0.06);
    ctx.scale(-sc,sc);
    const colShadow=pg?'#451a03':tr>=4?'#450a0a':tr>=2?'#431407':'#052e16';
    const colDark=pg?'#92400e':tr>=4?'#991b1b':tr>=2?'#9a3412':'#14532d';
    const colMid=pg?'#d97706':tr>=4?'#dc2626':tr>=2?'#ea580c':'#15803d';
    const colLight=pg?'#fbbf24':tr>=4?'#f87171':tr>=2?'#fb923c':'#22c55e';
    const colCrest=pg?'#38bdf8':tr>=4?'#fde047':tr>=2?'#facc15':'#a3e635';
    const colGlow=pg?'#38bdf8':tr>=4?'#38bdf8':tr>=2?'#facc15':'#34d399';
    // Cauda longa curvada
    ctx.fillStyle=colDark;ctx.beginPath();ctx.moveTo(-4,-8);ctx.quadraticCurveTo(-14,-11,-21,-13);ctx.lineTo(-14,-3);ctx.closePath();ctx.fill();
    // Pernas musculosas e garras
    R(-4,-4,3.8,8,colShadow);R(0,-4,4.2,8.5,colMid);
    R(-1,4,5.5,2.2,'#0f172a');
    // Torso robusto e crista dorsal
    ctx.fillStyle=colDark;ctx.beginPath();ctx.ellipse(-1,-8,11.5,6.8,-0.16,0,6.283);ctx.fill();
    ctx.fillStyle=colMid;ctx.beginPath();ctx.ellipse(0,-7.8,10,5.6,-0.16,0,6.283);ctx.fill();
    ctx.fillStyle=colLight;ctx.beginPath();ctx.ellipse(1.5,-5.2,7,2.6,-0.12,0,6.283);ctx.fill();
    if(tr>=2||pg){
      R(-5,-11.5,9,5.5,'#1e293b');
      R(-2,-9.5,4,2.2,colGlow);
    }
    for(let i=0;i<5;i++)R(-11+i*3.4,-13-i*0.4,2.4,2.6,colCrest);
    // Crânio esculpido de T-Rex + presas + olho de predador
    ctx.fillStyle=colMid;ctx.fillRect(3,-18.5,12,6.2);
    if(tr>=3||pg){R(3,-19.8,8.5,2.4,'#1e293b');R(5,-19,4,1.2,colGlow);}
    ctx.fillStyle='#fef3c7';
    for(const tx of [6,8.5,11,13.2])ctx.fillRect(tx,-12.3,1.4,2.6);
    ctx.fillStyle=pg?'#38bdf8':'#fef08a';ctx.fillRect(7.5,-16.8,3,2);
    ctx.fillStyle='#090d16';ctx.fillRect(8.6,-16.8,1,2);
    ctx.fillStyle=colDark;ctx.fillRect(3.5,-10.2,10.5,3);
    ctx.restore();
  } else if(key==='minefactory'){
    // Na Usina de Minas, desenha as minas metálicas táticas com luzes vermelho/amarelo ao lado
    for(const [mx,my,led] of [[84,42,'#ef4444'],[96,56,'#facc15'],[76,58,'#ef4444']]){
      ctx.save();ctx.translate(mx,my);
      R(-7,-2,14,4,'#0f172a');R(-2,-5,4,10,'#0f172a');
      ctx.fillStyle='#1e293b';ctx.strokeStyle='#94a3b8';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,7.5,4.8,0,0,6.283);ctx.fill();ctx.stroke();
      ctx.fillStyle='#475569';ctx.beginPath();ctx.ellipse(0,-1.2,5,3,0,0,6.283);ctx.fill();
      ctx.fillStyle=led;ctx.beginPath();ctx.arc(0,-1.8,2.2,0,6.283);ctx.fill();
      ctx.restore();
    }
  }
  ctx=old;
  return PORTRAIT_CACHE[ck]=c.toDataURL();
}

/* ===================== 11. INTERFACE E ENTRADA ===================== */
const TOWER_KEYS=['1','2','3','4','5','6','7','8','9','0','q','w','e','r','t','y','u','i','o','p','a','s','d','g','h','j'];
const UI = {cache:{}, panelKey:'', panelCollapsed:false, cards:{}, pcards:{}, icons:{}, toastT:0, restartT:0, quickKey:''};
function setText(id,v){ const el=$(id); if(el&&UI.cache[id]!==v){UI.cache[id]=v;el.textContent=v;} }
function setCls(el,key,cls,on){ if(!el)return; const k=key; if(UI.cache[k]!==on){UI.cache[k]=on;el.classList.toggle(cls,on);} }
function setHint(t){ const el=$('hint'); if(el&&UI.cache._hint!==t){UI.cache._hint=t;el.textContent=t||'';} }
function toast(msg,kind){
  if(G.replay)return;
  const el=$('toast'); el.textContent=msg; el.className='show'+(kind?' '+kind:'');
  clearTimeout(UI.toastT); UI.toastT=setTimeout(()=>{el.className='';},1800);
}
function noMoney(){ toast('Dinheiro insuficiente!','bad'); Snd.play('err'); $('stCoins').animate([{transform:'translateX(-4px)',color:'#f55'},{transform:'translateX(4px)'},{transform:'none'}],{duration:260}); }
let lastCoinBump=0;
function coinBump(){ const n=performance.now(); if(n-lastCoinBump<120)return; lastCoinBump=n; $('coins').animate([{transform:'scale(1.35)',color:'#fff'},{transform:'scale(1)'}],{duration:220}); }

function setSidebarMobileOpen(open){
  const sb=$('sidebar'),bd=$('sidebarBackdrop'),tb=$('btnToggleSidebar');
  if(!sb)return;
  if(open){
    sb.classList.add('mobile-open');
    if(bd)bd.classList.remove('hidden');
    if(tb)tb.classList.add('active');
  }else{
    sb.classList.remove('mobile-open');
    if(bd)bd.classList.add('hidden');
    if(tb)tb.classList.remove('active');
  }
}

function select(t){ if(t&&G.selected!==t)UI.panelCollapsed=false; G.selected=t; G.selectedObs=null; UI.panelKey=''; }
function cancelAll(){
  if(G.placing||G.targeting){G.placing=null;G.targeting=null;setHint('');return;}
  if(G.selected||G.selectedObs){G.selected=null;G.selectedObs=null;UI.panelKey='';}
  if(IS_MOBILE)setSidebarMobileOpen(false);
}
function pickTower(key){
  if(G.mode!=='play')return;
  const d=TOWERS[key];
  if(!d)return;
  if(G.placing===key){G.placing=null;setHint('');return;}
  if(!Number.isFinite(G.money)||G.money<d.cost){noMoney();const c=UI.cards[key];if(c){c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake');}return;}
  G.placing=key;G.targeting=null;select(null);Snd.play('ui');
  if(IS_MOBILE)setSidebarMobileOpen(false);
  if(IS_MOBILE){
    setHint('Toque no mapa para posicionar '+d.name+'. Verde = válido. Toque em Cancelar para desistir.');
  } else {
    setHint('Clique no mapa para construir '+d.name+'. Verde = válido. ESC cancela (Shift mantém a construção).');
  }
}
function placeTower(key,x,y,playerSlot,remote,tid){
  const d=TOWERS[key]; if(!d)return null;
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const isRemote=!!remote;
  if(!isRemote){
    if(!Number.isFinite(G.money)||G.money<d.cost){noMoney();return null;}
    const bad=validSpot(x,y); if(bad){toast(bad,'bad');Snd.play('err');return null;}
    G.money-=d.cost;
  }
  const t=new Tower(key,x,y);
  // Co-op online: ID único por jogador (slot*100000+n). O aliado usa o MESMO ID enviado
  // pelo dono, então upgrades/vendas/habilidades apontam sempre para a mesma torre nos dois PCs.
  if(COOP.active&&COOP.isMultiplayer){
    if(isRemote&&Number.isFinite(tid)&&tid>0){t.id=tid;}
    else if(!isRemote){COOP._towerSeq=(COOP._towerSeq||0)+1;t.id=((COOP.mySlot||0)+1)*100000+COOP._towerSeq;}
  }
  t.ownerSlot=(typeof playerSlot==='number')?playerSlot:(COOP.active?(COOP.mySlot||0):0);
  towers.push(t); towers.sort((a,b)=>a.y-b.y); psAdd('built');
  const ringCol=(t.ownerSlot===1)?'#4ade80':'#f2c230';
  FX.ring(x,y,6,26,.3,ringCol,3); FX.spark(x,y,t.ownerSlot===1?'#86efac':'#d8c890',6); Snd.play('build');
  return t;
}
function setTowerAim(t,x,y){
  if(!t||t.key!=='dartgun'||!Number.isFinite(x)||!Number.isFinite(y))return false;
  t.aimX=clamp(Math.round(x),10,W-10);
  t.aimY=clamp(Math.round(y),10,H-10);
  t.angle=Math.atan2(t.aimY-t.y,t.aimX-t.x);
  FX.ring(t.aimX,t.aimY,4,18,.28,'#38bdf8',2.5);
  Snd.play('ui');
  UI.panelKey='';
  return true;
}
function setPortalExit(t,x,y){
  if(!t||t.key!=='portal'||!Number.isFinite(x)||!Number.isFinite(y))return false;
  let linkType=null, tx=clamp(x,10,W-10), ty=clamp(y,10,H-10);
  // Sinergia Tática: permite conectar a saída do portal direto no Dinossauro aliado ou nas Minas Terrestres
  for(const q of towers){
    if(q._dino&&dist(q._dino.x,q._dino.y,tx,ty)<=48){
      tx=q._dino.x; ty=q._dino.y; linkType='dino'; break;
    }
  }
  if(!linkType){
    for(const m of mines){
      if(m.armed&&dist(m.x,m.y,tx,ty)<=42){
        tx=m.x; ty=m.y; linkType='mine'; break;
      }
    }
  }
  const np=nearestPathProg(tx,ty);
  t.exitDist=clamp(np.d,10,PATH_LEN-20);
  pathPos(t.exitDist,_pp);
  t.exitX=Math.round(_pp.x);
  t.exitY=Math.round(_pp.y);
  t.exitLink=linkType;
  FX.ring(t.exitX,t.exitY,6,30,.4,linkType?'#fbbf24':'#c084fc',3.5);
  toast(linkType==='dino'?'🌀 Portal conectado direto ao Dinossauro Aliado!':linkType==='mine'?'🌀 Portal conectado direto às Minas Terrestres!':'Saída do Portal definida na pista!','good');
  Snd.play('ui');
  UI.panelKey='';
  return true;
}
function spawnMapObstacles(){
  obstacles.length=0;
  const modPresets=(window.QZ_BTD6_TOWERS&&window.QZ_BTD6_TOWERS.MAP_OBSTACLE_PRESETS)||null;
  const presets=(modPresets&&(modPresets[activeMap]||modPresets.default))||(activeMap==='metro'
    ?[{dx:310,dy:240,r:18,cost:220,name:'Vagão Descarrilado',kind:'wagon'},{dx:480,dy:360,r:18,cost:250,name:'Barricada Subterrânea',kind:'debris'},{dx:650,dy:260,r:18,cost:280,name:'Gerador de Linha',kind:'crate'}]
    :activeMap==='forest'
    ?[{dx:315,dy:225,r:18,cost:190,name:'Tronco Mutante Caído',kind:'debris'},{dx:510,dy:380,r:18,cost:230,name:'Rocha Coberta de Musgo',kind:'crate'},{dx:675,dy:245,r:18,cost:260,name:'Caminhão Florestal',kind:'wagon'}]
    :[{dx:320,dy:230,r:18,cost:200,name:'Destroços Blindados',kind:'debris'},{dx:490,dy:370,r:18,cost:240,name:'Contentor Militar',kind:'crate'},{dx:660,dy:250,r:18,cost:270,name:'Barricada Pesada',kind:'wagon'}]);
  let oid=0;
  for(const pr of presets){
    let bx=pr.dx, by=pr.dy, found=false;
    for(let step=0;step<14;step++){
      const ang=step*1.1, rad=step*16;
      const cx=clamp(Math.round(pr.dx+Math.cos(ang)*rad),210,740);
      const cy=clamp(Math.round(pr.dy+Math.sin(ang)*rad),180,500);
      if(distToPath(cx,cy)>=CFG.pathClear+pr.r+8){
        let blk=false;
        for(const [rx,ry,rw,rh] of (MAPS[activeMap].blocked||[]))if(cx>rx-22&&cx<rx+rw+22&&cy>ry-22&&cy<ry+rh+22)blk=true;
        if(!blk){bx=cx;by=cy;found=true;break;}
      }
    }
    if(found){
      obstacles.push({id:++oid,x:bx,y:by,r:pr.r,cost:pr.cost,name:pr.name,kind:pr.kind,cleared:false});
    }
  }
}
function clearObstacle(id,remote){
  const ob=obstacles.find(o=>o.id===id&&!o.cleared);
  if(!ob)return false;
  if(!remote){
    if(!Number.isFinite(G.money)||G.money<ob.cost){noMoney();return false;}
    G.money-=ob.cost;
  }
  ob.cleared=true;
  if(G.selectedObs===ob)G.selectedObs=null;
  FX.blast(ob.x,ob.y,36);
  FX.popup(ob.x,ob.y-16,'TERRENO LIBERADO!','#4ade80',true);
  Snd.play('boom');
  UI.panelKey='';
  return true;
}
function nextUpgrade(t){
  if(t.paragon)return [];
  const paths=TOWER_PATHS[t.key];
  const chosen=t.pathLevels.findIndex(n=>n>0);
  return paths.map((path,i)=>({path:i,level:t.pathLevels[i],up:path[t.pathLevels[i]]||null})).filter(x=>x.up && x.level<5 && (chosen===-1 ? t.pathChoices[x.path]!==false : x.path===chosen));
}
function upgradeTower(t,choice,pathIndex,remote){
  if(!t)return false;
  const isRemote=!!remote;
  if(COOP.active&&COOP.isMultiplayer&&!isRemote){
    if((t.ownerSlot??0)!==(COOP.mySlot??0))return false;
  }
  const available=nextUpgrade(t); if(!available.length)return false;
  // Compatibilidade com chamadas antigas: escolha a primeira melhoria disponível.
  let entry=Number.isInteger(pathIndex)?available.find(x=>x.path===pathIndex):available[0];
  if(!entry)return false;
  const path=entry.path, up=entry.up;
  if(up.choices){
    const u=up.choices[choice];
    if(!u)return false;
    if(!isRemote){
      if(!Number.isFinite(G.money)||G.money<u.cost){noMoney();return false;}
      G.money-=u.cost;
    }
    t.spent+=u.cost;t.pathChoices[path]=choice;t.ups.push(u);
  } else {
    const u=up;
    if(!isRemote){
      if(!Number.isFinite(G.money)||G.money<u.cost){noMoney();return false;}
      G.money-=u.cost;
    }
    t.spent+=u.cost;t.ups.push(u);
  }
  t.pathLevels[path]++;t.tier++;psAdd('upgrades');
  // Escolher uma linha bloqueia permanentemente as outras duas.
  for(let i=0;i<3;i++)t.pathChoices[i]=(i===path);
  t.recalc();FX.ring(t.x,t.y,8,40,.45,'#27c9ff',4);FX.ring(t.x,t.y,4,26,.3,'#ffffff',2);FX.spark(t.x,t.y-10,'#27c9ff',12);Snd.play('up');UI.panelKey='';return true;
}
function paragonCost(key){
  const ov=ASCENSION_BALANCE[key];
  if(ov&&ov.cost)return ov.cost;
  const d=TOWERS[key];
  return Math.ceil((2800 + (d?d.cost:400)*3.3)/100)*100;
}
function applyParagonStats(t){
  const cfg=Object.assign({},ASCENSION_BALANCE.default,ASCENSION_BALANCE[t.key]||{});
  const s=t.s;
  s.dmg*=cfg.dmg;
  s.rate*=cfg.rate;
  if(t.key!=='sniper')s.range*=cfg.range; else s.range=1400;
  s.pierce=Math.max(3,(s.pierce||1)*2);
  s.armorPen=1;
  s.bigMult=(s.bigMult||1)*cfg.bigMult;
  if(s.burnDps)s.burnDps*=cfg.dot;
  if(s.poisonDps)s.poisonDps*=cfg.dot;
  if(s.splash)s.splash*=cfg.splash;
  if(s.income)s.income=Math.round(s.income*cfg.income);
  if(s.auraDmg)s.auraDmg=Math.min(.60,s.auraDmg*cfg.aura);
  if(s.auraRate)s.auraRate=Math.min(.60,s.auraRate*cfg.aura);
  if(s.auraRange)s.auraRange=Math.min(.45,s.auraRange*cfg.aura);
  if(s.slow)s.slow=Math.min(.78,s.slow*1.18);
  if(s.vuln)s.vuln=Math.min(.60,s.vuln*cfg.aura);
  if(s.healBase)s.healBase=Math.round(s.healBase)+1;
  if(t.teamParagon){
    s.dmg*=1.12;
    if(t.key!=='sniper')s.range*=1.06;
  }
}
function makeParagon(t,remote){
  if(!t)return false;
  const isRemote=!!remote;
  if(COOP.active&&COOP.isMultiplayer&&!isRemote){
    if((t.ownerSlot??0)!==(COOP.mySlot??0))return false;
  }
  // Ascensão em Equipe: une 3 torres idênticas no nível máximo (mesmo de jogadores diferentes no Co-op)
  const same=towers.filter(q=>q.key===t.key&&Math.max(...q.pathLevels)>=5&&!q.paragon);
  if(Math.max(...t.pathLevels)<5||same.length<3){toast('Precisa de 3 torres iguais com um caminho no nível 5.','bad');return false;}
  const cost=paragonCost(t.key);
  if(!remote){
    if(!Number.isFinite(G.money)||G.money<cost){toast('Moedas insuficientes para criar esta Ascensão.','bad');return false;}
    G.money-=cost;
  }
  t.spent+=cost;
  const isTeamUnion=COOP.active||same.some(q=>(q.ownerSlot||0)!==(t.ownerSlot||0));
  for(const q of same){if(q===t)continue;const i=towers.indexOf(q);if(i>=0)towers.splice(i,1);}
  t.paragon=true;t.teamParagon=isTeamUnion;G.stats.paragons++;psAdd('paragons');t.tier=7;
  t.def=Object.assign({},t.def,{name:(isTeamUnion?'Ascendida Co-op: ':'Ascendida: ')+t.def.name});
  t.recalc();
  t.spent+=same.filter(q=>q!==t).reduce((n,q)=>n+q.spent,0);
  FX.ring(t.x,t.y,12,95,.9,'#f2c230',6);
  FX.popup(t.x,t.y-35,isTeamUnion?'★ ASCENSÃO EM EQUIPE! ★':'ASCENSÃO!','#f2c230',true);
  Snd.play('power');UI.panelKey='';
  toast(isTeamUnion?'Ascensão em Equipe ativada! Sinergia máxima desbloqueada.':'Ascensão criada! Poder e alcance aumentados.','good');
  return true;
}
function activateTowerAbility(t,remote){
  if(!t)return false;
  const isRemote=!!remote;
  if(COOP.active&&COOP.isMultiplayer&&!isRemote){
    if((t.ownerSlot??0)!==(COOP.mySlot??0))return false;
  }
  const a=TOWER_ABILITIES[t.key];if(!a||t.abilityCD>0)return false;
  if(!remote){
    if(!Number.isFinite(G.money)||G.money<a.cost){noMoney();return false;}
    G.money-=a.cost;
  }
  t.spent+=a.cost;t.abilityCD=a.cd;
  if(t.key==='tesla'){t.abilityT=Math.max(t.abilityT,6);if(!t._teslaBoost){t._teslaBoost=true;t.recalc();}}
  else if(t.key==='mortar'){const target=zombies.filter(z=>!z.dead&&!z.reached).sort((x,y)=>y.dist-x.dist).slice(0,8);for(const z of target)explode(z.x,z.y,82,210,'expl',{armorPen:.5,owner:t});}
  else if(t.key==='drone'){for(const z of zombies){if(!z.dead&&!z.reached&&dist(z.x,z.y,t.x,t.y)<260)applyDamage(z,175,'phys',{armorPen:.5,owner:t});}FX.ring(t.x,t.y,20,260,.7,'#8fe7ff',5);}
  else if(t.key==='medstation'){for(const q of towers){if(dist(q.x,q.y,t.x,t.y)>=190)continue;q.abilityT=Math.max(q.abilityT,7);if(!q._supportBoost){q._supportBoost=true;q.recalc();}}}
  else if(t.key==='flame'){for(const z of zombies)if(!z.dead&&!z.reached&&dist(z.x,z.y,t.x,t.y)<150){applyDamage(z,90,'fire',{owner:t});z.burnDps=Math.max(z.burnDps,40);z.burnT=Math.max(z.burnT,4);}FX.ring(t.x,t.y,10,150,.6,'#ff6a28',5);}
  else if(t.key==='beacon'){for(const q of towers){if(dist(q.x,q.y,t.x,t.y)>t.s.range*1.15)continue;q.abilityT=Math.max(q.abilityT,7);if(!q._supportBoost||!q._teslaBoost){q._supportBoost=true;q._teslaBoost=true;q.recalc();}}FX.ring(t.x,t.y,14,t.s.range*1.15,.7,'#fbbf24',5);Snd.play('power');}
  else if(t.key==='supplydepot'){const gain=280;if(!remote){G.money+=gain;G.earned+=gain;coinBump();}FX.popup(t.x,t.y-28,'+'+gain+' SUPRIMENTO AÉREO','#ffd24a',true);FX.ring(t.x,t.y,10,120,.6,'#ffd24a',4);Snd.play('coin');}
  else if(t.key==='cryogen'){for(const z of zombies){if(!z.dead&&!z.reached&&dist(z.x,z.y,t.x,t.y)<=t.s.range*1.2){freezeZ(z,2.2);z.vulnT=Math.max(z.vulnT||0,4.5);z.vulnAmt=Math.max(z.vulnAmt||0,.35);}}FX.ring(t.x,t.y,12,t.s.range*1.2,.75,'#c084fc',5);Snd.play('ice');}
  else if(t.key==='nanomed'){const bf=G.life;G.life=Math.min(CFG.baseLife,G.life+10);for(const q of towers)q.weak=0;FX.ring(t.x,t.y,15,280,.75,'#2be3a1',5);FX.popup(t.x,t.y-28,'+'+(G.life-bf)+' VIDA BASE','#2be3a1',true);Snd.play('power');}
  else if(t.key==='portal'){
    // Habilidade Ativa Portal Tático: abre portal de entrada no alcance e teletransporta zumbis (incluindo speedboss) para o portal de saída
    const np=nearestPathProg(t.x,t.y);
    pathPos(np.d,_pp);
    const inX=Math.round(_pp.x), inY=Math.round(_pp.y);
    const outDist=Number.isFinite(t.exitDist)?t.exitDist:Math.max(10,np.d-(t.s.warpBack||190));
    pathPos(outDist,_pp);
    const outX=Math.round(_pp.x), outY=Math.round(_pp.y);
    portals.push({inX,inY,outX,outY,life:2.8});
    const inRange=zombies.filter(z=>!z.dead&&!z.reached&&dist(z.x,z.y,t.x,t.y)<=t.s.range*1.25).sort((x,y)=>y.dist-x.dist).slice(0,10);
    for(const z of inRange){
      const warpAmt=z.D.boss?Math.min(180,Math.max(95,(z.dist-outDist)*0.55)):Math.max(110,z.dist-outDist);
      z.dist=Math.max(8,z.dist-warpAmt);
      z.place();
      stunZ(z,z.D.speedBoss?1.35:0.85);
      applyDamage(z,(t.s.dmg||26)*2.2,'elec',{owner:t});
      FX.spark(z.x,z.y-8,'#38bdf8',5);
    }
    FX.ring(inX,inY,6,72,.55,'#c084fc',4);
    FX.ring(outX,outY,6,72,.55,'#38bdf8',4);
    Snd.play('power');
  } else if(t.key==='dino'){
    // Habilidade Ativa Investida Jurássica: rugido sísmico + invocação dupla + atordoamento em área
    t.spawnFlash=1.0;
    if(t._dino){t._dino.roarT=0.85;t._dino.biteT=0.6;}
    spawnTrackAlly(t);
    spawnTrackAlly(t);
    for(const z of zombies){
      if(!z.dead&&!z.reached&&dist(z.x,z.y,t.x,t.y)<=t.s.range*1.35){
        applyDamage(z,(t.s.dinoDmg||52)*2.6,'phys',{armorPen:.5,owner:t});
        stunZ(z,1.25);
        FX.stunSparks(z.x,z.y,3);
      }
    }
    FX.ring(t.x,t.y,10,t.s.range*1.35,.65,'#f97316',5);
    Snd.play('power');
  }
  FX.popup(t.x,t.y-25,a.name,'#ffe06a',true);UI.panelKey='';return true;
}
function sellTower(t,remote){
  const isRemote=!!remote;
  if(COOP.active&&COOP.isMultiplayer&&!isRemote){
    if((t.ownerSlot??0)!==(COOP.mySlot??0))return;
  }
  if(t.tier>=5)psAdd('soldMax');
  const refundRatio=CFG.sellRatio+getTechBonus('sell_refund')*0.03;
  const refund=Math.floor(t.spent*refundRatio);
  if(!remote){
    G.money+=refund;
  } else if(COOP.active&&typeof t.ownerSlot==='number'&&COOP.players[t.ownerSlot]){
    COOP.players[t.ownerSlot].money=(COOP.players[t.ownerSlot].money||0)+refund;
  }
  const i=towers.indexOf(t); if(i>=0)towers.splice(i,1);
  FX.popup(t.x,t.y-16,'+'+refund,'#f2c230'); FX.spark(t.x,t.y,'#d8c890',8); Snd.play('coin'); coinBump();
  select(null);
}

function extrasText(t){
  const s=t.s,a=[];
  if(s.dinoDmg)a.push('Dino '+Math.round(s.dinoDmg)+' dano');
  if(s.maxStacks)a.push('Acumula '+Math.round(s.maxStacks)+'x minas');
  if(s.warpBack)a.push('Recuo '+Math.round(s.warpBack)+'m');
  if(s.auraDmg)a.push('Aura +'+Math.round(s.auraDmg*100)+'% dano');
  if(s.auraRate)a.push('Aura +'+Math.round(s.auraRate*100)+'% cadência');
  if(s.auraRange)a.push('Aura +'+Math.round(s.auraRange*100)+'% alcance');
  if(s.auraCamo)a.push('Aura: revela camuflados');
  if(s.income)a.push('Gera +'+Math.round(s.income)+' ●/ciclo');
  if(s.vuln)a.push('Vulnerabilidade +'+Math.round(s.vuln*100)+'%');
  if(s.healBase)a.push('Repara +'+Math.round(s.healBase)+' vida/onda');
  if(s.purify)a.push('Purifica torres');
  if(t._auraDmg)a.push('Buff +'+Math.round(t._auraDmg*100)+'% dano');
  if(t._auraRate)a.push('Buff +'+Math.round(t._auraRate*100)+'% cad.');
  if(s.pierce>1)a.push('Perfura '+s.pierce);
  if(s.splash>0)a.push('Área '+Math.round(s.splash));
  if(s.chain)a.push('Cadeia '+s.chain);
  if(s.crit)a.push('Crítico '+Math.round(s.crit*100)+'%');
  if(s.armorPen)a.push('Ignora '+Math.round(s.armorPen*100)+'% armadura');
  if(s.burnDps)a.push('Queima '+Math.round(s.burnDps)+'/s');
  if(s.poisonDps)a.push('Veneno '+Math.round(s.poisonDps)+'/s por '+s.poisonT+'s');
  if(s.spreadR)a.push('Contagioso');
  if(s.slow)a.push('Lentidão '+Math.round(s.slow*100)+'%');
  if(s.freezeChance)a.push('Congela '+Math.round(s.freezeChance*100)+'%');
  if(s.stun)a.push('Atordoa '+(typeof s.stun==='number'?s.stun.toFixed(1)+'s':''));
  return a.join(' · ');
}
function btd6UpgradeNodeSvg(pathIdx,stepIdx){
  // Ícones circulares ilustrados e customizados para cada nível (1..5) das 3 linhas de melhoria
  if(pathIdx===0){ // Linha 1: Poder de Fogo & Calibre
    const svgs=[
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18V9l3-5 3 5v9H7zm6 0v-7l2.5-4 2.5 4v7h-5z" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18v2H3v-2zm0-2l3-9 6 4 6-4 3 9H3z" fill="currentColor"/></svg>'
    ];
    return svgs[Math.min(4,Math.max(0,stepIdx))]||svgs[0];
  }
  if(pathIdx===1){ // Linha 2: Cadência & Tática
    const svgs=[
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17l5-5-5-5M13 17l5-5-5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="13,2 4,14 11,14 10,22 20,10 13,10" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" fill="currentColor"/><circle cx="7" cy="16" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3z" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 19,7 19,17 12,22 5,17 5,7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.5" fill="currentColor"/></svg>'
    ];
    return svgs[Math.min(4,Math.max(0,stepIdx))]||svgs[0];
  }
  // Linha 3: Alcance & Tecnologia
  const svgs=[
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18a8 8 0 0 1 16 0M7 18a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18" r="2" fill="currentColor"/><path d="M12 16V6" stroke="currentColor" stroke-width="2"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" stroke="currentColor" stroke-width="1.8"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(30 12 12)" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2 21,12 12,22 3,12" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>'
  ];
  return svgs[Math.min(4,Math.max(0,stepIdx))]||svgs[0];
}

function refreshPanel(){
  const p=$('towerPanel'),t=G.selected,ob=G.selectedObs;
  if(!t&&!ob){ if(UI.panelKey!=='none'){UI.panelKey='none';p.classList.add('hidden');p.classList.remove('collapsed');} return; }
  if(ob&&!t){
    const oKey='obs|'+ob.id+'|'+(G.money>=ob.cost?1:0);
    if(UI.panelKey===oKey)return;
    UI.panelKey=oKey;
    p.classList.remove('hidden','collapsed'); p.classList.toggle('pl',ob.x>W/2);
    p.innerHTML='<div class="tp-head"><div class="tp-obs-ico">🚧</div><div><div class="nm">'+escHtml(ob.name)+'</div><div class="lv">OBSTÁCULO DO MAPA</div></div><button class="tp-close" data-act="close" title="Fechar (ESC)">✕</button></div>'
      +'<div class="tp-extra">Libere este ponto estratégico para posicionar novas torres com visão privilegiada da pista.</div>'
      +'<button class="tp-up'+(G.money>=ob.cost?'':' poor')+'" data-act="clearObs" data-id="'+ob.id+'"><b>💥 Demolir e Limpar Terreno</b> — '+ob.cost+' ●<small>Remove permanentemente este obstáculo da zona de operação.</small></button>';
    return;
  }
  const isMyTower=!COOP.active||!COOP.isMultiplayer||((t.ownerSlot??0)===(COOP.mySlot??0));
  const allyOwnerSlot=(typeof t.ownerSlot==='number')?t.ownerSlot:0;
  const allyName=(COOP.active&&COOP.players&&COOP.players[allyOwnerSlot]&&COOP.players[allyOwnerSlot].name)?COOP.players[allyOwnerSlot].name:('P'+(allyOwnerSlot+1));
  const upgrades=nextUpgrade(t);
  const aff=upgrades.map(e=>e.path+':'+e.level+':'+(e.up.choices?e.up.choices.map(c=>G.money>=c.cost?1:0).join(''):(G.money>=e.up.cost?1:0))).join('|')||'-';
  const key=t.id+'|'+t.tier+'|'+t.priority+'|'+aff+'|'+Math.floor(t.spent*CFG.sellRatio)+'|'+Math.ceil(t.abilityCD)+'|'+t.paragon+'|'+(t.kills||0)+'|'+G.targeting+'|'+UI.panelCollapsed+'|'+(isMyTower?1:0)+'|'+towers.filter(q=>q.key===t.key&&Math.max(...q.pathLevels)>=5).length;
  if(key===UI.panelKey)return;
  UI.panelKey=key;
  const s=t.s,d=t.def;
  const portraitUrl=getTowerPortrait(t);
  const domP=t.dominantPath;
  let skinTag=t.paragon?'ASCENDIDA':domP===0?'SKIN: CALIBRE':domP===1?'SKIN: CADÊNCIA':domP===2?'SKIN: TECNOLOGIA':'SKIN: PADRÃO';
  if(!t.paragon&&t.key==='dino'){
    skinTag=t.tier>=4?'SKIN: CYBER T-REX ALFA':t.tier>=2?'SKIN: ALOSSAURO BLINDADO':'SKIN: BIO-RAPTOR';
  } else if(!t.paragon&&t.key==='minefactory'){
    skinTag=t.tier>=4?'SKIN: USINA DE PLASMA':t.tier>=2?'SKIN: FUNDIDORA DE CHOQUE':'SKIN: USINA TÁTICA';
  } else if(!t.paragon&&t.key==='dartgun'){
    skinTag=t.tier>=4?'SKIN: CANHÃO DE ENERGIA AZUL':t.tier>=2?'SKIN: ROTATIVA TÁTICA':'SKIN: CINZA CHUMBO';
  }
  p.classList.remove('hidden'); p.classList.toggle('pl',t.x>W/2); p.classList.toggle('collapsed',!!UI.panelCollapsed);
  const colIco=UI.panelCollapsed?(t.x>W/2?'▶':'◀'):(t.x>W/2?'◀':'▶');
  let h='<button type="button" class="tp-drawer-tab" data-act="toggleCollapse" title="'+(UI.panelCollapsed?'Expandir Painel de Inspeção':'Recolher Painel Lateral')+'"><span>'+colIco+'</span></button>';
  h+='<div class="tp-portrait-showcase tier-'+Math.min(5,t.tier)+(t.paragon?' paragon':'')+'">'
    +'<div class="tp-portrait-wrap tier-'+Math.min(5,t.tier)+(t.paragon?' paragon':'')+'"><img src="'+portraitUrl+'" alt="'+escHtml(d.name)+'"><span class="tp-tier-badge">'+(t.paragon?'ASCENDIDA':'NÍVEL '+Math.min(5,t.tier)+'/5')+'</span></div>'
    +'<div class="tp-head btd6-head">'
    +'<div class="tp-title-col"><div class="nm">'+d.name+'</div><div class="lv">'+(t.paragon?'★ UNIDADE ASCENDIDA':skinTag)+'</div></div>'
    +'<div class="tp-kills" title="Contagem exata de zumbis abatidos por esta torre">☠ <b>'+(t.kills||0).toLocaleString('pt-BR')+'</b> abates</div>'
    +'<div class="tp-head-actions"><button type="button" class="tp-collapse" data-act="toggleCollapse" title="'+(UI.panelCollapsed?'Expandir Painel':'Recolher Painel Lateral')+'">'+colIco+'</button>'
    +'<button type="button" class="tp-close" data-act="close" title="Fechar (ESC)">✕</button></div>'
    +'</div></div>';
  if(!isMyTower){
    h+='<div class="tp-ally-banner">🤝 UNIDADE DO ALIADO ('+escHtml(allyName)+')</div>';
  }
  h+='<div class="tp-body">';
  const dmgTxt=d.kind==='flame'?(s.dmg.toFixed(1)+' (+calor)'):d.kind==='ice'?s.dmg.toFixed(0)+' (+lentidão)':Math.round(s.dmg)+(s.splash?' (área)':'');
  h+='<div class="tp-stats"><span>Dano/ataque</span><span>'+dmgTxt+'</span><span>Cadência</span><span>'+s.rate.toFixed(2)+' /s</span><span>Alcance</span><span>'+Math.round(s.range)+'</span><span>Tipo</span><span>'+d.dtype+'</span></div>';
  h+='<div class="tp-extra">'+(extrasText(t)||'&nbsp;')+'</div>';
  if(t.key==='dartgun'){
    if(isMyTower){
      h+='<div class="tp-lbl">Mira Travada (Estilo BTD6)</div><div class="tp-prio"><button data-act="aim" class="'+(G.targeting==='aim'?'active':'')+'" style="grid-column:span 4">🎯 '+(G.targeting==='aim'?'Clique no mapa para travar...':'Mudar Ponto de Mira ('+t.aimX+', '+t.aimY+')')+'</button></div>';
    }else{
      h+='<div class="tp-lbl">Mira Travada (Definida por '+escHtml(allyName)+')</div><div class="tp-prio"><span class="tp-prio-readonly">🎯 Ponto ('+t.aimX+', '+t.aimY+')</span></div>';
    }
  } else if(t.key!=='minefactory'){
    if(isMyTower){
      h+='<div class="tp-lbl">Alvo Prioritário</div><div class="tp-prio">';
      for(const k of ['first','last','strong','close'])h+='<button data-act="prio" data-k="'+k+'" class="'+(t.priority===k?'active':'')+'" title="'+PRIO_LABEL[k]+'">'+PRIO_LABEL[k]+'</button>';
      h+='</div>';
    }else{
      h+='<div class="tp-lbl">Alvo Prioritário (Definido por '+escHtml(allyName)+')</div><div class="tp-prio"><span class="tp-prio-readonly">🎯 '+PRIO_LABEL[t.priority]+'</span></div>';
    }
  }
  if(t.key==='portal'){
    if(isMyTower){
      h+='<div class="tp-prio" style="margin-top:4px"><button data-act="portal_exit" class="'+(G.targeting==='portal_exit'?'active':'')+'" style="grid-column:span 4">🌀 '+(G.targeting==='portal_exit'?'Clique na pista para posicionar...':'Definir Saída do Portal na Pista')+'</button></div>';
    }else{
      h+='<div class="tp-prio" style="margin-top:4px"><span class="tp-prio-readonly">🌀 Saída do Portal controlada por '+escHtml(allyName)+'</span></div>';
    }
  }
  // As 3 Linhas de Evolução estilo BTD6 com Ícones Circulares Ilustrados e Tooltips
  const paths=TOWER_PATHS[t.key]||[];
  const chosen=t.pathLevels.findIndex(n=>n>0);
  const labels=['Linha 1 · Poder de Fogo','Linha 2 · Cadência & Tática','Linha 3 · Alcance & Tecnologia'];
  h+='<div class="tp-lbl">Caminhos de Habilidade (Toque ou passe o mouse nos ícones)</div><div class="btd6-paths">';
  for(let pi=0;pi<3;pi++){
    const lv=t.pathLevels[pi]||0;
    const locked=(chosen!==-1&&chosen!==pi)||t.paragon;
    let pips='<span class="btd6-pips">';
    for(let k=1;k<=5;k++)pips+='<i class="btd6-pip'+(k<=lv?' on':'')+'"></i>';
    pips+='</span>';
    h+='<div class="btd6-path-row'+(locked?' locked':'')+(chosen===pi?' active-path':'')+'">';
    h+='<div class="btd6-path-head"><span>'+labels[pi]+'</span>'+pips+'</div>';
    // Sequência horizontal de 5 ícones circulares ilustrados (estados: comprado, disponível, sem saldo ou bloqueado)
    h+='<div class="btd6-circle-seq">';
    for(let step=0;step<5;step++){
      const rawUp=paths[pi]&&paths[pi][step];
      const uItem=rawUp&&(rawUp.choices?rawUp.choices[0]:rawUp);
      const uName=uItem?uItem.name:('Melhoria '+(step+1));
      const uCost=uItem?uItem.cost:0;
      const uDesc=uItem?uItem.desc:'';
      const isBought=step<lv||t.paragon;
      const isNext=(step===lv)&&!locked&&!t.paragon;
      const canBuy=isNext&&G.money>=uCost&&isMyTower;
      const stateCls=isBought?'state-bought':isNext?(isMyTower?(canBuy?'state-available':'state-poor'):'state-locked'):'state-locked';
      const stLabel=isBought?'✔ Comprado':isNext?(isMyTower?(canBuy?'● Disponível para compra':'✖ Moedas insuficientes'):('🔒 Exclusivo de '+allyName)):'🔒 Bloqueado';
      const badgeHtml=isBought?'<span class="btd6-nc-badge ok">✓</span>':isNext?(isMyTower?('<span class="btd6-nc-badge cost">'+uCost+'●</span>'):'<span class="btd6-nc-badge lck">🔒</span>'):'<span class="btd6-nc-badge lck">🔒</span>';
      const actAttr=(isNext&&isMyTower)?(' data-act="up" data-i="0" data-path="'+pi+'"'):' data-act="nodeTip"';
      const customSvgPath='assets/upgrades/path'+pi+'-lv'+(step+1)+'.svg';
      h+='<button type="button" class="btd6-node-circle '+stateCls+'"'+actAttr
        +' data-up-tip="1"'
        +' data-up-name="'+escHtml(uName)+'"'
        +' data-up-cost="'+uCost+'"'
        +' data-up-desc="'+escHtml(uDesc)+'"'
        +' data-up-status="'+escHtml(stLabel)+'"'
        +' data-up-tier="Linha '+(pi+1)+' · Nível '+(step+1)+'/5"'
        +' aria-label="'+escHtml(uName)+' ('+uCost+' moedas) - '+escHtml(stLabel)+'">'
        +'<img class="btd6-nc-img" src="'+customSvgPath+'" alt="" loading="eager">'
        +'<span class="btd6-nc-ico">'+btd6UpgradeNodeSvg(pi,step)+'</span>'
        +badgeHtml
        +'</button>';
    }
    h+='</div>';
    if(t.paragon){
      h+='<div class="btd6-path-max">◆ Ascensão Completa</div>';
    } else if(lv>=5){
      h+='<div class="btd6-path-max">★ Nível Máximo (5/5)</div>';
    } else if(locked){
      h+='<div class="btd6-path-locked">🔒 Linha bloqueada</div>';
    } else if(!isMyTower){
      h+='<div class="tp-path-ally-status">🔒 Apenas o comandante '+escHtml(allyName)+' pode aprimorar esta unidade.</div>';
    } else {
      const up=paths[pi]&&paths[pi][lv];
      if(up){
        if(up.choices){
          up.choices.forEach((c,ci)=>{
            h+='<button class="tp-up'+(G.money>=c.cost?'':' poor')+'" data-act="up" data-i="'+ci+'" data-path="'+pi+'"><b>'+c.name+'</b> — '+c.cost+' ●<small>'+c.desc+'</small></button>';
          });
        } else {
          h+='<button class="tp-up'+(G.money>=up.cost?'':' poor')+'" data-act="up" data-i="0" data-path="'+pi+'"><b>'+up.name+'</b> — '+up.cost+' ●<small>'+up.desc+'</small></button>';
        }
      }
    }
    h+='</div>';
  }
  h+='</div>';
  if(isMyTower){
    const sameMax=towers.filter(q=>q!==t&&q.key===t.key&&Math.max(...q.pathLevels)>=5&&!q.paragon).length;
    if(Math.max(...t.pathLevels)>=5&&!t.paragon&&sameMax>=2)h+='<button class="tp-up" data-act="paragon"><b>◆ Criar Ascensão</b> — '+paragonCost(t.key)+' ●<small>Consome esta torre e mais 2 torres '+d.name+' no nível 5.</small></button>';
    const ab=TOWER_ABILITIES[t.key]; if(ab&&!t.paragon)h+='<button class="tp-up" data-act="ability" '+(t.abilityCD>0?'disabled':'')+'><b>⚡ '+ab.name+'</b> — '+ab.cost+' ●<small>'+(t.abilityCD>0?'Recarga '+Math.ceil(t.abilityCD)+'s':ab.desc)+'</small></button>';
    if(t.paragon)h+='<div class="tp-max">◆ ASCENSÃO — Poder máximo desbloqueado</div>';
    h+='<button class="tp-sell" data-act="sell">Vender por '+Math.floor(t.spent*CFG.sellRatio)+' ●</button>';
  } else {
    const ab=TOWER_ABILITIES[t.key];
    if(ab&&!t.paragon){
      h+='<div class="tp-path-ally-status">⚡ Habilidade Ativa: '+escHtml(ab.name)+' ('+(t.abilityCD>0?'Recarga '+Math.ceil(t.abilityCD)+'s':'Pronta')+') — sob comando de '+escHtml(allyName)+'</div>';
    }
    if(t.paragon)h+='<div class="tp-max">◆ ASCENSÃO — Poder máximo desbloqueado</div>';
    h+='<div class="tp-ally-sell-notice">🛡️ Torre sob comando de '+escHtml(allyName)+' (protegida contra venda e alterações de outros jogadores)</div>';
  }
  h+='</div>';
  p.innerHTML=h;
}

/* --- tooltips --- */
function tip(html,el){
  const t=$('tooltip'); t.innerHTML=html; t.classList.remove('hidden');
  const r=el.getBoundingClientRect(),w=t.offsetWidth,h=t.offsetHeight;
  let left=r.left-w-8,top=r.top;
  if(left<8){left=clamp(r.left,8,window.innerWidth-w-8);top=r.top-h-8;}
  t.style.left=left+'px'; t.style.top=clamp(top,8,window.innerHeight-h-8)+'px';
}
function hideTip(){ $('tooltip').classList.add('hidden'); }
function towerTip(key){
  const d=TOWERS[key],b=d.base;
  return '<b>'+d.name+'</b> — '+d.cost+' ●<br>Dano '+b.dmg+' · '+b.rate.toFixed(2)+'/s · Alcance '+b.range+'<br>Tipo: '+d.dtype+'<br><span class="d">'+d.short+'</span>'+(d.detectCamo?'<br><span class="d">✔ Detecta camuflados e acerta voadores</span>':'<br><span class="d">✖ Não vê camuflados nem voadores</span>')+'<br><span class="d">3 linhas de evolução com skins dinâmicas.</span>';
}

/* --- construção da lateral compacta (Estilo BTD6: ícone, atalho e preço; detalhes no tooltip) --- */
function buildSidebar(){
  const list=$('towerList'), supList=$('supportList');
  if(list)list.innerHTML='';
  if(supList)supList.innerHTML='';
  TOWER_ORDER.forEach((key,i)=>{
    const d=TOWERS[key],el=document.createElement('button');
    const isSup=d.role==='support';
    const isBtd6New=(key==='dartgun'||key==='dino'||key==='minefactory'||key==='portal');
    const kLabel=(TOWER_KEYS[i]||'').toUpperCase();
    el.className='tcard compact-tcard'+(isSup?' support-card':'')+(isBtd6New?' btd6-new-card':''); el.dataset.key=key;
    if(el.setAttribute)el.setAttribute('aria-label',d.name+' ('+d.cost+' moedas)');
    el.innerHTML='<span class="key">'+kLabel+'</span>'+(isBtd6New?'<span class="tbadge-new">NOVO</span>':'')+'<img class="ticon" src="'+UI.icons[key]+'" data-svg="assets/towers/'+key+'.svg" alt=""><span class="tname">'+d.name+'</span><span class="tcost">'+d.cost+' ●</span>';
    if(isSup&&supList)supList.appendChild(el);
    else list.appendChild(el);
    UI.cards[key]=el;
  });
  for(const host of [list,supList]){
    if(!host)continue;
    host.addEventListener('click',e=>{
      if(window.__qzSuppressNextCardClick){window.__qzSuppressNextCardClick=false;return;}
      const c=e.target.closest('.tcard');
      if(c)pickTower(c.dataset.key);
    });
    host.addEventListener('pointerdown',e=>{
      if(e.button===2||G.mode!=='play')return;
      const c=e.target.closest('.tcard');
      if(!c||!c.dataset.key)return;
      window.__qzTowerDrag={
        key:c.dataset.key,
        startX:e.clientX,
        startY:e.clientY,
        pointerId:e.pointerId,
        pointerType:e.pointerType,
        active:false
      };
    });
    host.addEventListener('pointerover',e=>{const c=e.target.closest('.tcard');if(c&&e.pointerType==='mouse')tip(towerTip(c.dataset.key),c);});
    host.addEventListener('pointerout',hideTip);
  }
  if(!window.__qzGlobalDragBound){
    window.__qzGlobalDragBound=true;
    window.addEventListener('pointermove',e=>{
      const dg=window.__qzTowerDrag;
      if(!dg)return;
      const distMoved=Math.hypot(e.clientX-dg.startX,e.clientY-dg.startY);
      if(!dg.active&&distMoved>10){
        const d=TOWERS[dg.key];
        if(!d||!Number.isFinite(G.money)||G.money<d.cost){
          noMoney();
          window.__qzTowerDrag=null;
          return;
        }
        dg.active=true;
        G.placing=dg.key;G.targeting=null;select(null);hideTip();
        if(IS_MOBILE)setSidebarMobileOpen(false);
        setHint(IS_MOBILE
          ?('Arraste para posicionar '+d.name+' (solte no verde para construir).')
          :('Arraste e solte no mapa para construir '+d.name+'.'));
      }
      if(dg.active){
        updateMouse(e,true);
      }
    });
    const finishDrag=e=>{
      const dg=window.__qzTowerDrag;
      if(!dg)return;
      window.__qzTowerDrag=null;
      if(!dg.active)return;
      window.__qzSuppressNextCardClick=true;
      setTimeout(()=>{window.__qzSuppressNextCardClick=false;},120);
      updateMouse(e,true);
      if(G.mode==='play'&&G.placing===dg.key){
        if(M.in&&!validSpot(M.x,M.y)){
          const t=dispatch({type:'place',key:dg.key,x:M.x,y:M.y});
          if(t){G.placing=null;setHint('');select(t);}
        }else if(!M.in){
          G.placing=null;setHint('');
        }
      }
    };
    window.addEventListener('pointerup',finishDrag);
    window.addEventListener('pointercancel',()=>{window.__qzTowerDrag=null;});
  }

  const pl=$('powerList');
  if(pl)pl.innerHTML='';
  POWER_ORDER.forEach(key=>{
    const P=POWERS[key],el=document.createElement('button');
    el.className='pcard'; el.dataset.key=key;
    el.innerHTML='<i></i><span class="pname">'+P.name+'</span><span class="pst"></span>';
    pl.appendChild(el); UI.pcards[key]=el; el._st=el.querySelector('.pst'); el._fill=el.querySelector('i');
  });
  pl.addEventListener('click',e=>{const c=e.target.closest('.pcard');if(c){dispatch({type:'power',key:c.dataset.key});Snd.play('ui');if(IS_MOBILE)setSidebarMobileOpen(false);}});
  pl.addEventListener('pointerover',e=>{const c=e.target.closest('.pcard');if(c&&e.pointerType==='mouse'){const P=POWERS[c.dataset.key];tip('<b>'+P.name+'</b> — '+P.cost+' ●<br><span class="d">'+P.desc+'</span><br><span class="d">Consumível: precisa pagar novamente em cada uso.</span>',c);}});
  pl.addEventListener('pointerout',hideTip);

  const qab=$('quickAbilityBar');
  if(qab){
    qab.addEventListener('click',e=>{
      const btn=e.target.closest('[data-qab-id]');
      if(!btn)return;
      const tid=Number(btn.dataset.qabId);
      const tw=towerById(tid);
      if(tw){dispatch({type:'ability',id:tw.id});}
    });
  }

  const tpEl=$('towerPanel');
  if(tpEl){
    const showNodeTip=nd=>{
      if(!nd)return;
      const html='<b>'+escHtml(nd.dataset.upName||'')+'</b> — <span style="color:#fbbf24">'+(nd.dataset.upCost||'0')+' ●</span>'
        +'<br><span class="d">'+escHtml(nd.dataset.upTier||'')+' · '+escHtml(nd.dataset.upStatus||'')+'</span>'
        +'<br><span>'+escHtml(nd.dataset.upDesc||'')+'</span>';
      tip(html,nd);
    };
    tpEl.addEventListener('pointerover',e=>{
      const nd=e.target.closest('[data-up-tip]');
      if(nd&&e.pointerType==='mouse')showNodeTip(nd);
    });
    tpEl.addEventListener('pointerout',e=>{
      if(e.target.closest('[data-up-tip]'))hideTip();
    });
    tpEl.addEventListener('click',e=>{
      const b=e.target.closest('[data-act]'); if(!b)return;
      const a=b.dataset.act;
      if(a==='nodeTip'){showNodeTip(b);Snd.play('ui');return;}
      if(a==='close'){hideTip();select(null);return;}
      if(a==='toggleCollapse'){hideTip();UI.panelCollapsed=!UI.panelCollapsed;UI.panelKey='';Snd.play('ui');refreshPanel();return;}
      if(a==='clearObs'){dispatch({type:'clearObs',id:Number(b.dataset.id)});return;}
      const t=G.selected; if(!t)return;
      const isMyTower=!COOP.active||!COOP.isMultiplayer||((t.ownerSlot??0)===(COOP.mySlot??0));
      if(!isMyTower&&(a==='up'||a==='paragon'||a==='ability'||a==='sell'||a==='prio'||a==='aim'||a==='portal_exit')){
        toast('Ação negada: Você só pode controlar e evoluir as suas próprias torres!','bad');
        Snd.play('err');
        return;
      }
      if(a==='prio'){dispatch({type:'prio',id:t.id,k:b.dataset.k});UI.panelKey='';Snd.play('ui');}
      else if(a==='aim'){G.targeting=G.targeting==='aim'?null:'aim';UI.panelKey='';setHint(G.targeting==='aim'?'Clique em qualquer ponto do mapa para travar a mira da Metralhadora Direcional.':'');Snd.play('ui');}
      else if(a==='portal_exit'){G.targeting=G.targeting==='portal_exit'?null:'portal_exit';UI.panelKey='';setHint(G.targeting==='portal_exit'?'Clique em um ponto da pista para definir a saída do Portal Tático.':'');Snd.play('ui');}
      else if(a==='up'){hideTip();dispatch({type:'up',id:t.id,i:+b.dataset.i,path:Number(b.dataset.path)});}
      else if(a==='paragon'){hideTip();dispatch({type:'paragon',id:t.id});}
      else if(a==='ability')dispatch({type:'ability',id:t.id});
      else if(a==='sell'){hideTip();dispatch({type:'sell',id:t.id});}
    });
  }
}

function updateQuickAbilities(){
  const qab=$('quickAbilityBar');
  if(!qab)return;
  const activeTowers=towers.filter(t=>{
    if(!TOWER_ABILITIES[t.key]||t.paragon)return false;
    if(COOP.active&&COOP.isMultiplayer){
      return (t.ownerSlot??0)===(COOP.mySlot??0);
    }
    return true;
  });
  const sig=activeTowers.map(t=>t.id+':'+Math.ceil(t.abilityCD)+':'+(G.money>=TOWER_ABILITIES[t.key].cost?1:0)).join('|');
  if(UI.quickKey===sig)return;
  UI.quickKey=sig;
  if(!activeTowers.length){
    qab.innerHTML='';
    return;
  }
  let html='';
  for(const t of activeTowers.slice(0,6)){
    const ab=TOWER_ABILITIES[t.key];
    const cd=Math.ceil(t.abilityCD);
    const pct=cd>0?Math.min(100,Math.round((t.abilityCD/ab.cd)*100)):0;
    const ready=cd<=0&&G.money>=ab.cost;
    html+='<button type="button" class="qab-btn'+(ready?' ready':'')+(cd>0?' cooling':'')+(G.money<ab.cost?' poor':'')+'" data-qab-id="'+t.id+'" title="'+escHtml(ab.name)+' ('+ab.cost+' ●) — '+escHtml(ab.desc)+'">'
      +'<i class="qab-cd-fill" style="height:'+pct+'%"></i>'
      +'<img src="'+UI.icons[t.key]+'" alt="">'
      +'<span class="qab-lbl">'+(cd>0?cd+'s':ab.cost+'●')+'</span>'
      +'</button>';
  }
  qab.innerHTML=html;
}

function updateUI(){
  setText('coins',String(Math.floor(G.money)));
  setText('life',String(G.life));
  setText('waveNum',String(WM.num));
  const rem=WM.remaining();
  setText('enemies',String(rem));
  const cbw=Math.min(100,Math.max(8,Math.round(G.money/2500*100)))+'%';
  if(UI.cache.cbw!==cbw){UI.cache.cbw=cbw;if($('hudCoinBar'))$('hudCoinBar').style.width=cbw;}
  const wbw=Math.min(100,Math.round(WM.num/CFG.victoryWave*100))+'%';
  if(UI.cache.wbw!==wbw){UI.cache.wbw=wbw;if($('hudWaveBar'))$('hudWaveBar').style.width=wbw;}
  if(UI.cache.wst!==WM.state){UI.cache.wst=WM.state;if($('hudWave'))$('hudWave').dataset.state=WM.state;}
  const hasBoss=zombies.some(z=>!z.dead&&!z.reached&&z.D.boss);
  const zth=hasBoss?'boss':rem>40?'high':rem>12?'mid':'low';
  if(UI.cache.zth!==zth){UI.cache.zth=zth;if($('hudZombies'))$('hudZombies').dataset.threat=zth;}
  const ztl=rem===0?'LIMPO':hasBoss?'🚨 CHEFE':rem>40?'CRÍTICO':rem>12?'ALERTA':'ATIVO';
  setText('hudThreatLbl',ztl);
  const zbw=(WM.total?Math.min(100,Math.round(rem/Math.max(1,WM.total)*100)):0)+'%';
  if(UI.cache.zbw!==zbw){UI.cache.zbw=zbw;if($('hudZombieBar'))$('hudZombieBar').style.width=zbw;}
  const lb=$('lifeBar'),pct=Math.round(100*G.life/CFG.baseLife)+'%'; if(UI.cache.lifeW!==pct){UI.cache.lifeW=pct;lb.style.width=pct;const lv=G.life/CFG.baseLife>.5?'ok':G.life/CFG.baseLife>.25?'mid':'low';lb.dataset.lv=lv;const lh=$('lifeHud');lh.dataset.lv=lv;$('lifeGhost').style.width=pct;if(UI.lastLife!==undefined&&G.life<UI.lastLife){lh.classList.remove('hit');void lh.offsetWidth;lh.classList.add('hit');}UI.lastLife=G.life;}
  for(const key of TOWER_ORDER){setCls(UI.cards[key],'tc'+key,'poor',G.money<TOWERS[key].cost);setCls(UI.cards[key],'ts'+key,'sel',G.placing===key);}
  for(const key of POWER_ORDER){
    const st=powerState[key],P=POWERS[key],el=UI.pcards[key];
    let txt,fill=0;
    if(key==='supply'){const sp=powerState.supply;if(sp.uses>=3){txt='ESGOTADO 0/3';fill=100;}else if(G.simT<sp.nextAt){txt='EM '+fmtTime(sp.nextAt-G.simT)+'  '+(3-sp.uses)+'/3';fill=100*(1-(sp.nextAt-G.simT)/300);}else txt='USAR '+P.cost+'  '+(3-sp.uses)+'/3';}else txt='USAR '+P.cost;
    if(UI.cache['pt'+key]!==txt){UI.cache['pt'+key]=txt;el._st.textContent=txt;}
    const f=Math.round(fill)+'%'; if(UI.cache['pf'+key]!==f){UI.cache['pf'+key]=f;el._fill.style.width=f;}
    setCls(el,'pr'+key,'ready',G.money>=P.cost&&(key!=='supply'||supplyOk()));
    setCls(el,'pp'+key,'poor',G.money<P.cost||(key==='supply'&&!supplyOk()));
    setCls(el,'ps'+key,'sel',G.targeting===key);
  }
  // rodapé
  let prog=0,txt;
  if(G.mode!=='play')txt='—';
  else if(WM.state==='active'){
    prog=WM.total?WM.done/WM.total:0;
    txt='Onda '+WM.num+' — '+WM.remaining()+' restantes ('+Math.round(prog*100)+'%)';
  } else if(WM.prep!==null){prog=1-Math.max(0,WM.prep)/CFG.prepTime;txt='Próxima onda em '+Math.ceil(Math.max(0,WM.prep))+'s — '+describeWave(WM.num+1);}
  else txt=(WM.num===0?'Monte sua defesa e inicie a onda 1: ':'Próxima (onda '+(WM.num+1)+'): ')+describeWave(WM.num+1);
  setText('progTxt',txt);
  const pw=Math.round(prog*100)+'%'; if(UI.cache.pw!==pw){UI.cache.pw=pw;$('progBar').style.width=pw;}
  setText('btnNext','▶ Iniciar onda '+(WM.num+1));
  setCls($('btnCancel'),'bc','hidden',!(G.placing||G.targeting));
  setCls($('btnMobCancel'),'mbc','hidden',!(G.placing||G.targeting||G.selected||G.selectedObs));
  const showPause=G.paused&&G.mode==='play'&&UI.endEl.classList.contains('hidden');
  setCls($('pauseOv'),'po','hidden',!showPause);
  setText('btnPause',G.paused?'▶':'❚❚');
  setText('btnMobPause',G.paused?'▶':'❚❚');
  setText('btnMobSpeed','⚡ '+G.speed+'x');
  updateQuickAbilities();
  refreshPanel();
}

/* --- progresso local, medalhas de dificuldade e recordes --- */
const SAVE_KEY='quarentenaz_career_v4';
let career={bestWave:0,totalKills:0,games:0,lastMap:'four',lastDifficulty:'normal',medals:{},techPoints:0,techPerks:{},activeCommander:'vance',commanderXp:{vance:0,elena:0,marcus:0}};
function loadCareer(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    const sig=localStorage.getItem(SAVE_KEY+'_sig');
    if(raw){
      if(sig&&sig!==computeLocalSig('career',raw)){
        SecurityGuard.tamperCount++;
      }else{
        const d=JSON.parse(raw);
        if(d&&typeof d==='object'){
          if(Number.isFinite(d.bestWave)&&d.bestWave>=0&&d.bestWave<=5000)career.bestWave=Math.floor(d.bestWave);
          if(Number.isFinite(d.totalKills)&&d.totalKills>=0&&d.totalKills<=100000000)career.totalKills=Math.floor(d.totalKills);
          if(Number.isFinite(d.games)&&d.games>=0&&d.games<=1000000)career.games=Math.floor(d.games);
          if(typeof d.lastMap==='string'&&MAPS[d.lastMap])career.lastMap=d.lastMap;
          if(['easy','normal','hard','apocalypse'].includes(d.lastDifficulty))career.lastDifficulty=d.lastDifficulty;
          if(d.medals&&typeof d.medals==='object')career.medals=d.medals;
          if(Number.isFinite(d.techPoints)&&d.techPoints>=0&&d.techPoints<=999999)career.techPoints=Math.floor(d.techPoints);
          if(d.techPerks&&typeof d.techPerks==='object')career.techPerks=d.techPerks;
          if(['vance','elena','marcus'].includes(d.activeCommander))career.activeCommander=d.activeCommander;
          if(d.commanderXp&&typeof d.commanderXp==='object')career.commanderXp=Object.assign({vance:0,elena:0,marcus:0},d.commanderXp);
        }
      }
    }
  }catch(e){}
  updateCareerLabel();
}
function saveCareer(){
  try{
    const sanitized={
      bestWave:Math.max(0,Math.min(5000,Math.floor(career.bestWave||0))),
      totalKills:Math.max(0,Math.min(100000000,Math.floor(career.totalKills||0))),
      games:Math.max(0,Math.min(1000000,Math.floor(career.games||0))),
      lastMap:MAPS[career.lastMap]?career.lastMap:'four',
      lastDifficulty:['easy','normal','hard','apocalypse'].includes(career.lastDifficulty)?career.lastDifficulty:'normal',
      medals:career.medals&&typeof career.medals==='object'?career.medals:{},
      techPoints:Math.max(0,Math.min(999999,Math.floor(career.techPoints||0))),
      techPerks:(career.techPerks&&typeof career.techPerks==='object')?career.techPerks:{},
      activeCommander:['vance','elena','marcus'].includes(career.activeCommander)?career.activeCommander:'vance',
      commanderXp:(career.commanderXp&&typeof career.commanderXp==='object')?career.commanderXp:{vance:0,elena:0,marcus:0}
    };
    const js=JSON.stringify(sanitized);
    localStorage.setItem(SAVE_KEY,js);
    localStorage.setItem(SAVE_KEY+'_sig',computeLocalSig('career',js));
  }catch(e){toast('Não foi possível salvar o recorde neste navegador.','bad');}
  updateCareerLabel();
}
function renderMapMedals(){
  const medals=career.medals||{};
  const defs=[
    {k:'easy',lbl:'Fácil',ico:'🥉',cls:'mm-easy'},
    {k:'normal',lbl:'Normal',ico:'🥈',cls:'mm-normal'},
    {k:'hard',lbl:'Difícil',ico:'🥇',cls:'mm-hard'},
    {k:'apocalypse',lbl:'Apocalipse',ico:'☣',cls:'mm-apoc'}
  ];
  document.querySelectorAll('.map-card').forEach(card=>{
    const mKey=card.dataset.map;
    if(!mKey)return;
    const mRec=medals[mKey]||{};
    let bar=card.querySelector('.map-medals');
    if(!bar){
      bar=document.createElement('div');
      bar.className='map-medals';
      card.appendChild(bar);
    }
    bar.innerHTML=defs.map(d=>{
      const won=!!mRec[d.k];
      return '<span class="map-medal '+d.cls+(won?' won':' locked')+'" title="Medalha '+d.lbl+(won?' (Conquistada!)':' (Não vencida)')+'">'+d.ico+'</span>';
    }).join('');
  });
}
function updateCareerLabel(){
  const el=$('careerRecord');
  if(el)el.textContent='Recorde: onda '+career.bestWave+' · Zumbis eliminados: '+career.totalKills+' · Partidas: '+career.games+' · Biocélulas: '+(career.techPoints||0);
  if($('homeStatTech'))$('homeStatTech').textContent=(career.techPoints||0)+' 🔬';
}

/* --- fim de jogo --- */
function endGame(){ if(G.mode==='over')return; G.mode='over'; try{localStorage.removeItem(GAME_SAVE_KEY);}catch(e){} refreshContinue(); career.bestWave=Math.max(career.bestWave,WM.num);career.totalKills+=G.kills;career.games++;career.lastMap=activeMap;career.lastDifficulty=activeDifficulty;saveCareer();showEnd(false); }
function showEnd(victory){
  $('endTitle').textContent=victory?'VITÓRIA!':'DERROTA';
  $('endTitle').classList.toggle('win',victory);
  $('endSub').textContent=victory?('Você sobreviveu a '+CFG.victoryWave+' ondas! Pode continuar em modo infinito.'):'A base foi destruída pelos zumbis.';
  $('endStats').innerHTML='<span>Onda alcançada</span><span>'+WM.num+'</span><span>Zumbis eliminados</span><span>'+G.kills+'</span><span>Moedas obtidas</span><span>'+Math.floor(G.earned)+'</span><span>Tempo sobrevivido</span><span>'+fmtTime(G.time)+'</span>';
  psAdd(victory?'wins':'losses');if(victory&&activeDifficulty==='apocalypse')psAdd('winApoc');checkAch();
  {const f=G.life/CFG.baseLife;const st=victory?(f>=.9?3:f>=.5?2:1):(WM.num>=30?2:WM.num>=15?1:0);$('endStats').innerHTML+='<span>Avaliação</span><span style="color:#ffb020;letter-spacing:3px">'+'★'.repeat(st)+'☆'.repeat(3-st)+'</span>';}
  if(G.newAch&&G.newAch.length)$('endStats').innerHTML+='<span>Conquistas</span><span style="color:#ffb020">'+G.newAch.length+' nova(s)</span>';
  // Concede XP de Batalha para o Comandante Ativo (Nível 1 a 15)
  {
    const cmdId=career.activeCommander||'vance';
    if(!career.commanderXp||typeof career.commanderXp!=='object')career.commanderXp={vance:0,elena:0,marcus:0};
    const xpGain=Math.max(15,(WM.num||1)*32+(victory?180:40));
    career.commanderXp[cmdId]=(career.commanderXp[cmdId]||0)+xpGain;
    saveCareer();
    $('endStats').innerHTML+='<span>XP do Comandante</span><span style="color:#38bdf8">+'+xpGain+' XP</span>';
  }
  recordRankEntry(WM.num,G.time,G.kills,activeMap,activeDifficulty);
  if(COOP.active && COOP.isMultiplayer && window.QZ_NET_MP && typeof window.QZ_NET_MP.submitMultiplayerScore === 'function'){
    window.QZ_NET_MP.submitMultiplayerScore({
      mode: 'coop',
      wave: WM.num,
      kills: G.kills,
      map: activeMap,
      diff: activeDifficulty,
      players: (COOP.players || []).map(p => p.name || 'Comandante'),
      roomCode: COOP.roomCode
    }).catch(()=>{});
  }
  if($('endPlayerName'))$('endPlayerName').value=getPlayerName();
  $('btnContinue').classList.toggle('hidden',!victory);
  $('endScreen').classList.remove('hidden');
  if(!victory)Snd.play('hurt');
}
function hideEnd(){ $('endScreen').classList.add('hidden'); }

/* --- reinício / início --- */
function resetGame(seed){
  G.seed=(seed>>>0)||(COOP.active&&COOP.seed?(COOP.seed>>>0):(((Math.random()*4294967296)>>>0)||1));seedRng(G.seed);G.tick=0;TID=0;COOP._towerSeq=0;CMDLOG.length=0;
  G.auto0=G.auto;ACC=0;G.replay=null;G.newAch=[];G.stats={bosses:0,leaks:0,paragons:0};G.banner=null;G.tips=null;
  try{if(!localStorage.getItem('ztd_v19_tut'))G.tips=[[3,'Escolha uma torre na lista à direita e clique no mapa para construir.'],[30,'Clique numa torre construída para melhorá-la: são 3 caminhos de upgrade.'],[70,'Camuflados e voadores só são atacados por Radar e Drone.'],[140,'3 torres iguais no nível máximo do mesmo caminho formam uma ASCENSÃO.']];}catch(e){}
  const extraMoney=getTechBonus('initial_coins')*50;
  const extraLife=getTechBonus('base_armor')*5;
  G.money=CFG.startMoney+extraMoney;G.life=CFG.baseLife+extraLife;G.kills=0;G.earned=0;G.time=0;G.simT=0;G.shake=0;G.flash=0;
  G.emergencyCashWave=0;
  G.weather=null;
  callinState.napalm.cd=0;callinState.overclock.cd=0;callinState.barricade.cd=0;callinState.activeOverclock=0;callinState.barricades.length=0;
  updateCallinUI();
  updateWeatherUI(null);
  G.paused=false;G.speed=1;G.placing=null;G.targeting=null;G.selected=null;G.selectedObs=null;G.won=false;G.mode='play';
  for(const a of [towers,zombies,projs,parts,popups,rings,bolts,hazards,mines,bombs,areas,allies,portals])a.length=0;
  spawnMapObstacles();
  WM.reset();
  for(const k of POWER_ORDER){powerState[k].owned=false;powerState[k].cd=0;} powerState.supply.uses=0;powerState.supply.nextAt=0;
  SecurityGuard.syncVault();
  OnlineAPI.startRunTicket(activeMap,activeDifficulty,G.seed);
  UI.panelKey='';UI.quickKey='';setHint('');hideEnd();setSpeedBtns();
}
function setSpeedBtns(){ document.querySelectorAll('.spd').forEach(b=>b.classList.toggle('active',+b.dataset.speed===G.speed)); }
function setSpeed(n){ G.speed=n; setSpeedBtns(); Snd.play('ui'); }
function togglePause(){ if(G.mode!=='play')return; if(!$('endScreen').classList.contains('hidden'))return; G.paused=!G.paused; Snd.play('ui'); }
function setAuto(on){ G.auto=on; $('chkAuto').checked=on; if(G.mode==='play'&&WM.state==='idle'&&WM.num>0){WM.prep=on?(WM.prep===null?CFG.prepTime:WM.prep):null;} }

/* --- entrada híbrida mouse / toque (Pointer Events API + Finger Offset BTD6) --- */
function updateMouse(e,applyTouchOffset){
  const cv=$('game');
  if(!cv)return;
  const r=cv.getBoundingClientRect();
  if(!r.width||!r.height)return;
  const sx=(e.clientX-r.left)*(VIEW.cssW/r.width);
  const sy=(e.clientY-r.top)*(VIEW.cssH/r.height);
  M.x=(sx-VIEW.ox)/VIEW.scale;
  let wy=(sy-VIEW.oy)/VIEW.scale;
  // Deslocamento vertical inteligente (Finger Offset) durante arrasto por toque no mobile para ver a torre acima do dedo
  if(applyTouchOffset&&(e.pointerType==='touch'||IS_MOBILE)){
    wy=Math.max(18,wy-44);
  }
  M.y=wy;
  M.in=M.x>=0&&M.x<=W&&M.y>=0&&M.y<=H;
}
function canvasClick(e){
  if(G.mode!=='play'||isPortraitBlocked())return;
  if(!Number.isFinite(M.x)||!Number.isFinite(M.y))return;
  if(G.targeting==='aim'&&G.selected){
    dispatch({type:'aim',id:G.selected.id,x:M.x,y:M.y});
    G.targeting=null;setHint('');
    return;
  }
  if(G.targeting==='portal_exit'&&G.selected){
    dispatch({type:'portal_exit',id:G.selected.id,x:M.x,y:M.y});
    G.targeting=null;setHint('');
    return;
  }
  if(G.targeting){
    const k=G.targeting;
    if(k==='mines'){const p=nearestPathProg(M.x,M.y);if(p.dist>70){toast('Escolha um ponto sobre o caminho','bad');Snd.play('err');return;}}
    Powers.activate(k,M.x,M.y); return;
  }
  if(G.placing){
    const key=G.placing,t=dispatch({type:'place',key,x:M.x,y:M.y});
    if(t&&!e.shiftKey){G.placing=null;setHint('');select(t);} 
    else if(t&&e.shiftKey&&G.money<TOWERS[key].cost){G.placing=null;setHint('');}
    return;
  }
  // Raio de seleção ampliado no modo mobile para facilitar o toque nas torres
  let best=null,bd=IS_MOBILE?32:22;
  for(const t of towers){const d=dist(t.x,t.y,M.x,M.y);if(d<bd){bd=d;best=t;}}
  if(best){select(best);Snd.play('ui');return;}
  // Verifica clique em obstáculo destrutível do mapa
  for(const ob of obstacles){
    if(!ob.cleared&&dist(ob.x,ob.y,M.x,M.y)<=ob.r+8){
      G.selected=null;G.selectedObs=ob;UI.panelKey='';Snd.play('ui');return;
    }
  }
  select(null);
}

/* --- gerenciamento de plataforma (PC vs Mobile) e orientação obrigatória --- */
function syncOrientationState(){
  const blocked=isPortraitBlocked();
  document.body.classList.toggle('is-portrait',blocked);
  const ov=$('rotateDeviceOverlay');
  if(ov)ov.classList.toggle('active-lock',blocked);
  if(blocked&&G.mode==='play'&&!G.paused){
    G.paused=true;
    G._pausedByRotate=true;
  } else if(!blocked&&G._pausedByRotate){
    G._pausedByRotate=false;
  }
  return blocked;
}

function applyPlatformMode(pref){
  const mode=(pref==='pc'||pref==='mobile'||pref==='auto')?pref:getPlatformPref();
  try{localStorage.setItem(PLATFORM_KEY,mode);}catch(e){}
  const autoDetected=detectDevice();
  IS_MOBILE=mode==='mobile'?true:mode==='pc'?false:autoDetected;
  window.IS_MOBILE=IS_MOBILE;
  document.body.classList.toggle('is-mobile',IS_MOBILE);
  document.body.classList.toggle('is-desktop',!IS_MOBILE);

  if($('settingsPlatform'))$('settingsPlatform').value=mode;
  document.querySelectorAll('.platform-opt').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.platform===mode);
  });
  const stLbl=$('platformStatusLabel');
  if(stLbl){
    if(mode==='auto')stLbl.textContent='Auto: '+(IS_MOBILE?'📱 Mobile / Toque':'🖥 PC / Mouse');
    else stLbl.textContent=IS_MOBILE?'Ativo: 📱 Mobile / Toque':'Ativo: 🖥 PC / Mouse';
  }
  applyQuality();
  const btnCancel=$('btnCancel');
  if(btnCancel){
    if(IS_MOBILE){
      btnCancel.textContent='✕ Cancelar';
      btnCancel.title='Cancelar posicionamento ou mira';
    }else{
      btnCancel.textContent='Cancelar (ESC)';
      btnCancel.title='Cancela a ação atual (ESC)';
    }
  }
  fitCanvas();
  if($('startScreen')&&!$('startScreen').classList.contains('hidden'))renderMapPagination(true);
}

/* --- ajuste de tamanho e densidade de pixels (DPR controlado + proporção 1:1 sem achatamento) --- */
function fitCanvas(){
  syncOrientationState();
  const st=$('stage'),c=$('game');
  if(!st||!c)return;
  const aw=Math.floor(st.clientWidth),ah=Math.floor(st.clientHeight);
  if(aw<=0||ah<=0)return;
  const dpr=IS_MOBILE?Math.min(window.devicePixelRatio||1,1.5):(window.devicePixelRatio||1);
  CANVAS_DPR=dpr;
  VIEW.cssW=aw;
  VIEW.cssH=ah;
  // Escala 100% uniforme (scaleX === scaleY) para nunca achatar/deformar os 18 mapas no mobile ou PC.
  // Em telas widescreen (aw/ah > W/H), utiliza H_SAFE = 584 (todos os 18 caminhos e a base ficam em Y=75..575)
  // para aproveitar melhor a altura útil sem cortar nenhum caminho, torre ou base.
  const hSafe=(aw/ah>W/H)?584:H;
  const sc=Math.min(aw/W,ah/hSafe);
  VIEW.scale=sc>0?sc:1;
  VIEW.ox=(aw-W*VIEW.scale)*0.5;
  VIEW.oy=(ah-H*VIEW.scale)*0.5;
  VIEW.padX=VIEW.ox>0?Math.ceil(VIEW.ox/VIEW.scale)+2:0;
  VIEW.padY=VIEW.oy>0?Math.ceil(VIEW.oy/VIEW.scale)+2:0;
  const targetW=Math.max(1,Math.round(aw*dpr)),targetH=Math.max(1,Math.round(ah*dpr));
  if(c.width!==targetW||c.height!==targetH){
    c.width=targetW;
    c.height=targetH;
  }
  c.style.width=aw+'px'; c.style.height=ah+'px';
  const bgCv=$('bgCanvas');
  if(bgCv){
    if(bgCv.width!==targetW||bgCv.height!==targetH){
      bgCv.width=targetW;
      bgCv.height=targetH;
    }
    bgCv.style.width=aw+'px'; bgCv.style.height=ah+'px';
    syncBgCanvas();
  }
}

function applyQuality(){
  PERF.low=false;PERF.n=0;PERF.avg=.016;
  const q=$('qualitySelect')?$('qualitySelect').value:'balanced';
  const baseParts=({high:1200,balanced:900,low:350})[q]||900;
  const baseWeather=({high:110,balanced:55,low:0})[q];
  const wVal=baseWeather===undefined?55:baseWeather;
  // Em modo Mobile, corta pela metade o limite de partículas e clima para garantir 60 FPS estáveis
  CFG.maxParts=IS_MOBILE?Math.floor(baseParts*0.5):baseParts;
  CFG.weatherN=IS_MOBILE?Math.floor(wVal*0.5):wVal;
}
const MENU_SCENE={base:null,zombies:[],embers:[],tracers:[],shotCD:0};
function initMenuScene(){
  const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const g=cv.getContext('2d');
  let sd=19;const r=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;};
  // Céu noturno apocalíptico com horizonte em chamas e névoa tóxica
  const sky=g.createLinearGradient(0,0,0,720);
  sky.addColorStop(0,'#03050a');sky.addColorStop(.42,'#0a1326');sky.addColorStop(.72,'#1e1930');sky.addColorStop(.92,'#381d24');sky.addColorStop(1,'#120b12');
  g.fillStyle=sky;g.fillRect(0,0,1280,720);
  // Estrelas sutis no topo
  for(let i=0;i<160;i++){g.fillStyle='rgba(220,235,255,'+(.15+r()*.55)+')';const s=r()<.12?2:1;g.fillRect(r()*1280,r()*340,s,s);}
  // Lua de sangue / âmbar no quadrante direito
  const mx=960,my=155;
  const mg=g.createRadialGradient(mx,my,12,mx,my,240);
  mg.addColorStop(0,'rgba(255,215,160,.92)');mg.addColorStop(.16,'rgba(255,140,60,.42)');mg.addColorStop(.45,'rgba(255,70,40,.12)');mg.addColorStop(1,'rgba(255,50,30,0)');
  g.fillStyle=mg;g.fillRect(mx-250,0,500,420);
  g.fillStyle='#ffe6c2';g.beginPath();g.arc(mx,my,42,0,6.283);g.fill();
  g.fillStyle='rgba(210,140,100,.22)';g.beginPath();g.arc(mx-12,my-8,11,0,6.283);g.arc(mx+14,my+10,15,0,6.283);g.arc(mx+6,my-16,7,0,6.283);g.fill();
  // Camadas de prédios em ruínas no horizonte
  const layers=[
    {col:'#0c1324',by:540,mn:100,mx:250,win:.08,wCol:'#5fb7d5'},
    {col:'#080d1a',by:600,mn:130,mx:310,win:.14,wCol:'#ffb040'},
    {col:'#050811',by:665,mn:75,mx:195,win:.10,wCol:'#ff7a2a'}
  ];
  for(const L of layers){
    for(let x=-30;x<1310;){
      const w=54+r()*88,hh=L.mn+r()*(L.mx-L.mn),topY=L.by-hh;
      g.fillStyle=L.col;g.fillRect(x,topY,w,hh+180);
      // Topo quebrado / ruína e antenas
      if(r()<.45){g.fillStyle=L.col;g.fillRect(x+6,topY-12,w*.45,12);}
      if(r()<.3){g.fillStyle='#182238';g.fillRect(x+w*.5,topY-28,2,28);g.fillStyle='#ff3b30';g.fillRect(x+w*.5-1,topY-30,4,4);}
      for(let wy=topY+14;wy<L.by-12;wy+=16){
        for(let wx=x+8;wx<x+w-10;wx+=14){
          if(r()<L.win){g.fillStyle=r()<.25?'#ff6a2a':L.wCol;g.globalAlpha=.35+r()*.55;g.fillRect(wx,wy,5,8);g.globalAlpha=1;}
        }
      }
      x+=w+4+r()*10;
    }
  }
  // Brilho de incêndio distante no horizonte direito
  const fg=g.createRadialGradient(820,590,10,820,590,340);
  fg.addColorStop(0,'rgba(255,95,25,.34)');fg.addColorStop(.5,'rgba(255,50,20,.12)');fg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=fg;g.fillRect(460,300,720,400);
  // Silhueta da fortaleza / base militar à esquerda
  g.fillStyle='#04070f';
  g.beginPath();g.moveTo(0,470);g.lineTo(290,470);g.lineTo(335,535);g.lineTo(410,535);g.lineTo(435,660);g.lineTo(0,660);g.closePath();g.fill();
  // Torre de vigia da base
  g.fillRect(345,425,36,115);
  g.fillStyle='#0a1222';g.fillRect(333,408,60,22);
  g.strokeStyle='#27c9ff';g.lineWidth=1.5;g.strokeRect(333,408,60,22);
  // Cerca de contenção e arame farpado no plano de fundo
  g.fillStyle='#050811';
  for(let x=420;x<1280;x+=32){g.fillRect(x,628,4,92);}
  g.fillRect(410,644,870,3);g.fillRect(410,668,870,3);
  // Solo escuro no primeiro plano
  g.fillStyle='#03050a';g.fillRect(0,655,1280,65);
  MENU_SCENE.base=cv;
  // Inicializa horda de silhuetas e partículas do menu
  MENU_SCENE.zombies.length=0;
  for(let i=0;i<14;i++){
    MENU_SCENE.zombies.push({
      x:520+r()*740,
      y:642+r()*46,
      sc:.58+r()*.52,
      spd:6+r()*12,
      ph:r()*6.283,
      big:i%6===0
    });
  }
  MENU_SCENE.zombies.sort((a,b)=>a.y-b.y);
  MENU_SCENE.embers.length=0;
  for(let i=0;i<55;i++){
    MENU_SCENE.embers.push({
      x:r()*1280,y:r()*720,
      vx:-12-r()*24,vy:-15-r()*35,
      sz:1+r()*2.4,
      col:r()<.3?'#27c9ff':r()<.75?'#ff8a2a':'#ffd166',
      a:.25+r()*.65
    });
  }
}
function drawHomeArt(){
  if(!MENU_SCENE.base)initMenuScene();
  $('homeScreen').style.backgroundImage='url('+MENU_SCENE.base.toDataURL('image/jpeg',.88)+')';
  $('homeScreen').style.backgroundSize='cover';$('homeScreen').style.backgroundPosition='center';
}
function renderMenuBg(dt){
  const mc=$('menuBgCanvas');
  if(!mc||!document.body.classList.contains('menu-mode')||$('homeScreen').classList.contains('hidden'))return;
  if(!MENU_SCENE.base)initMenuScene();
  const g=mc.getContext('2d'),tm=G.anim;
  g.drawImage(MENU_SCENE.base,0,0);

  // Feixes de holofote tático varrendo o céu e a horda
  g.save();
  g.globalCompositeOperation='lighter';
  const a1=-.18+Math.sin(tm*.55)*.22;
  const beam1=g.createLinearGradient(385,418,385+Math.cos(a1)*850,418+Math.sin(a1)*850);
  beam1.addColorStop(0,'rgba(39,201,255,.22)');beam1.addColorStop(.55,'rgba(39,201,255,.06)');beam1.addColorStop(1,'rgba(39,201,255,0)');
  g.fillStyle=beam1;
  g.beginPath();g.moveTo(385,418);g.lineTo(385+Math.cos(a1-.11)*920,418+Math.sin(a1-.11)*920);g.lineTo(385+Math.cos(a1+.11)*920,418+Math.sin(a1+.11)*920);g.closePath();g.fill();

  const a2=.16+Math.sin(tm*.82+1.7)*.14;
  const beam2=g.createLinearGradient(392,422,392+Math.cos(a2)*760,422+Math.sin(a2)*760);
  beam2.addColorStop(0,'rgba(255,150,50,.18)');beam2.addColorStop(.6,'rgba(255,120,30,.05)');beam2.addColorStop(1,'rgba(255,120,30,0)');
  g.fillStyle=beam2;
  g.beginPath();g.moveTo(392,422);g.lineTo(392+Math.cos(a2-.08)*800,422+Math.sin(a2-.08)*800);g.lineTo(392+Math.cos(a2+.08)*800,422+Math.sin(a2+.08)*800);g.closePath();g.fill();
  g.restore();

  // Disparos ocasionais da torreta de defesa contra a horda
  MENU_SCENE.shotCD-=dt;
  if(MENU_SCENE.shotCD<=0){
    MENU_SCENE.shotCD=.22+Math.random()*.65;
    const tz=MENU_SCENE.zombies[(Math.random()*MENU_SCENE.zombies.length)|0];
    if(tz){
      MENU_SCENE.tracers.push({x0:408,y0:524,x1:tz.x,y1:tz.y-28*tz.sc,life:.11});
    }
  }
  for(let i=MENU_SCENE.tracers.length-1;i>=0;i--){
    const tr=MENU_SCENE.tracers[i];tr.life-=dt;
    if(tr.life<=0){MENU_SCENE.tracers.splice(i,1);continue;}
    g.save();
    g.strokeStyle='rgba(255,210,90,'+(tr.life/.11)+')';g.lineWidth=2.2;
    g.beginPath();g.moveTo(tr.x0,tr.y0);g.lineTo(tr.x1,tr.y1);g.stroke();
    g.fillStyle='rgba(255,180,60,.85)';g.beginPath();g.arc(tr.x0,tr.y0,6,0,6.283);g.fill();
    g.fillStyle='#ff9a2a';g.beginPath();g.arc(tr.x1,tr.y1,3.5,0,6.283);g.fill();
    g.restore();
  }

  // Silhuetas de zumbis caminhando na névoa em direção à base
  for(const z of MENU_SCENE.zombies){
    z.x-=z.spd*dt;
    if(z.x<455)z.x=1310;
    const sc=z.sc*(z.big?1.45:1),sway=Math.sin(tm*3.2+z.ph)*3*sc,step=Math.sin(tm*5.5+z.ph)*5*sc;
    const zx=z.x,zy=z.y;
    g.fillStyle='#04070e';
    // Pernas
    g.fillRect(zx-5*sc+step*.4,zy-24*sc,5*sc,24*sc);
    g.fillRect(zx+2*sc-step*.4,zy-24*sc,5*sc,24*sc);
    // Tronco inclinado
    g.fillRect(zx-8*sc+sway*.3,zy-54*sc,16*sc,32*sc);
    // Braços estendidos para a esquerda
    g.fillRect(zx-26*sc+sway,zy-50*sc,20*sc,5*sc);
    g.fillRect(zx-22*sc+sway,zy-42*sc,16*sc,4*sc);
    // Cabeça
    g.beginPath();g.arc(zx-2*sc+sway*.5,zy-62*sc,8*sc,0,6.283);g.fill();
    // Olhos infectados brilhantes
    g.fillStyle=z.big?'#ff4a3d':'#ff9a2a';
    g.fillRect(zx-8*sc+sway*.5,zy-64*sc,2.2*sc,2.2*sc);
  }

  // Névoa baixa volumétrica
  const fog=g.createLinearGradient(0,550,0,720);
  fog.addColorStop(0,'rgba(12,20,36,0)');fog.addColorStop(.65,'rgba(14,22,38,.55)');fog.addColorStop(1,'rgba(5,8,16,.92)');
  g.fillStyle=fog;g.fillRect(0,550,1280,170);

  // Brasas e esporos subindo
  for(const p of MENU_SCENE.embers){
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.x<-10)p.x=1290;
    if(p.y<-10)p.y=725;
    g.fillStyle=p.col;
    g.globalAlpha=p.a*(.6+.4*Math.sin(tm*3+p.x*.02));
    g.fillRect(p.x,p.y,p.sz,p.sz);
  }
  g.globalAlpha=1;
}
let THUMBS_DONE=false;
const MAP_THUMB_CACHE={};
let mapPage=0,activeMapFilter='all';
function getMapsPerPage(){
  try{
    const h=window.innerHeight||720, w=window.innerWidth||1280;
    if((IS_MOBILE||h<=540)&&w>h) return 3; // mobile paisagem: 1 linha com 3 mapas grandes
    if(IS_MOBILE||w<=768) return 4;       // mobile retrato / tablet estreito: 2x2 mapas grandes
  }catch(_){}
  return 6;
}

function ensureMapThumb(id){
  if(!id||!MAPS[id])return;
  if(!MAP_THUMB_CACHE[id]){
    const prev=activeMap;
    try{
      selectMap(id);
      const cv=document.createElement('canvas');cv.width=360;cv.height=240;
      cv.getContext('2d').drawImage(BG,0,0,360,240);
      MAP_THUMB_CACHE[id]=cv.toDataURL('image/jpeg',.9);
    }catch(e){}
    selectMap(prev);
  }
  const url=MAP_THUMB_CACHE[id];
  if(!url)return;
  const th=document.querySelector('.map-card[data-map="'+id+'"] .map-thumb');
  if(th){
    th.style.backgroundImage='none';
    let img=th._thumbImg;
    if(!img){
      img=document.createElement('img');
      img.className='map-thumb-img';
      img.alt=(MAPS[id]&&MAPS[id].name)||id;
      th._thumbImg=img;
      th.appendChild(img);
    }
    img.src=url;
  }
}

function buildMapThumbs(){ // miniaturas = o próprio cenário gerado por código, reduzido sob demanda
  // Garante imediatamente apenas as 6 miniaturas da página visível atual (evita travar a CPU no mobile)
  const visibleCards=Array.from(document.querySelectorAll('.map-card:not(.hidden-page):not(.hidden-filter)'));
  visibleCards.forEach(c=>ensureMapThumb(c.dataset.map));
  if(THUMBS_DONE)return;
  THUMBS_DONE=true;
  const ids=Object.keys(MAPS);let i=0;
  const next=()=>{
    if(i>=ids.length)return;
    // Se o jogador já iniciou a partida, adia a geração de miniaturas restantes
    if(!document.body.classList.contains('menu-mode')||$('startScreen').classList.contains('hidden')){
      THUMBS_DONE=false;
      return;
    }
    const id=ids[i++];
    if(!MAP_THUMB_CACHE[id])ensureMapThumb(id);
    setTimeout(next,IS_MOBILE?140:35);
  };
  setTimeout(next,120);
}

function renderMapPagination(keepSelectedVisible){
  const allCards=Array.from(document.querySelectorAll('.map-card'));
  if(!allCards.length)return;
  allCards.forEach(c=>{
    c.classList.toggle('hidden-filter',activeMapFilter!=='all'&&c.dataset.diff!==activeMapFilter);
  });
  const filtered=allCards.filter(c=>!c.classList.contains('hidden-filter'));
  const perPage=getMapsPerPage();
  const totalPages=Math.max(1,Math.ceil(filtered.length/perPage));
  if(keepSelectedVisible){
    const selVal=$('mapSelect')?$('mapSelect').value:'';
    const idx=filtered.findIndex(c=>c.dataset.map===selVal);
    if(idx>=0)mapPage=Math.floor(idx/perPage);
  }
  if(mapPage>=totalPages)mapPage=0;
  if(mapPage<0)mapPage=totalPages-1;
  const start=mapPage*perPage;
  const pageCards=filtered.slice(start,start+perPage);
  allCards.forEach(c=>{
    c.classList.toggle('hidden-page',!pageCards.includes(c));
  });
  if(THUMBS_DONE||!$('startScreen').classList.contains('hidden')){
    pageCards.forEach(c=>ensureMapThumb(c.dataset.map));
  }
  const infoEl=$('mapPageInfo');
  if(infoEl){
    const compact=IS_MOBILE||(typeof window!=='undefined'&&window.innerWidth<=768);
    infoEl.textContent=compact
      ?('PÁG. '+(mapPage+1)+'/'+totalPages+' · '+pageCards.length+' DE '+filtered.length+' MAPAS')
      :('PÁGINA '+(mapPage+1)+' DE '+totalPages+' · EXIBINDO '+pageCards.length+' DE '+filtered.length+' MAPAS');
  }
  const prevBtn=$('btnMapPrev'),nextBtn=$('btnMapNext');
  if(prevBtn)prevBtn.classList.toggle('disabled',totalPages<=1);
  if(nextBtn)nextBtn.classList.toggle('disabled',totalPages<=1);
  const dotsEl=$('mapPageDots');
  if(dotsEl){
    dotsEl.innerHTML='';
    for(let p=0;p<totalPages;p++){
      const dot=document.createElement('button');
      dot.type='button';
      dot.className='map-page-dot'+(p===mapPage?' active':'');
      dot.textContent=String(p+1);
      dot.title='Ir para página '+(p+1);
      dot.addEventListener('click',()=>{
        mapPage=p;
        renderMapPagination(false);
        Snd.play('ui');
      });
      dotsEl.appendChild(dot);
    }
  }
}

function registerExtraMaps(){
  const host=$('mapCards'),lab={easy:'FÁCIL',normal:'MÉDIO',hard:'DIFÍCIL'};
  for(const id of EXTRA_MAP_IDS){const m=MAPS[id];
    for(const sid of ['mapSelect','settingsMap']){const o=document.createElement('option');o.value=id;o.textContent=m.name;$(sid).appendChild(o);}
    const card=document.createElement('button');card.className='map-card';card.dataset.map=id;card.dataset.diff=m.diff||'normal';
    card.innerHTML='<span class="map-thumb" role="img" aria-label="'+m.name+'"><em class="map-diff-badge diff-'+(m.diff||'normal')+'">'+lab[m.diff]+'</em></span><b>'+m.name.toUpperCase()+'</b><small>'+lab[m.diff]+' · '+m.desc+'</small>';
    host.appendChild(card);}
  renderMapMedals();
  renderMapPagination(false);
}
const WEATHER=[];let _wt=0;
function initWeather(){WEATHER.length=0;for(let i=0;i<110;i++)WEATHER.push({x:Math.random()*W,y:Math.random()*H,v:Math.random(),ph:Math.random()*6.283});}
function drawWeather(){
  const n=Math.min(CFG.weatherN||0,WEATHER.length);if(!n)return;
  const now=performance.now()/1000,dt=Math.min(.05,now-_wt||.016);_wt=now;
  const sk=(MAPS[activeMap]&&MAPS[activeMap].skin)||activeMap;
  if(sk==='four'||sk==='harbor'){ctx.strokeStyle='rgba(190,210,235,.22)';ctx.lineWidth=1;ctx.beginPath();}
  for(let i=0;i<n;i++){const q=WEATHER[i];
    if(sk==='four'||sk==='harbor'){q.y+=(480+q.v*160)*dt;q.x-=60*dt;ctx.moveTo(q.x,q.y);ctx.lineTo(q.x+3,q.y-11);}
    else if(sk==='arctic'){q.x+=(18+Math.sin(q.ph+now*1.5)*20)*dt;q.y+=(45+q.v*30)*dt;ctx.fillStyle='rgba(240,249,255,.8)';ctx.fillRect(q.x,q.y,2.5,2.5);}
    else if(sk==='forest'){q.x+=(25+Math.sin(q.ph+now)*22)*dt;q.y+=(28+q.v*14)*dt;ctx.fillStyle=q.v<.5?'rgba(122,154,58,.85)':'rgba(164,116,42,.85)';ctx.fillRect(q.x,q.y,2,2);}
    else if(sk==='industrial'||sk==='volcano'){q.y-=(32+q.v*35)*dt;q.x+=Math.sin(q.ph+now*2)*14*dt;ctx.fillStyle=sk==='volcano'?'rgba(255,95,25,'+(.45+q.v*.5)+')':'rgba(255,150,40,'+(.35+q.v*.5)+')';ctx.fillRect(q.x,q.y,2,2);}
    else if(sk==='metro'||sk==='lab'){q.x+=Math.sin(q.ph+now*.7)*8*dt;q.y+=Math.cos(q.ph+now*.6)*6*dt;ctx.fillStyle=sk==='lab'?'rgba(43,227,161,.35)':'rgba(150,205,255,.28)';ctx.fillRect(q.x,q.y,2,2);}
    else{q.x+=(70+q.v*50)*dt;q.y+=Math.sin(q.ph+now)*8*dt;ctx.fillStyle='rgba(216,200,160,.26)';ctx.fillRect(q.x,q.y,2,1);}
    if(q.x>W+5)q.x=-5;if(q.x<-5)q.x=W+5;if(q.y>H+12)q.y=-12;if(q.y<-12)q.y=H+12;}
  if(sk==='four'||sk==='harbor')ctx.stroke();
}
let _confirmHomeCallback=null;
function promptDangerHome(onConfirm){
  _confirmHomeCallback=onConfirm;
  const m=$('homeConfirmModal');
  if(!m){
    if(confirm('Certeza que quer voltar ao Home?'))onConfirm();
    return;
  }
  if($('confirmWaveVal'))$('confirmWaveVal').textContent=String(WM.num||1);
  if($('confirmLifeVal'))$('confirmLifeVal').textContent=String(Math.max(0,Math.round(G.life||0)));
  if($('confirmTowersVal'))$('confirmTowersVal').textContent=String(towers.length||0);
  if($('confirmKillsVal'))$('confirmKillsVal').textContent=String(G.kills||0);
  if(G.mode==='play')G.paused=true;
  m.classList.remove('hidden');
  Snd.play('alarm');
}
function hideDangerHome(){
  const m=$('homeConfirmModal');
  if(m)m.classList.add('hidden');
  _confirmHomeCallback=null;
}

let _deferredInstallPrompt=null;
function isAppInstalled(){
  try{
    if(typeof window==='undefined')return false;
    if(window.matchMedia){
      if(window.matchMedia('(display-mode: standalone)').matches)return true;
      if(window.matchMedia('(display-mode: fullscreen)').matches)return true;
      if(window.matchMedia('(display-mode: minimal-ui)').matches)return true;
    }
    if(window.navigator&&window.navigator.standalone===true)return true;
    if(typeof document!=='undefined'&&document.referrer&&document.referrer.indexOf('android-app://')===0)return true;
    if(typeof localStorage!=='undefined'&&localStorage.getItem('qz_pwa_installed')==='1')return true;
  }catch(_){return false;}
  return false;
}
function refreshInstallUI(){
  const btn=$('btnHomeInstall'),sub=$('homeInstallSub'),badge=$('installPlatformBadge'),pwaBtn=$('btnInstallPwaNow'),guide=$('installGuideBox');
  const ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';
  const isiOS=/iPad|iPhone|iPod/i.test(ua);
  const isAndroid=/Android/i.test(ua);
  const installed=isAppInstalled();
  if(typeof document!=='undefined'&&document.body){
    document.body.classList.toggle('is-installed-app',installed);
  }
  if(btn){
    if(installed){
      btn.style.display='none';
      btn.classList.add('hidden');
    }else{
      btn.style.display='';
      btn.classList.remove('hidden');
    }
    btn.classList.toggle('installed',installed);
  }
  if(sub){
    sub.textContent=installed?'App já instalado neste aparelho':(_deferredInstallPrompt?'Instalação rápida pronta (1 clique)':'App offline (PC, Android e iOS)');
  }
  if(badge){
    badge.textContent=installed?'✓ Já instalado em modo App':isiOS?'iOS / Safari (Tela de Início)':isAndroid?'Android / PWA Offline':'PC / Navegador · Windows (.exe)';
  }
  if(pwaBtn){
    if(installed){pwaBtn.textContent='✓ JÁ INSTALADO';pwaBtn.disabled=true;}
    else if(_deferredInstallPrompt){pwaBtn.textContent='⬇ INSTALAR AGORA (1 CLIQUE)';pwaBtn.disabled=false;}
    else{pwaBtn.textContent=isiOS?'📱 COMO INSTALAR NO iOS':'📲 INSTALAR VIA NAVEGADOR';pwaBtn.disabled=false;}
  }
  if(guide){
    if(installed){
      guide.classList.remove('hidden');
      guide.innerHTML='<b>Modo Aplicativo ativo!</b> Você já está executando o Quarentena Z instalado e pronto para uso offline.';
    } else if(_deferredInstallPrompt){
      guide.classList.add('hidden');
    } else if(isiOS){
      guide.classList.remove('hidden');
      guide.innerHTML='<b>No iPhone / iPad (Safari):</b> toque em <b>Compartilhar (⬆️)</b> na barra inferior e escolha <b>Adicionar à Tela de Início</b>.';
    } else {
      guide.classList.remove('hidden');
      guide.innerHTML='<b>Instalação pelo navegador:</b> abra o menu do navegador (⋮ ou ícone de computador na barra de endereço) e clique em <b>Instalar Quarentena Z</b> / <b>Adicionar à tela inicial</b>.';
    }
  }
}
function openInstallModal(){
  refreshInstallUI();
  const m=$('installModal');
  if(m){m.classList.remove('hidden');Snd.play('ui');}
}
function closeInstallModal(){
  const m=$('installModal');
  if(m)m.classList.add('hidden');
}

/* ===== SISTEMA MODO COOPERATIVO (SALAS PRIVADAS 2–4P, DOAÇÃO %, PINGS E VOTAÇÃO) ===== */
function generateCoopRoomCode(){
  if(window.QZ_COOP&&typeof window.QZ_COOP.generateRoomCode==='function'){
    COOP.roomCode=window.QZ_COOP.generateRoomCode();
  }else{
    const chars='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let s='QZ-';
    for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];
    COOP.roomCode=s;
  }
  if($('coopRoomCodeDisplay'))$('coopRoomCodeDisplay').textContent=COOP.roomCode;
  if($('coopHudRoomCode'))$('coopHudRoomCode').textContent=COOP.roomCode;
  return COOP.roomCode;
}

function setupCoopPlayers(maxP){
  const n=Math.max(2,Math.min(4,Number(maxP)||2));
  COOP.maxPlayers=n;
  const allyNames=['Comandante','Aliado Bravo','Aliado Charlie','Aliado Delta'];
  const allyCols=['#38bdf8','#4ade80','#facc15','#f472b6'];
  const old=Array.isArray(COOP.players)?COOP.players:[];
  const me=COOP.mySlot||0;
  COOP.players=[];
  for(let i=0;i<n;i++){
    // Preserva nome/pronto/conexão já recebidos pela rede (antes cada render apagava o aliado que entrou).
    const prev=old.find(p=>p&&p.slot===i)||{};
    COOP.players.push({
      slot:i,
      name:(i===me)?getPlayerName():(prev.name||allyNames[i]),
      money:(prev.money!==undefined)?prev.money:CFG.startMoney,
      isLocal:i===me,
      connected:!!prev.connected,
      ready:(prev.ready===undefined)?false:prev.ready,
      ping:prev.ping,
      color:allyCols[i]
    });
  }
}

// Atualiza a lista de jogadores do lobby a partir do estado oficial da sala no servidor.
function syncCoopPlayersFromRoom(room){
  if(!room||!Array.isArray(room.players))return;
  const n=Math.max(2,Math.min(4,Number(room.maxPlayers)||COOP.maxPlayers||2));
  setupCoopPlayers(n);
  for(const rp of room.players){
    const p=COOP.players[rp.slot];
    if(!p)continue;
    p.connected=true;
    p.ready=!!rp.ready;
    if(!p.isLocal&&rp.name)p.name=rp.name;
  }
}

function updateCoopMissionPreview(mapId, diff){
  const mid=mapId||activeMap||'four';
  const d=diff||activeDifficulty||'normal';
  const m=MAPS[mid];
  if(!m)return;
  const lab={easy:'FÁCIL',normal:'MÉDIO',hard:'DIFÍCIL',apoc:'APOCALIPSE',apocalypse:'APOCALIPSE'};

  // Garante a miniatura gerada pelo código do jogo
  let thumbUrl='';
  try {
    if(typeof ensureMapThumb==='function')ensureMapThumb(mid);
    if(typeof MAP_THUMB_CACHE!=='undefined'&&MAP_THUMB_CACHE[mid]){
      thumbUrl=MAP_THUMB_CACHE[mid];
    }
  }catch(_){}

  const imgHost=$('coopMapThumbImg');
  const phHost=$('coopMapThumbPlaceholder');
  if(imgHost){
    if(thumbUrl){
      imgHost.src=thumbUrl;
      imgHost.style.display='block';
      if(phHost)phHost.style.display='none';
    }else{
      imgHost.src='assets/map_metro.png';
      imgHost.style.display='block';
      if(phHost)phHost.style.display='none';
    }
  }

  const imgGuest=$('coopGuestMapThumb');
  if(imgGuest){
    if(thumbUrl)imgGuest.src=thumbUrl;
    else imgGuest.src='assets/map_metro.png';
  }

  if($('coopMissionName'))$('coopMissionName').textContent='ZONA '+m.name.toUpperCase();
  if($('coopMissionDesc'))$('coopMissionDesc').textContent=m.desc||'Área de operações táticas de defesa de Vale Cinzento.';
  if($('coopMapDiffBadge')){
    $('coopMapDiffBadge').textContent=lab[d]||d.toUpperCase();
    $('coopMapDiffBadge').className='map-diff-badge diff-'+d;
  }
}

function populateCoopMaps(){
  const sel=$('coopMapSelect');
  if(!sel||sel.children.length>0)return;
  for(const k in MAPS){
    const m=MAPS[k];
    const opt=document.createElement('option');
    opt.value=k;
    opt.textContent=(m.name||k).toUpperCase()+' ('+(m.diff?m.diff.toUpperCase():'NORMAL')+')';
    sel.appendChild(opt);
  }
  if(activeMap)sel.value=activeMap;
}

function detectCoopServer(){
  populateCoopMaps();
  updateCoopMissionPreview(activeMap,activeDifficulty);

  if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.getEffectiveServerUrl==='function'){
    const currentUrl=window.QZ_NET_MP.getEffectiveServerUrl();
    if($('coopServerInput'))$('coopServerInput').value=currentUrl;
  }

  const tag=$('coopServerAddressTag');
  const dot=$('coopServerDot');
  const lbl=$('coopServerStatusLabel');
  const notice=$('coopColdStartNotice');
  const noticeTitle=$('coopColdStartTitle');
  const noticeText=$('coopColdStartText');

  if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.wakeServer==='function'){
    window.QZ_NET_MP.wakeServer(progress=>{
      if(progress.status==='waking'){
        if(notice)notice.classList.remove('hidden');
        if(noticeTitle)noticeTitle.textContent='ACORDANDO SERVIDOR DE OPERAÇÕES...';
        if(noticeText)noticeText.textContent=progress.message||'Aguarde enquanto a instância na nuvem é inicializada.';
        if(dot)dot.className='coop-status-dot offline';
        if(lbl)lbl.textContent='ACORDANDO SERVIDOR...';
        if(tag)tag.textContent='ENLACE: '+progress.serverUrl;
      }else if(progress.status==='ready'){
        if(notice)notice.classList.add('hidden');
        if(dot)dot.className='coop-status-dot online';
        if(lbl)lbl.textContent='SERVIDOR DE JOGO ONLINE';
        const d=progress.data||{};
        const primaryLan=(d.localIps&&d.localIps[0])?d.localIps[0]:(d.primaryLanIp||'localhost');
        const lanUrl='http://'+primaryLan+':'+(d.port||3000);
        if(tag){
          tag.textContent=progress.serverUrl.includes('localhost')||progress.serverUrl.includes('192.168.')
            ?('REDE LOCAL (LAN): '+lanUrl)
            :('NUVEM: '+progress.serverUrl);
          tag.title='Endereço de conexão ativo';
        }
      }else if(progress.status==='timeout'){
        if(notice)notice.classList.add('hidden');
        if(dot)dot.className='coop-status-dot online';
        if(lbl)lbl.textContent='REDE MULTIPLAYER ONLINE (P2P)';
        if(tag){
          tag.textContent='ENLACE: WEBRTC P2P / INTERNET';
          tag.title='Modo direto WebRTC P2P ativo';
        }
        const fb=$('coopHostFeedback');
        if(fb&&!COOP.guestOf&&(!fb.textContent||fb.classList.contains('bad'))){
          fb.className='coop-feedback-text good';
          fb.innerHTML='🟢 <b>Rede Multiplayer Ativa (P2P):</b> Conecte seus amigos pelo código <b>'+escHtml(COOP.roomCode)+'</b> (funciona de qualquer internet)!';
        }
      }
    });
  }
}

function renderCoopModalSlots(){
  const box=$('coopSlotsPreview');
  if(!box)return;
  const guestView=!!COOP.guestOf; // convidado só observa: valores vêm da sala do Host
  const n=guestView?Math.max(2,Math.min(4,COOP.maxPlayers||2)):Math.max(2,Math.min(4,Number($('coopPlayersSelect')&&$('coopPlayersSelect').value)||COOP.maxPlayers||2));
  setupCoopPlayers(n);
  const divMode=guestView?(COOP.division||'sectors'):(($('coopDivisionSelect')&&$('coopDivisionSelect').value)||COOP.division||'sectors');
  COOP.division=divMode;

  const currentPing=window.QZ_NET_MP&&typeof window.QZ_NET_MP.getCurrentPing==='function'
    ? window.QZ_NET_MP.getCurrentPing()
    : 0;
  const pingStr=currentPing>0?(currentPing+'ms'):'--ms';

  if($('coopPlayersCountLabel')){
    const readyCount=COOP.players.filter(p=>p.isLocal||p.connected).length;
    $('coopPlayersCountLabel').textContent=readyCount+'/'+n;
  }
  if($('coopSquadStatusBadge')){
    const online=p=>p.isLocal||p.connected;
    const hasGuest=COOP.players.some(p=>!p.isLocal&&p.connected);
    const allReady=hasGuest&&COOP.players.slice(0,n).filter(online).every(p=>p.ready);
    $('coopSquadStatusBadge').className='coop-squad-badge '+(allReady?'ready':'waiting');
    $('coopSquadStatusBadge').textContent=hasGuest
      ?(allReady?'🟢 ESQUADRÃO 100% PRONTO PARA COMBATE':'🟡 AGUARDANDO CONFIRMAÇÃO DE PRONTO...')
      :'📡 AGUARDANDO ALIADO (2º PC)...';
  }

  box.innerHTML=COOP.players.map((p,i)=>{
    const secLbl=(window.QZ_COOP&&typeof window.QZ_COOP.getSectorName==='function')
      ? window.QZ_COOP.getSectorName(i,n,divMode)
      : (divMode==='free'?'Mapa Livre (Construção Compartilhada)':('Setor Tático P'+(i+1)));
    const pCol=(window.QZ_COOP&&typeof window.QZ_COOP.getSectorColor==='function')?window.QZ_COOP.getSectorColor(i):p.color;
    const isOnline=p.isLocal||p.connected;
    const isReady=!!p.ready;
    const roleTag=i===0?'👑 HOST (LÍDER)':'⚡ CONVIDADO (ALIADO)';

    if(isOnline){
      return '<div class="coop-roster-card connected" style="border-left:4px solid '+pCol+'">'
        +'<div class="coop-roster-avatar" style="background:'+pCol+'22;color:'+pCol+'"><b>P'+(i+1)+'</b></div>'
        +'<div class="coop-roster-info">'
        +'<div class="coop-roster-name"><strong>'+escHtml(p.name)+'</strong>'
        +'<span class="coop-tag-host">'+roleTag+'</span>'
        +'<span class="coop-ping-badge">📡 '+pingStr+'</span>'
        +'<span class="coop-squad-badge '+(isReady?'ready':'waiting')+'">'+(isReady?'🟢 PRONTO':'⏳ PREPARANDO')+'</span>'
        +'</div>'
        +'<small class="coop-roster-sec">'+secLbl+'</small>'
        +'</div></div>';
    }else{
      return '<div class="coop-roster-card waiting">'
        +'<div class="coop-radar-circle"></div>'
        +'<div class="coop-roster-info">'
        +'<div class="coop-roster-name"><span class="coop-waiting-text">Aguardando Aliado P'+(i+1)+'...</span></div>'
        +'<small class="coop-roster-sec">Compartilhe o código <b>'+escHtml(COOP.roomCode)+'</b> com o 2º PC</small>'
        +'</div></div>';
    }
  }).join('');
}

function toggleCoopReady(isHost){
  const targetSlot=isHost?0:(COOP.mySlot||1);
  const p=COOP.players[targetSlot];
  if(!p)return;
  p.ready=!p.ready;
  if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setPlayerReady==='function'){
    window.QZ_NET_MP.setPlayerReady(p.ready);
  }
  const btnHost=$('btnCoopToggleReadyHost');
  if(btnHost&&isHost){
    btnHost.className='coop-ready-toggle-btn '+(p.ready?'ready':'waiting');
    btnHost.textContent=p.ready?'✓ VOCÊ ESTÁ PRONTO':'⏳ MARCAR COMO PRONTO';
  }
  const btnGuest=$('btnCoopToggleReadyGuest');
  if(btnGuest&&!isHost){
    btnGuest.className='coop-ready-toggle-btn '+(p.ready?'ready':'waiting');
    btnGuest.textContent=p.ready?'✓ VOCÊ ESTÁ PRONTO':'⏳ MARCAR COMO PRONTO';
  }
  renderCoopModalSlots();
  Snd.play('ui');
}

function syncCoopBase(){
  if(COOP&&COOP.active&&COOP.isHost&&window.QZ_NET_MP&&typeof window.QZ_NET_MP.broadcastBaseSync==='function'){
    window.QZ_NET_MP.broadcastBaseSync(G.life);
  }
}

function renderCoopHud(){
  const w=$('coopHudWidget');
  if(!w)return;
  w.classList.toggle('hidden',!COOP.active);
  if(!COOP.active)return;
  if(IS_MOBILE && !w.dataset.userToggled && !w.classList.contains('collapsed')){
    w.classList.add('collapsed');
    if($('coopHudChevron'))$('coopHudChevron').textContent='▸';
  }
  if($('coopHudRoomCode'))$('coopHudRoomCode').textContent=COOP.roomCode;
  if($('coopHudModeTag'))$('coopHudModeTag').textContent=(COOP.division==='free'?'LIVRE ':'SETORES ')+COOP.maxPlayers+'P';
  if($('coopVoteCount'))$('coopVoteCount').textContent=COOP.votesWave+'/'+COOP.maxPlayers;
  const listEl=$('coopAllyList');
  if(!listEl)return;
  const curBal=Math.max(0,Math.floor(G.money||0));
  const p25=Math.floor(curBal*0.25);
  const p50=Math.floor(curBal*0.50);
  const p100=Math.floor(curBal*1.00);
  const mySlot=COOP.mySlot||0;
  const allies=COOP.players.filter(p=>p.slot!==mySlot);
  if(allies.length===0){
    listEl.innerHTML='<div class="coop-ally-row" style="color:#94a3b8;font-size:10px;text-align:center">Nenhum aliado conectado no momento.</div>';
  }else{
    listEl.innerHTML=allies.map(p=>(
      '<div class="coop-ally-row">'
      +'<div class="coop-ally-top"><b>P'+(p.slot+1)+' · '+escHtml(p.name)+'</b><span class="coop-ally-coins">● '+Math.floor(p.money||0)+'</span></div>'
      +'<div class="coop-pct-group">'
      +'<button type="button" class="coop-pct-btn" data-slot="'+p.slot+'" data-pct="0.25" title="Doar 25% ('+p25+' moedas)">25% ('+p25+')</button>'
      +'<button type="button" class="coop-pct-btn" data-slot="'+p.slot+'" data-pct="0.5" title="Doar 50% ('+p50+' moedas)">50% ('+p50+')</button>'
      +'<button type="button" class="coop-pct-btn" data-slot="'+p.slot+'" data-pct="1" title="Doar 100% ('+p100+' moedas)">100% ('+p100+')</button>'
      +'</div></div>'
    )).join('');
    listEl.querySelectorAll('.coop-pct-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        dispatch({type:'donate',toSlot:+btn.dataset.slot,pct:+btn.dataset.pct});
      });
    });
  }
}

function donateCoopCoins(toSlot,pct,remote,fromSlot,remoteAmount){
  if(remote){
    const amt=Math.floor(Number(remoteAmount)||0);
    const fromIdx=(typeof fromSlot==='number')?fromSlot:1;
    if(toSlot===COOP.mySlot){
      G.money=(Number(G.money)||0)+amt;
      SecurityGuard.syncVault();
      FX.popup(W/2,90,'💸 +'+amt+' ● (Recebido de P'+(fromIdx+1)+')','#4ade80',true);
      toast('💸 Você recebeu '+amt+' moedas de P'+(fromIdx+1)+'!','good');
      Snd.play('coin');
    }
    const target=COOP.players.find(p=>p.slot===(toSlot|0));
    if(target)target.money=(target.money||0)+amt;
    const source=COOP.players.find(p=>p.slot===fromIdx);
    if(source)source.money=Math.max(0,(source.money||0)-amt);
    renderCoopHud();
    return amt;
  }
  const curBal=Math.floor(Number(G.money)||0);
  const numPct=Number(pct);
  const validPcts=[0.25,0.50,1.00];
  const matched=validPcts.find(p=>Math.abs(p-numPct)<0.001);
  if(!matched||curBal<1){
    toast('Saldo insuficiente para doar moedas!','bad');
    Snd.play('err');
    return false;
  }
  const amount=Math.floor(curBal*matched);
  if(amount<1){
    toast('Saldo insuficiente para doar '+Math.round(matched*100)+'%!','bad');
    Snd.play('err');
    return false;
  }
  const target=COOP.players.find(p=>p.slot===(toSlot|0))||COOP.players[1];
  if(!target)return false;
  G.money-=amount;
  target.money=(target.money||0)+amount;
  SecurityGuard.syncVault();
  if(COOP.active && COOP.isMultiplayer && window.QZ_NET_MP && typeof window.QZ_NET_MP.broadcastDonate==='function'){
    window.QZ_NET_MP.broadcastDonate(target.slot,matched,amount,COOP.mySlot||0,curBal);
  }
  FX.popup(W/2,90,'💸 -'+amount+' ● ('+Math.round(matched*100)+'% → '+target.name+')','#facc15',true);
  toast('💸 Doou '+amount+' moedas ('+Math.round(matched*100)+'%) para '+target.name+'!','good');
  Snd.play('coin');
  renderCoopHud();
  return amount;
}

function triggerCoopPing(kind,customX,customY,remote){
  pathPos(Math.min(PATH_LEN-40,Math.max(40,PATH_LEN*0.42)),_pp);
  const px=Number.isFinite(customX)?customX:(M.in?M.x:Math.round(_pp.x));
  const py=Number.isFinite(customY)?customY:(M.in?M.y:Math.round(_pp.y));
  const meta=kind==='focus'
    ?{label:'🎯 FOCAR ALVO',color:'#ef4444'}
    :kind==='combo'
    ?{label:'🌀 COMBO / PORTAL',color:'#c084fc'}
    :{label:'⚠ ALERTA NA PISTA',color:'#facc15'};
  COOP.pings.push({x:px,y:py,kind:kind||'danger',label:meta.label,color:meta.color,life:4.2,max:4.2});
  FX.ring(px,py,6,56,.45,meta.color,3.5);
  Snd.play('ui');
  if(!remote){
    toast('📍 '+meta.label+' enviado ao esquadrão!','good');
    if(COOP.active && COOP.isMultiplayer && window.QZ_NET_MP && typeof window.QZ_NET_MP.broadcastPing==='function'){
      window.QZ_NET_MP.broadcastPing(kind||'danger',px,py,getPlayerName());
    }
  }
  return true;
}

function voteCoopAction(voteType,speedVal,remote){
  if(voteType==='speed'){
    const sp=[1,2,3].includes(Number(speedVal))?Number(speedVal):1;
    setSpeed(sp);
    document.querySelectorAll('.coop-vote-spd').forEach(b=>b.classList.toggle('active',+b.dataset.vspd===sp));
    toast('🗳 Votação de grupo aprovada: Velocidade '+sp+'x!','good');
    if(!remote){
      if(COOP.active && COOP.isMultiplayer && window.QZ_NET_MP && typeof window.QZ_NET_MP.broadcastVote==='function'){
        window.QZ_NET_MP.broadcastVote('speed',sp,getPlayerName());
      }
    }
    return true;
  }
  COOP.votesWave=COOP.maxPlayers;
  renderCoopHud();
  if(G.mode==='play'&&!G.paused){
    dispatch({type:'wave',remote:true});
    toast('🗳 Esquadrão votou ('+COOP.maxPlayers+'/'+COOP.maxPlayers+'): Onda iniciada!','good');
  }
  if(!remote){
    if(COOP.active && COOP.isMultiplayer && window.QZ_NET_MP && typeof window.QZ_NET_MP.broadcastVote==='function'){
      window.QZ_NET_MP.broadcastVote('wave',1,getPlayerName());
    }
  }
  return true;
}

function setCoopLobbyStatus(kind,text){
  const dot=$('coopServerDot'),lbl=$('coopServerStatusLabel');
  if(dot){
    if(kind==='ok')dot.className='coop-status-dot online';
    else if(kind==='local')dot.className='coop-status-dot local';
    else dot.className='coop-status-dot offline';
  }
  if(lbl)lbl.textContent=text;
}

// Registra a sala do Host no servidor UMA vez por código. O código mostrado na tela
// passa a ser exatamente o do servidor (o convidado digita o mesmo código).
async function ensureCoopHostRoom(force){
  if(COOP.guestOf)return;
  if(!window.QZ_NET_MP||typeof window.QZ_NET_MP.createRoom!=='function')return;
  if(!force&&COOP.hostRegisteredCode&&COOP.hostRegisteredCode===COOP.roomCode&&COOP.roomId)return;
  if(COOP._creatingRoom)return;
  COOP._creatingRoom=true;
  try{
    const n=Math.max(2,Math.min(4,Number($('coopPlayersSelect')&&$('coopPlayersSelect').value)||COOP.maxPlayers||2));
    const div=($('coopDivisionSelect')&&$('coopDivisionSelect').value)||COOP.division||'sectors';
    const res=await window.QZ_NET_MP.createRoom({
      roomCode:COOP.roomCode,
      name:'Sala '+COOP.roomCode,
      mode:'coop',
      division:div,
      map:activeMap||'four',
      diff:activeDifficulty||'normal',
      maxPlayers:n,
      playerName:getPlayerName(),
      isPublic:false
    });
    if(res&&res.ok&&res.room){
      if(COOP.guestOf)return;
      COOP.roomId=res.room.roomId;
      COOP.roomCode=res.room.roomCode;
      COOP.hostRegisteredCode=res.room.roomCode;
      COOP.isHost=true;
      COOP.mySlot=0;
      if($('coopRoomCodeDisplay'))$('coopRoomCodeDisplay').textContent=COOP.roomCode;
      if($('coopHudRoomCode'))$('coopHudRoomCode').textContent=COOP.roomCode;
      if(res.localMode){
        setCoopLobbyStatus('ok','SALA ABERTA (REDE P2P)');
        const fb=$('coopHostFeedback');
        if(fb){
          fb.className='coop-feedback-text good';
          fb.innerHTML='🟢 <b>Sala Aberta com Sucesso!</b> Compartilhe o código <b>'+escHtml(COOP.roomCode)+'</b> com seu aliado (funciona em qualquer internet via P2P).';
        }
      }else{
        setCoopLobbyStatus('ok','SALA ABERTA NO SERVIDOR');
        const fb=$('coopHostFeedback');
        if(fb){
          fb.className='coop-feedback-text good';
          fb.textContent='🟢 Sala sincronizada com sucesso! Compartilhe o código com seu aliado.';
        }
      }
      renderCoopModalSlots();
    }else{
      COOP.roomId='local_'+COOP.roomCode;
      COOP.hostRegisteredCode=COOP.roomCode;
      setCoopLobbyStatus('ok','SALA ABERTA (REDE P2P)');
      const fb=$('coopHostFeedback');
      if(fb){
        fb.className='coop-feedback-text good';
        fb.innerHTML='🟢 <b>Sala Aberta com Sucesso!</b> Compartilhe o código <b>'+escHtml(COOP.roomCode)+'</b> com seu aliado (funciona em qualquer internet via P2P).';
      }
      renderCoopModalSlots();
    }
  }finally{
    COOP._creatingRoom=false;
  }
}

function openCoopModal(){
  const m=$('coopModal');
  if(!m)return;
  if(!COOP.roomCode)generateCoopRoomCode();
  if($('coopRoomCodeDisplay'))$('coopRoomCodeDisplay').textContent=COOP.roomCode;
  populateCoopMaps();
  updateCoopMissionPreview(activeMap,activeDifficulty);
  detectCoopServer();
  renderCoopModalSlots();
  m.classList.remove('hidden');
  Snd.play('ui');
  // Só o Host registra sala (quem está na aba "Entrar em Sala" é convidado)
  const joinTabActive=$('tabCoopJoin')&&$('tabCoopJoin').classList.contains('active');
  if(!joinTabActive)ensureCoopHostRoom(false);
}

function closeCoopModal(){
  const m=$('coopModal');
  if(m)m.classList.add('hidden');
}

async function joinCoopRoom(){
  const raw=($('coopJoinInput')&&$('coopJoinInput').value||'').trim().toUpperCase();
  const clean=raw.replace(/[^2-9A-Z]/g,'');
  if(!clean||clean.length<4){
    toast('Digite o código da sala gerado pelo Host (ex: QZ-8K4M9X)','bad');
    Snd.play('err');
    return;
  }
  const formatted=clean.startsWith('QZ')?('QZ-'+clean.slice(2)):('QZ-'+clean);
  const feedback=$('coopJoinFeedback');
  if(feedback){
    feedback.className='coop-feedback-text';
    feedback.textContent='Conectando à sala '+formatted+' no servidor...';
  }
  if(!window.QZ_NET_MP||typeof window.QZ_NET_MP.joinRoom!=='function'){
    toast('Módulo de rede multiplayer não disponível','bad');
    return;
  }
  const res=await window.QZ_NET_MP.joinRoom({
    roomCode:formatted,
    playerName:getPlayerName()
  });
  if(res&&res.ok&&res.room){
    COOP.roomCode=res.room.roomCode||formatted;
    COOP.roomId=res.room.roomId;
    COOP.isHost=false;
    COOP.guestOf=COOP.roomCode;
    COOP.hostRegisteredCode=null;
    COOP.mySlot=(res.slot!==undefined)?res.slot:1;
    COOP.active=true;
    COOP.isMultiplayer=true;
    COOP.division=res.room.division||'sectors';
    COOP.maxPlayers=res.room.maxPlayers||2;
    activeMap=res.room.map||activeMap||'four';
    activeDifficulty=res.room.diff||activeDifficulty||'normal';
    setupCoopPlayers(COOP.maxPlayers);
    syncCoopPlayersFromRoom(res.room);
    if(COOP.players[COOP.mySlot]){
      COOP.players[COOP.mySlot].name=getPlayerName();
      COOP.players[COOP.mySlot].isLocal=true;
      COOP.players[COOP.mySlot].connected=true;
    }
    renderCoopModalSlots();

    if($('coopJoinedLobbyCard'))$('coopJoinedLobbyCard').classList.remove('hidden');
    if($('coopJoinedCodeTag'))$('coopJoinedCodeTag').textContent=COOP.roomCode;
    if($('coopJoinedRoomTitle'))$('coopJoinedRoomTitle').textContent='CONECTADO À SALA: '+(res.room.name||COOP.roomCode);

    updateCoopMissionPreview(activeMap,activeDifficulty);

    if($('coopJoinedDetails')){
      const hostName=res.room.players&&res.room.players[0]?res.room.players[0].name:'Host';
      $('coopJoinedDetails').innerHTML=
        '<div><b>Líder da Sala:</b> '+escHtml(hostName)+'</div>'
        +'<div><b>Sua Posição:</b> Comandante P'+(COOP.mySlot+1)+'</div>'
        +'<div><b>Zona de Combate:</b> '+(MAPS[activeMap]?MAPS[activeMap].name.toUpperCase():activeMap.toUpperCase())+'</div>'
        +'<div><b>Nível de Ameaça:</b> '+activeDifficulty.toUpperCase()+'</div>'
        +'<div><b>Divisão Tática:</b> '+(COOP.division==='free'?'Mapa Livre':'Setores Divididos')+'</div>';
    }
    if(feedback){
      feedback.className='coop-feedback-text good';
      feedback.textContent='🟢 Conexão estabelecida! O Líder do Esquadrão iniciará a partida.';
    }
    toast('⚡ Conectado à sala '+COOP.roomCode+'!','good');
    Snd.play('up');
  }else{
    const errMsg=(res&&res.error)?res.error:'Sala não encontrada ou cheia';
    if(feedback){
      feedback.className='coop-feedback-text bad';
      feedback.textContent='❌ Falha ao entrar: '+errMsg+'. Verifique o código e o IP do servidor.';
    }
    toast('❌ '+errMsg,'bad');
    Snd.play('err');
  }
}

async function launchCoopHostMatch(){
  if(!COOP.roomId||COOP.hostRegisteredCode!==COOP.roomCode){
    await ensureCoopHostRoom(true);
    if(!COOP.roomId){
      COOP.roomId='local_'+COOP.roomCode;
      COOP.hostRegisteredCode=COOP.roomCode;
    }
  }
  COOP.guestOf=null;
  const n=Number($('coopPlayersSelect')&&$('coopPlayersSelect').value)||2;
  const div=($('coopDivisionSelect')&&$('coopDivisionSelect').value)||'sectors';
  const chosenMap=($('coopMapSelect')&&$('coopMapSelect').value)||activeMap||'four';
  const chosenDiff=($('coopDiffSelect')&&$('coopDiffSelect').value)||activeDifficulty||'normal';
  setupCoopPlayers(n);
  COOP.division=div;
  COOP.maxPlayers=n;
  COOP.active=true;
  COOP.isMultiplayer=true;
  COOP.isHost=true;
  COOP.mySlot=0;

  // Se algum slot de aliado não estiver ocupado por um humano conectado, ativar Comandante IA Tático
  for(let i=1;i<n;i++){
    const p=COOP.players[i];
    if(p&&!p.connected){
      p.isAi=true;
      p.connected=true;
      p.ready=true;
      p.name=i===1?'Tenente Bravo [IA]':(i===2?'Sargento Charlie [IA]':'Cabo Delta [IA]');
    }
  }

  const seed=((Date.now()^(Math.random()*0x7fffffff))&0x7fffffff)||20260101;
  COOP.seed=seed;
  selectMap(chosenMap);
  activeDifficulty=chosenDiff;
  if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.startRoomMatch==='function'){
    window.QZ_NET_MP.startRoomMatch({
      seed,
      map:chosenMap,
      diff:chosenDiff,
      division:div
    });
  }
  closeCoopModal();
  if(typeof startGameOperation==='function'){
    startGameOperation();
  }
  renderCoopHud();
  toast('🤝 Operação Co-op ('+n+'P · '+(div==='free'?'Mapa Livre':'Setores Divididos')+') iniciada!','good');
}

function handleRemoteGameStart(msg){
  if(!msg)return;
  // O Host já iniciou localmente ao clicar em INICIAR; o eco do servidor é ignorado.
  if(COOP.isHost&&!COOP.guestOf)return;
  const r=msg.room||{};
  const seed=((msg.seed!==undefined?msg.seed:r.seed)>>>0)||0;
  const startedAt=msg.startedAt||r.startedAt||0;
  const key=seed+':'+startedAt;
  if(COOP._lastStartKey===key&&G.mode==='play')return; // início duplicado
  COOP._lastStartKey=key;
  COOP.active=true;
  COOP.isMultiplayer=true;
  COOP.seed=seed||(Date.now()&0x7fffffff);
  COOP.division=msg.division||r.division||COOP.division||'sectors';
  COOP.maxPlayers=msg.maxPlayers||r.maxPlayers||COOP.maxPlayers||2;
  setupCoopPlayers(COOP.maxPlayers);
  const map=msg.map||r.map;
  if(map&&MAPS[map]){
    activeMap=map;
    selectMap(map);
  }
  const diff=msg.diff||r.diff;
  if(diff){
    activeDifficulty=diff;
  }
  if(COOP.players[COOP.mySlot]){COOP.players[COOP.mySlot].isLocal=true;}
  closeCoopModal();
  if(typeof startGameOperation==='function'){
    startGameOperation();
  }
  renderCoopHud();
  toast('🚀 Operação iniciada pelo Host! Protejam a Base Alfa!','good');
}

function initCoopNetworkListeners(){
  if(!window.QZ_NET_MP||typeof window.QZ_NET_MP.on!=='function')return;
  if(window.__qzCoopListenersInitialized)return;
  window.__qzCoopListenersInitialized=true;

  window.QZ_NET_MP.on('player_joined',data=>{
    if(data&&data.room)syncCoopPlayersFromRoom(data.room);
    if(data&&data.player){
      const slot=data.player.slot!==undefined?data.player.slot:1;
      if(COOP.players[slot]){
        const p=COOP.players[slot];
        const isNew=!p.connected&&!p.isLocal;
        p.name=data.player.name||p.name||('Aliado P'+(slot+1));
        p.connected=true;
        if(data.player.ready!==undefined)p.ready=!!data.player.ready;
        renderCoopModalSlots();
        renderCoopHud();
        if(isNew&&slot!==COOP.mySlot){
          toast('🤝 '+p.name+' entrou no esquadrão!','good');
          Snd.play('up');
        }
      }
    }
  });

  window.QZ_NET_MP.on('room_state',data=>{
    if(data&&data.room){
      syncCoopPlayersFromRoom(data.room);
      renderCoopModalSlots();
      renderCoopHud();
    }
  });

  window.QZ_NET_MP.on('join_error',data=>{
    toast('⚠ '+((data&&data.error)||'Falha ao entrar na sala.'),'bad');
  });

  window.QZ_NET_MP.on('disconnected',()=>{
    if(COOP.active&&COOP.isMultiplayer)toast('⚠ Conexão com o servidor perdida. Reconectando...','bad');
    setCoopLobbyStatus('bad','RECONECTANDO...');
  });

  window.QZ_NET_MP.on('reconnected',()=>{
    if(COOP.active&&COOP.isMultiplayer)toast('✅ Reconectado ao esquadrão!','good');
    setCoopLobbyStatus('ok','SERVIDOR DE JOGO ONLINE');
  });

  window.QZ_NET_MP.on('player_left',data=>{
    if(data&&typeof data.slot==='number'){
      if(COOP.players[data.slot]){
        COOP.players[data.slot].ready=false;
        COOP.players[data.slot].connected=false;
        renderCoopModalSlots();
        renderCoopHud();
        toast('⚠ Aliado P'+(data.slot+1)+' desconectou.','bad');
      }
    }
  });

  window.QZ_NET_MP.on('player_ready',data=>{
    if(data&&typeof data.slot==='number'&&COOP.players[data.slot]){
      COOP.players[data.slot].ready=!!data.ready;
      renderCoopModalSlots();
    }
  });

  window.QZ_NET_MP.on('room_update',data=>{
    if(data&&data.room){
      const r=data.room;
      if(r.map&&MAPS[r.map]){
        activeMap=r.map;
        if($('coopMapSelect'))$('coopMapSelect').value=r.map;
      }
      if(r.diff){
        activeDifficulty=r.diff;
        if($('coopDiffSelect'))$('coopDiffSelect').value=r.diff;
      }
      if(r.division){
        COOP.division=r.division;
        if($('coopDivisionSelect'))$('coopDivisionSelect').value=r.division;
      }
      updateCoopMissionPreview(activeMap,activeDifficulty);
      if($('coopJoinedDetails')){
        $('coopJoinedDetails').innerHTML=
          '<div><b>Zona de Combate:</b> '+(MAPS[activeMap]?MAPS[activeMap].name.toUpperCase():activeMap.toUpperCase())+'</div>'
          +'<div><b>Nível de Ameaça:</b> '+activeDifficulty.toUpperCase()+'</div>'
          +'<div><b>Divisão Tática:</b> '+(COOP.division==='free'?'Mapa Livre':'Setores Divididos')+'</div>';
      }
    }
  });

  window.QZ_NET_MP.on('ping_pong',data=>{
    if(data&&typeof data.ping==='number'){
      const p=data.ping;
      const b=$('coopPingBadge');
      if(b){
        b.textContent='📡 '+p+'ms';
        b.className='coop-ping-badge '+(p<70?'':p<150?'med':'high');
      }
    }
  });

  window.QZ_NET_MP.on('game_start',msg=>{
    handleRemoteGameStart(msg);
  });

  window.QZ_NET_MP.on('cmd_broadcast',raw=>{
    const c=(raw&&raw.command)?raw.command:raw;
    if(!c||!c.type)return;
    const fromSlot=(raw&&typeof raw.fromSlot==='number')?raw.fromSlot:(c.playerSlot!==undefined?c.playerSlot:-1);
    if(fromSlot===COOP.mySlot&&!c.force)return;
    c.remote=true;
    const f=CMDS[c.type];
    if(f){
      CMDLOG.push(Object.assign({tick:G.tick},c));
      f(c);
      SecurityGuard.syncVault();
    }
  });

  window.QZ_NET_MP.on('coop_donate',data=>{
    if(!data)return;
    donateCoopCoins(data.toSlot,data.pct,true,data.fromSlot,data.amount);
  });

  window.QZ_NET_MP.on('coop_ping',data=>{
    if(!data)return;
    triggerCoopPing(data.kind,data.x,data.y,true);
  });

  window.QZ_NET_MP.on('coop_vote',data=>{
    if(!data)return;
    voteCoopAction(data.voteType,data.speed,true);
  });

  window.QZ_NET_MP.on('base_sync',data=>{
    if(!COOP.isHost&&data&&typeof data.life==='number'){
      G.life=data.life;
      SecurityGuard.syncVault();
    }
  });
}

function bindEvents(){
  registerExtraMaps();drawHomeArt();refreshContinue();window.addEventListener('beforeunload',()=>psSave());
  $('btnHomeContinue').addEventListener('click',loadSave);
  $('btnFullscreen').addEventListener('click',()=>{if(window.steamBridge){window.steamBridge.fullscreen();}else if(document.fullscreenElement)document.exitFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();});
  const cv=$('game');
  const showScreen=id=>{
    ['homeScreen','aboutScreen','settingsScreen','startScreen','achScreen','rankScreen','techScreen'].forEach(k=>{
      const el=$(k);
      if(el)setElementHidden(el,k!==id);
    });
    document.body.classList.add('menu-mode');
    document.body.classList.remove('settings-in-game');
    $('btnSettingsReturnGame').classList.add('hidden');
    if(id==='homeScreen')refreshContinue();
    Snd.syncMusic();
  };
  // Desbloqueio imediato do AudioContext no primeiro touchstart, pointerdown ou keydown (iOS e Android)
  const wakeAudio=()=>Snd.unlockMobileAudio();
  window.addEventListener('touchstart',wakeAudio,{once:true,passive:true});
  window.addEventListener('pointerdown',wakeAudio,{once:true});
  window.addEventListener('keydown',wakeAudio,{once:true});

  // Seletor visual de Plataforma (Automático | PC / Mouse | Mobile / Toque) na Home e Configurações
  document.querySelectorAll('.platform-opt').forEach(btn=>btn.addEventListener('click',()=>{
    const mode=btn.dataset.platform||'auto';
    applyPlatformMode(mode);
    Snd.play('ui');
    toast('Plataforma: '+(mode==='auto'?'Automático':mode==='mobile'?'Mobile / Toque':'PC / Mouse'),'good');
  }));
  if($('settingsPlatform')){
    $('settingsPlatform').addEventListener('change',e=>{
      applyPlatformMode(e.target.value);
      Snd.play('ui');
    });
  }

  // Botões da Barra de Ação Rápida Mobile
  if($('btnMobWave'))$('btnMobWave').addEventListener('click',()=>{
    if(G.mode==='play'&&!G.paused)dispatch({type:'wave'});
    else if(G.mode==='play'&&G.paused&&$('endScreen').classList.contains('hidden'))toast('Jogo pausado','bad');
  });
  if($('btnMobSpeed'))$('btnMobSpeed').addEventListener('click',()=>setSpeed(G.speed%3+1));
  if($('btnMobPause'))$('btnMobPause').addEventListener('click',togglePause);
  if($('btnMobCancel'))$('btnMobCancel').addEventListener('click',()=>{cancelAll();Snd.play('ui');});
  $('btnMenuMusic').addEventListener('click',()=>{
    Snd.init();
    Snd.musicMuted=!Snd.musicMuted;
    try{localStorage.setItem('ztd_v19_music_muted',Snd.musicMuted?'1':'0');}catch(e){}
    Snd.apply();
    Snd.play('ui');
  });
  $('btnHomePlay').addEventListener('click',()=>{COOP.active=false;renderCoopHud();Snd.init();showScreen('startScreen');renderMapPagination(true);buildMapThumbs();});
  if($('btnHomeCoop'))$('btnHomeCoop').addEventListener('click',()=>{Snd.init();generateCoopRoomCode();openCoopModal();});
  if($('btnOpenCoopModal'))$('btnOpenCoopModal').addEventListener('click',()=>{Snd.init();openCoopModal();});
  if($('btnCoopClose'))$('btnCoopClose').addEventListener('click',closeCoopModal);
  if($('btnCoopRegenCode'))$('btnCoopRegenCode').addEventListener('click',()=>{
    const code=generateCoopRoomCode();
    COOP.roomId=null;COOP.hostRegisteredCode=null;COOP.guestOf=null;
    ensureCoopHostRoom(true);
    toast('Novo código de sala privada: '+code,'good');
    Snd.play('ui');
  });
  function fallbackCoopCopy(text){
    try{
      const ta=document.createElement('textarea');
      ta.value=text;
      ta.style.position='fixed';
      ta.style.left='-9999px';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }catch(_){}
  }
  function copyCoopText(text){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text).catch(()=>fallbackCoopCopy(text));
    }
    fallbackCoopCopy(text);
  }

  if($('btnCoopCopyCode'))$('btnCoopCopyCode').addEventListener('click',()=>{
    const btn=$('btnCoopCopyCode');
    copyCoopText(COOP.roomCode);
    if(btn){
      const origHtml=btn.innerHTML;
      btn.innerHTML='✓ COPIADO!';
      btn.style.borderColor='var(--neon-green)';
      btn.style.color='var(--neon-green)';
      setTimeout(()=>{
        btn.innerHTML=origHtml;
        btn.style.borderColor='';
        btn.style.color='';
      },2500);
    }
    toast('Código da Sala copiado: '+COOP.roomCode,'good');
    Snd.play('ui');
  });
  if($('coopServerAddressTag'))$('coopServerAddressTag').addEventListener('click',()=>{
    const srv=(window.QZ_NET_MP&&typeof window.QZ_NET_MP.getEffectiveServerUrl==='function')?window.QZ_NET_MP.getEffectiveServerUrl():'';
    if(srv){
      copyCoopText(srv);
      toast('Endereço do servidor copiado: '+srv,'good');
      Snd.play('ui');
    }
  });
  if($('btnPresetRender'))$('btnPresetRender').addEventListener('click',()=>{
    const input=$('coopServerInput');
    const url='https://quarentena-z-online.onrender.com';
    if(input)input.value=url;
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
      window.QZ_NET_MP.setServerUrl(url);
      detectCoopServer();
      toast('Servidor configurado: Nuvem Render!','good');
      Snd.play('ui');
    }
  });
  if($('btnPresetLan'))$('btnPresetLan').addEventListener('click',()=>{
    const current=($('coopServerInput')&&$('coopServerInput').value)||'http://192.168.1.50:3000';
    let ip=window.prompt('Digite o IP do Host na Rede Local (ex: 192.168.1.50):',current.replace(/^https?:\/\//,'').replace(/:[0-9]+$/,''));
    if(ip&&ip.trim()){
      let url=ip.trim();
      if(!url.startsWith('http://')&&!url.startsWith('https://'))url='http://'+url;
      if(!/:[0-9]+$/.test(url))url+=':3000';
      const input=$('coopServerInput');
      if(input)input.value=url;
      if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
        window.QZ_NET_MP.setServerUrl(url);
        detectCoopServer();
        toast('Servidor LAN configurado: '+url,'good');
        Snd.play('ui');
      }
    }
  });
  if($('btnPresetLocalhost'))$('btnPresetLocalhost').addEventListener('click',()=>{
    const input=$('coopServerInput');
    const url='http://localhost:3000';
    if(input)input.value=url;
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
      window.QZ_NET_MP.setServerUrl(url);
      detectCoopServer();
      toast('Servidor configurado: Localhost!','good');
      Snd.play('ui');
    }
  });
  if($('btnPresetStandalone'))$('btnPresetStandalone').addEventListener('click',()=>{
    const input=$('coopServerInput');
    if(input)input.value='';
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
      window.QZ_NET_MP.setServerUrl('');
    }
    const notice=$('coopColdStartNotice');
    if(notice)notice.classList.add('hidden');
    setCoopLobbyStatus('local','MODO MULTIPLAYER ATIVO (LOCAL)');
    const tag=$('coopServerAddressTag');
    if(tag){tag.textContent='ENLACE: STANDALONE / P2P';tag.title='Modo local direto ativo';}
    const fb=$('coopHostFeedback');
    if(fb){
      fb.className='coop-feedback-text local-info';
      fb.innerHTML='⚡ <b>Modo Standalone Ativo:</b> Sem servidor Node.js. Você pode iniciar a partida normalmente ou abrir outra aba com o código <b>'+escHtml(COOP.roomCode)+'</b>.';
    }
    toast('⚡ Modo Standalone ativado! Partida liberada.','good');
    Snd.play('ui');
  });
  if($('btnTestServerNow'))$('btnTestServerNow').addEventListener('click',()=>{
    detectCoopServer();
    toast('Testando conexão com o servidor...','good');
    Snd.play('ui');
  });
  if($('btnCoopToggleReadyHost'))$('btnCoopToggleReadyHost').addEventListener('click',()=>{
    toggleCoopReady(true);
  });
  if($('btnCoopToggleReadyGuest'))$('btnCoopToggleReadyGuest').addEventListener('click',()=>{
    toggleCoopReady(false);
  });
  if($('tabCoopHost'))$('tabCoopHost').addEventListener('click',()=>{
    $('tabCoopHost').classList.add('active');
    $('tabCoopHost').setAttribute('aria-selected','true');
    if($('tabCoopJoin')){$('tabCoopJoin').classList.remove('active');$('tabCoopJoin').setAttribute('aria-selected','false');}
    if($('coopHostPanel'))$('coopHostPanel').classList.remove('hidden');
    if($('coopJoinPanel'))$('coopJoinPanel').classList.add('hidden');
    Snd.play('ui');
    if(COOP.guestOf){COOP.guestOf=null;COOP.roomId=null;COOP.hostRegisteredCode=null;if(window.QZ_NET_MP&&window.QZ_NET_MP.leaveRoom)window.QZ_NET_MP.leaveRoom();generateCoopRoomCode();}
    ensureCoopHostRoom(false);
  });
  if($('tabCoopJoin'))$('tabCoopJoin').addEventListener('click',()=>{
    $('tabCoopJoin').classList.add('active');
    $('tabCoopJoin').setAttribute('aria-selected','true');
    if($('tabCoopHost')){$('tabCoopHost').classList.remove('active');$('tabCoopHost').setAttribute('aria-selected','false');}
    if($('coopJoinPanel'))$('coopJoinPanel').classList.remove('hidden');
    if($('coopHostPanel'))$('coopHostPanel').classList.add('hidden');
    Snd.play('ui');
  });
  if($('btnToggleServerConfig'))$('btnToggleServerConfig').addEventListener('click',()=>{
    if($('coopServerConfigDrawer'))$('coopServerConfigDrawer').classList.toggle('hidden');
    Snd.play('ui');
  });
  if($('btnSaveServerUrl'))$('btnSaveServerUrl').addEventListener('click',()=>{
    const url=($('coopServerInput')&&$('coopServerInput').value||'').trim();
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
      window.QZ_NET_MP.setServerUrl(url);
      detectCoopServer();
      toast('Endereço do servidor atualizado!','good');
      Snd.play('ui');
    }
  });
  if($('btnResetServerUrl'))$('btnResetServerUrl').addEventListener('click',()=>{
    if(window.QZ_NET_MP&&typeof window.QZ_NET_MP.setServerUrl==='function'){
      window.QZ_NET_MP.setServerUrl('');
      detectCoopServer();
      toast('Endereço restaurado para o padrão local!','good');
      Snd.play('ui');
    }
  });
  if($('coopPlayersSelect'))$('coopPlayersSelect').addEventListener('change',()=>{
    COOP.maxPlayers=Number($('coopPlayersSelect').value)||2;
    renderCoopModalSlots();
    if(COOP.isHost&&window.QZ_NET_MP&&typeof window.QZ_NET_MP.updateRoom==='function'){
      window.QZ_NET_MP.updateRoom({maxPlayers:COOP.maxPlayers});
    }
  });
  if($('coopDivisionSelect'))$('coopDivisionSelect').addEventListener('change',()=>{
    COOP.division=$('coopDivisionSelect').value;
    renderCoopModalSlots();
    if(COOP.isHost&&window.QZ_NET_MP&&typeof window.QZ_NET_MP.updateRoom==='function'){
      window.QZ_NET_MP.updateRoom({division:COOP.division});
    }
  });
  if($('coopMapSelect'))$('coopMapSelect').addEventListener('change',e=>{
    activeMap=e.target.value;
    selectMap(activeMap);
    updateCoopMissionPreview(activeMap,activeDifficulty);
    if(COOP.isHost&&window.QZ_NET_MP&&typeof window.QZ_NET_MP.updateRoom==='function'){
      window.QZ_NET_MP.updateRoom({map:activeMap,diff:activeDifficulty,division:COOP.division});
    }
    Snd.play('ui');
  });
  if($('coopDiffSelect'))$('coopDiffSelect').addEventListener('change',e=>{
    activeDifficulty=e.target.value;
    updateCoopMissionPreview(activeMap,activeDifficulty);
    if(COOP.isHost&&window.QZ_NET_MP&&typeof window.QZ_NET_MP.updateRoom==='function'){
      window.QZ_NET_MP.updateRoom({map:activeMap,diff:activeDifficulty,division:COOP.division});
    }
    Snd.play('ui');
  });
  if($('btnCoopJoinRoom'))$('btnCoopJoinRoom').addEventListener('click',joinCoopRoom);
  if($('coopJoinInput'))$('coopJoinInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      joinCoopRoom();
    }
  });
  if($('btnCoopStartMatch'))$('btnCoopStartMatch').addEventListener('click',launchCoopHostMatch);
  initCoopNetworkListeners();
  if($('btnCoopHudToggle'))$('btnCoopHudToggle').addEventListener('click',()=>{
    const w=$('coopHudWidget');
    if(w){
      w.dataset.userToggled='1';
      const col=w.classList.toggle('collapsed');
      if($('coopHudChevron'))$('coopHudChevron').textContent=col?'▸':'▾';
      if(!col)renderCoopHud();
    }
  });
  if($('btnCoopPingDanger'))$('btnCoopPingDanger').addEventListener('click',()=>triggerCoopPing('danger'));
  if($('btnCoopPingFocus'))$('btnCoopPingFocus').addEventListener('click',()=>triggerCoopPing('focus'));
  if($('btnCoopPingCombo'))$('btnCoopPingCombo').addEventListener('click',()=>triggerCoopPing('combo'));
  if($('btnCoopVoteWave'))$('btnCoopVoteWave').addEventListener('click',()=>voteCoopAction('wave'));
  document.querySelectorAll('.coop-vote-spd').forEach(b=>b.addEventListener('click',()=>voteCoopAction('speed',+b.dataset.vspd)));
  $('btnHomeSettings').addEventListener('click',()=>{Snd.init();$('settingsMap').value=$('mapSelect').value;$('settingsDifficulty').value=$('difficultySelect').value;$('settingsVolume').value=$('vol').value;showScreen('settingsScreen');});
  $('btnHomeAbout').addEventListener('click',()=>{psAdd('about');psSave();showScreen('aboutScreen');});
  if($('btnHomeInstall'))$('btnHomeInstall').addEventListener('click',()=>{Snd.init();openInstallModal();});
  if($('btnInstallClose'))$('btnInstallClose').addEventListener('click',()=>{Snd.play('ui');closeInstallModal();});
  if($('btnInstallLater'))$('btnInstallLater').addEventListener('click',()=>{Snd.play('ui');closeInstallModal();});
  if($('btnInstallPwaNow'))$('btnInstallPwaNow').addEventListener('click',async()=>{
    Snd.play('ui');
    if(_deferredInstallPrompt){
      try{
        _deferredInstallPrompt.prompt();
        const choice=await _deferredInstallPrompt.userChoice;
        if(choice&&choice.outcome==='accepted'){toast('Quarentena Z instalado com sucesso!','good');closeInstallModal();}
        _deferredInstallPrompt=null;
      }catch(_){}
      refreshInstallUI();
    } else {
      refreshInstallUI();
      toast('Siga as instruções exibidas abaixo para concluir a instalação.','good');
    }
  });
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_deferredInstallPrompt=e;refreshInstallUI();});
  window.addEventListener('appinstalled',()=>{
    try{localStorage.setItem('qz_pwa_installed','1');}catch(_){}
    _deferredInstallPrompt=null;
    refreshInstallUI();
    toast('App Quarentena Z instalado!','good');
  });

  if($('btnToggleSidebar')){
    $('btnToggleSidebar').addEventListener('click',()=>{
      const sb=$('sidebar');
      const isOpen=sb&&sb.classList.contains('mobile-open');
      setSidebarMobileOpen(!isOpen);
      Snd.play('ui');
    });
  }
  if($('btnCloseSidebarMobile')){
    $('btnCloseSidebarMobile').addEventListener('click',()=>{
      setSidebarMobileOpen(false);
      Snd.play('ui');
    });
  }
  if($('sidebarBackdrop')){
    $('sidebarBackdrop').addEventListener('pointerdown',()=>{
      setSidebarMobileOpen(false);
    });
  }

  const openTechScreen=()=>{Snd.init();renderTechScreen();showScreen('techScreen');};
  if($('btnHomeTech'))$('btnHomeTech').addEventListener('click',openTechScreen);
  if($('btnTechBack'))$('btnTechBack').addEventListener('click',()=>showScreen('homeScreen'));
  if($('btnResetTech'))$('btnResetTech').addEventListener('click',()=>{resetTechPerks();Snd.play('ui');});
  if($('techGrid')){
    $('techGrid').addEventListener('click',e=>{
      const btn=e.target.closest('.tc-btn-buy');
      if(!btn||btn.disabled||!btn.dataset.tech)return;
      buyTechPerk(btn.dataset.tech);
    });
  }
  ['napalm','overclock','barricade'].forEach(key=>{
    const btn=$('btnCallin'+key.charAt(0).toUpperCase()+key.slice(1));
    if(btn){
      btn.addEventListener('click',()=>{
        if(!G.paused&&G.mode==='play'){
          dispatch({type:'callin',callin:key});
          if(IS_MOBILE){
            const bar=$('tacticalCallinBar');
            if(bar){
              bar.classList.remove('open');
              bar.classList.add('hidden');
            }
          }
        }
      });
    }
  });
  if($('btnMobCallins')){
    $('btnMobCallins').addEventListener('click',e=>{
      e.stopPropagation();
      const bar=$('tacticalCallinBar');
      if(bar){
        const open=!bar.classList.contains('open');
        bar.classList.toggle('open',open);
        bar.classList.toggle('hidden',!open);
      }
      Snd.play('ui');
    });
  }
  document.addEventListener('pointerdown',e=>{
    if(IS_MOBILE){
      const bar=$('tacticalCallinBar');
      if(bar&&bar.classList.contains('open')){
        if(!e.target.closest('#tacticalCallinBar')&&!e.target.closest('#btnMobCallins')){
          bar.classList.remove('open');
          bar.classList.add('hidden');
        }
      }
    }
  });
  let _selectedAuthAvatar='🦅';
  function renderCommanderCardsHtml(){
    const btd=window.QZ_BTD6_TOWERS;
    const cmds=(btd&&btd.COMMANDERS)||{
      vance:{id:'vance',name:'Comandante Vance',title:'Bastião Blindado',icon:'🛡️',accent:'#38bdf8',role:'Artilharia Balística & Fortificação',desc:'Aumenta o dano balístico/explosivo e reforça a blindagem da Base Alfa.',perkSummary:lv=>`+${Math.round(3+lv*1.5)}% Dano Balístico · +${lv*2} Vida da Base`},
      elena:{id:'elena',name:'Dra. Elena Kovács',title:'Valquíria Bio-Tech',icon:'⚡',accent:'#a855f7',role:'Energia, Elementos & Recarga',desc:'Amplifica o dano elemental/energia e reduz a recarga das habilidades.',perkSummary:lv=>`+${Math.round(4+lv*1.7)}% Dano Elemental · -${Math.round(3+lv*1.3)}% Recarga`},
      marcus:{id:'marcus',name:'Major Marcus Sterling',title:'Fantasma Tático',icon:'🎯',accent:'#10b981',role:'Operações Especiais, Alcance & Economia',desc:'Expande o alcance das torres, dá moedas iniciais extras e fortalece Sniper/Dino.',perkSummary:lv=>`+${Math.round(2+lv*1.2)}% Alcance Global · +$${10+lv*8} Moedas`}
    };
    const activeId=career.activeCommander||'vance';
    const xpMap=(career.commanderXp&&typeof career.commanderXp==='object')?career.commanderXp:{};
    const baseXp=Math.max(0,(career.bestWave||0)*35+(career.games||0)*45);
    return Object.keys(cmds).map(k=>{
      const c=cmds[k];
      const xp=(xpMap[k]!==undefined?xpMap[k]:baseXp);
      const info=(btd&&typeof btd.getCommanderLevelInfo==='function')?btd.getCommanderLevelInfo(xp):{level:Math.min(15,1+Math.floor(xp/120)),maxLevel:15,progressPct:60};
      const isSel=activeId===k;
      return '<div class="cmd-card'+(isSel?' active':'')+'" data-cmd-id="'+k+'" style="border-color:'+(isSel?c.accent:'rgba(148,163,184,0.22)')+'">'
        +'<div class="cmd-card-head"><span class="cmd-ico">'+c.icon+'</span><div><b>'+escHtml(c.name)+'</b><small style="color:'+c.accent+'">'+escHtml(c.title)+' · Nível '+info.level+'/15</small></div></div>'
        +'<p class="cmd-desc">'+escHtml(c.desc)+'</p>'
        +'<div class="cmd-perk-pill">'+escHtml(c.perkSummary(info.level))+'</div>'
        +'<div class="cmd-xp-bar"><i style="width:'+info.progressPct+'%;background:'+c.accent+'"></i></div>'
        +'<button type="button" class="coop-sm-btn '+(isSel?'primary':'')+' btn-pick-cmd" data-cmd="'+k+'">'+(isSel?'✓ COMANDANTE EM COMANDO':'SELECIONAR COMANDANTE')+'</button>'
        +'</div>';
    }).join('');
  }

  function renderAuthProfilePanel(){
    const acct=getActiveOperatorAccount();
    const pName=acct?acct.operatorName:getPlayerName();
    const av=(acct&&acct.avatar)||'🦅';
    const lv=getOperatorAccountLevel();
    const bw=Math.max(career.bestWave||0,PS.bestWave||0);
    const tk=Math.max(career.totalKills||0,PS.kills||0);
    if($('authProfileCard')){
      $('authProfileCard').innerHTML=
        '<div class="apc-row">'
        +'<div class="apc-avatar">'+escHtml(av)+'</div>'
        +'<div class="apc-meta">'
        +'<span class="apc-status">'+(acct?'🟢 CONTA DE OPERADOR AUTENTICADA':'⚡ SESSÃO LOCAL ATIVA')+'</span>'
        +'<h3>'+escHtml(pName)+'</h3>'
        +'<small>'+(acct?escHtml(acct.email):'Crie sua conta para proteger seu Callsign no Ranking Top Global')+'</small>'
        +'</div>'
        +'<div class="apc-stats">'
        +'<div><span>NÍVEL</span><b>Nv. '+lv+'</b></div>'
        +'<div><span>PATENTE</span><b>'+escHtml(getPatent(bw))+'</b></div>'
        +'<div><span>ONDA MÁX.</span><b>Onda '+bw+'</b></div>'
        +'<div><span>ABATES</span><b>'+Math.floor(tk).toLocaleString('pt-BR')+'</b></div>'
        +'</div>'
        +'</div>';
    }
    if($('commanderSelectorGrid'))$('commanderSelectorGrid').innerHTML=renderCommanderCardsHtml();
  }

  function switchAuthTab(tabName){
    const tabs={login:['tabAuthLogin','authLoginPanel'],register:['tabAuthRegister','authRegisterPanel'],profile:['tabAuthProfile','authProfilePanel']};
    for(const k of Object.keys(tabs)){
      const [btnId,panelId]=tabs[k];
      const active=k===tabName;
      if($(btnId)){$(btnId).classList.toggle('active',active);$(btnId).setAttribute('aria-selected',active?'true':'false');}
      if($(panelId))$(panelId).classList.toggle('hidden',!active);
    }
    if(tabName==='profile')renderAuthProfilePanel();
  }

  function openAuthModal(defaultTab){
    const acct=getActiveOperatorAccount();
    switchAuthTab(defaultTab||(acct?'profile':'login'));
    if($('authModal'))$('authModal').classList.remove('hidden');
    Snd.play('ui');
  }
  function closeAuthModal(){
    if($('authModal'))$('authModal').classList.add('hidden');
  }

  function renderBestiaryModal(){
    const zGrid=$('bestiaryGrid');
    if(zGrid){
      const keys=Object.keys(ZOMBIES);
      zGrid.innerHTML=keys.map(k=>{
        const z=ZOMBIES[k];
        const unl=(ZOMBIE_META&&ZOMBIE_META.unlock&&ZOMBIE_META.unlock[k])||1;
        const armPct=Math.round((z.armor||0)*100);
        const tags=[];
        if(z.boss)tags.push('🚨 CHEFE');
        if(z.camo)tags.push('👁️ CAMUFLADO');
        if(z.flying)tags.push('🦅 VOADOR');
        if(z.shield)tags.push('🛡️ ESCUDO');
        if(z.regen)tags.push('💚 REGENERAÇÃO');
        if(z.healer)tags.push('➕ CURANDEIRO');
        if(z.speed>=70)tags.push('⚡ ALTA VELOCIDADE');
        return '<div class="bst-card'+(z.boss?' bst-boss':'')+'">'
          +'<div class="bst-head"><span class="bst-dot" style="background:'+(z.skin||'#4ade80')+'"></span><div><b>'+escHtml(z.name||k)+'</b><small>Surge na Onda '+unl+'</small></div></div>'
          +'<div class="bst-stats">'
          +'<span>❤️ HP: <b>'+z.hp+'</b></span>'
          +'<span>⚡ Vel: <b>'+z.speed+'</b></span>'
          +'<span>🛡️ Arm: <b>'+armPct+'%</b></span>'
          +'<span>💰 Rec: <b>$'+z.reward+'</b></span>'
          +'</div>'
          +(tags.length?'<div class="bst-tags">'+tags.map(t=>'<span>'+t+'</span>').join('')+'</div>':'')
          +'</div>';
      }).join('');
    }
    if($('bestiaryCommanderGrid'))$('bestiaryCommanderGrid').innerHTML=renderCommanderCardsHtml();
  }

  function openBestiaryModal(){
    renderBestiaryModal();
    if($('bestiaryModal'))$('bestiaryModal').classList.remove('hidden');
    Snd.play('ui');
  }
  function closeBestiaryModal(){
    if($('bestiaryModal'))$('bestiaryModal').classList.add('hidden');
  }

  if($('btnOpenAuthModal'))$('btnOpenAuthModal').addEventListener('click',()=>openAuthModal());
  if($('btnHomeAccount'))$('btnHomeAccount').addEventListener('click',()=>openAuthModal());
  if($('btnAuthClose1'))$('btnAuthClose1').addEventListener('click',closeAuthModal);
  if($('btnAuthClose2'))$('btnAuthClose2').addEventListener('click',closeAuthModal);
  if($('btnAuthClose3'))$('btnAuthClose3').addEventListener('click',closeAuthModal);
  if($('tabAuthLogin'))$('tabAuthLogin').addEventListener('click',()=>{switchAuthTab('login');Snd.play('ui');});
  if($('tabAuthRegister'))$('tabAuthRegister').addEventListener('click',()=>{switchAuthTab('register');Snd.play('ui');});
  if($('tabAuthProfile'))$('tabAuthProfile').addEventListener('click',()=>{switchAuthTab('profile');Snd.play('ui');});

  if($('authAvatarPicker')){
    $('authAvatarPicker').addEventListener('click',e=>{
      const b=e.target.closest('.auth-av-btn');
      if(!b)return;
      _selectedAuthAvatar=b.dataset.avatar||'🦅';
      $('authAvatarPicker').querySelectorAll('.auth-av-btn').forEach(el=>el.classList.toggle('active',el===b));
      Snd.play('ui');
    });
  }

  if($('btnAuthLoginSubmit'))$('btnAuthLoginSubmit').addEventListener('click',async()=>{
    const idf=($('authLoginIdentifier')&&$('authLoginIdentifier').value)||'';
    const pwd=($('authLoginPassword')&&$('authLoginPassword').value)||'';
    const fb=$('authLoginFeedback');
    if(!window.QZ_CLOUD_DB||typeof window.QZ_CLOUD_DB.loginAccount!=='function')return;
    const res=await window.QZ_CLOUD_DB.loginAccount({identifier:idf,password:pwd});
    if(res&&res.ok&&res.account){
      setPlayerName(res.account.operatorName);
      if(fb){fb.className='coop-feedback-text good';fb.textContent='🟢 Autenticado com sucesso como '+res.account.operatorName+'!';fb.classList.remove('hidden');}
      updateHomeStats();renderRank();
      toast('🛡️ Bem-vindo de volta, Operador '+res.account.operatorName+'!','good');
      Snd.play('up');
      switchAuthTab('profile');
    }else{
      if(fb){fb.className='coop-feedback-text bad';fb.textContent='❌ '+((res&&res.error)||'Falha na autenticação.');fb.classList.remove('hidden');}
      Snd.play('err');
    }
  });

  if($('btnAuthQuickGuest'))$('btnAuthQuickGuest').addEventListener('click',async()=>{
    const callsign=(($('authLoginIdentifier')&&$('authLoginIdentifier').value)||getPlayerName()||'OperadorAlfa').trim();
    setPlayerName(callsign);
    updateHomeStats();renderRank();
    toast('⚡ Sessão rápida ativada como '+callsign+'!','good');
    Snd.play('ui');
    switchAuthTab('profile');
  });

  if($('btnAuthRegisterSubmit'))$('btnAuthRegisterSubmit').addEventListener('click',async()=>{
    const opName=($('authRegOperatorName')&&$('authRegOperatorName').value)||'';
    const email=($('authRegEmail')&&$('authRegEmail').value)||'';
    const pwd=($('authRegPassword')&&$('authRegPassword').value)||'';
    const mig=$('authRegMigrateCheck')?$('authRegMigrateCheck').checked:true;
    const fb=$('authRegFeedback');
    if(!window.QZ_CLOUD_DB||typeof window.QZ_CLOUD_DB.registerAccount!=='function')return;
    const migrateData=mig?{
      bestWave:Math.max(career.bestWave||0,PS.bestWave||0),
      totalKills:Math.max(career.totalKills||0,PS.kills||0),
      games:Math.max(career.games||0,(PS.wins||0)+(PS.losses||0)),
      medals:career.medals||{},
      achievements:achLoad()
    }:null;
    const res=await window.QZ_CLOUD_DB.registerAccount({
      operatorName:opName,
      email,
      password:pwd,
      avatar:_selectedAuthAvatar,
      commander:career.activeCommander||'vance',
      migrateData
    });
    if(res&&res.ok&&res.account){
      setPlayerName(res.account.operatorName);
      if(fb){fb.className='coop-feedback-text good';fb.textContent='🟢 Conta criada e progresso migrado com sucesso!';fb.classList.remove('hidden');}
      updateHomeStats();renderRank();
      toast('🛡️ Conta de Operador '+res.account.operatorName+' criada com sucesso!','good');
      Snd.play('up');
      switchAuthTab('profile');
    }else{
      if(fb){fb.className='coop-feedback-text bad';fb.textContent='❌ '+((res&&res.error)||'Não foi possível criar a conta.');fb.classList.remove('hidden');}
      Snd.play('err');
    }
  });

  if($('btnAuthLogout'))$('btnAuthLogout').addEventListener('click',()=>{
    if(window.QZ_CLOUD_DB&&typeof window.QZ_CLOUD_DB.logoutAccount==='function')window.QZ_CLOUD_DB.logoutAccount();
    updateHomeStats();renderRank();
    toast('Sessão encerrada.','good');
    Snd.play('ui');
    switchAuthTab('login');
  });

  document.addEventListener('click',e=>{
    const cmdBtn=e.target.closest('.btn-pick-cmd');
    if(!cmdBtn||!cmdBtn.dataset.cmd)return;
    career.activeCommander=cmdBtn.dataset.cmd;
    saveCareer();
    renderAuthProfilePanel();
    renderBestiaryModal();
    Snd.play('up');
    const btd=window.QZ_BTD6_TOWERS;
    const cName=(btd&&btd.COMMANDERS&&btd.COMMANDERS[cmdBtn.dataset.cmd])?btd.COMMANDERS[cmdBtn.dataset.cmd].name:cmdBtn.dataset.cmd;
    toast('🎖 '+cName+' assumiu o comando das operações!','good');
  });

  if($('btnHomeBestiary'))$('btnHomeBestiary').addEventListener('click',openBestiaryModal);
  if($('btnBestiaryClose'))$('btnBestiaryClose').addEventListener('click',closeBestiaryModal);
  ['Zombies','Commanders','Barriers'].forEach(tab=>{
    const btn=$('tabBestiary'+tab);
    if(btn){
      btn.addEventListener('click',()=>{
        ['Zombies','Commanders','Barriers'].forEach(t=>{
          const b=$('tabBestiary'+t),p=$('bestiary'+t+'Panel');
          if(b){b.classList.toggle('active',t===tab);b.setAttribute('aria-selected',t===tab?'true':'false');}
          if(p)p.classList.toggle('hidden',t!==tab);
        });
        Snd.play('ui');
      });
    }
  });

  ['rankFilterMode','rankFilterMap','rankFilterDiff'].forEach(fid=>{
    if($(fid))$(fid).addEventListener('change',()=>{renderRank();Snd.play('ui');});
  });

  $('btnHomeAch').addEventListener('click',()=>{checkAch();renderAch();showScreen('achScreen');});
  const openRankScreen=()=>{Snd.init();renderRank();OnlineAPI.sync();showScreen('rankScreen');};
  $('btnHomeRank').addEventListener('click',openRankScreen);
  $('btnQuickRank').addEventListener('click',openRankScreen);
  $('btnHomeMiniRank').addEventListener('click',openRankScreen);
  $('btnRankBack').addEventListener('click',()=>showScreen('homeScreen'));
  $('btnSavePlayerName').addEventListener('click',()=>{
    setPlayerName($('playerNameInput').value);
    renderRank();Snd.play('ui');toast('Nome de comandante salvo no Ranking!','good');
  });
  $('playerNameInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){setPlayerName($('playerNameInput').value);renderRank();Snd.play('ui');toast('Nome de comandante salvo no Ranking!','good');}
  });
  document.querySelectorAll('.rank-sort').forEach(btn=>btn.addEventListener('click',()=>{
    rankSort=btn.dataset.sort||'wave';
    document.querySelectorAll('.rank-sort').forEach(b=>b.classList.toggle('active',b===btn));
    renderRank();Snd.play('ui');
  }));
  $('btnClearRank').addEventListener('click',()=>{
    const list=loadRank();
    if(!list.length){toast('O ranking já está vazio.','bad');return;}
    clearRanks();
    Snd.play('ui');
    toast('Todos os registros do ranking foram excluídos!','good');
  });
  $('rankListBody').addEventListener('click',e=>{
    const btn=e.target.closest('.btn-del-rank');
    if(!btn)return;
    deleteRankEntry(btn.dataset.id);
    Snd.play('ui');
    toast('Registro excluído do ranking.','good');
  });
  $('btnSaveEndName').addEventListener('click',()=>{
    setPlayerName($('endPlayerName').value);
    Snd.play('ui');toast('Nome atualizado no Ranking!','good');
  });
  $('btnEndRank').addEventListener('click',()=>{
    setPlayerName($('endPlayerName').value);
    document.body.classList.remove('settings-in-game');G.mode='menu';G.paused=false;G.placing=null;select(null);hideEnd();
    renderRank();showScreen('rankScreen');
  });
  $('btnAchBack').addEventListener('click',()=>showScreen('homeScreen'));
  $('btnAboutBack').addEventListener('click',()=>showScreen('homeScreen'));
  $('btnQuitApp').addEventListener('click',()=>{if(window.steamBridge)window.steamBridge.quit();});
  if(window.steamBridge)$('btnQuitApp').classList.remove('hidden');
  if($('btnConfirmHomeCancel')){
    $('btnConfirmHomeCancel').addEventListener('click',()=>{
      Snd.play('ui');
      hideDangerHome();
    });
  }
  if($('btnConfirmHomeExit')){
    $('btnConfirmHomeExit').addEventListener('click',()=>{
      Snd.play('ui');
      const cb=_confirmHomeCallback;
      hideDangerHome();
      if(cb){
        cb();
      } else {
        document.body.classList.remove('settings-in-game');
        $('btnSettingsReturnGame').classList.add('hidden');
        G.mode='menu';
        G.paused=false;
        G.placing=null;
        select(null);
        hideEnd();
        refreshContinue();
        showScreen('homeScreen');
      }
    });
  }
  $('btnSettingsBack').addEventListener('click',()=>{
    if(document.body.classList.contains('settings-in-game')||G.mode==='play'){
      promptDangerHome(()=>{
        document.body.classList.remove('settings-in-game');
        $('btnSettingsReturnGame').classList.add('hidden');
        G.mode='menu';
        G.paused=false;
        G.placing=null;
        select(null);
        hideEnd();
        refreshContinue();
        showScreen('homeScreen');
      });
    } else {
      document.body.classList.remove('settings-in-game');
      showScreen('homeScreen');
    }
  });
  $('btnInGameSettings').addEventListener('click',()=>{if(G.mode!=='play'&&G.mode!=='over')return;G.paused=true;$('settingsMap').value=$('mapSelect').value;$('settingsDifficulty').value=$('difficultySelect').value;$('settingsVolume').value=$('vol').value;document.body.classList.add('settings-in-game');$('settingsScreen').classList.remove('hidden');$('homeScreen').classList.add('hidden');$('aboutScreen').classList.add('hidden');$('startScreen').classList.add('hidden');$('btnSettingsReturnGame').classList.remove('hidden');});
  $('btnInGameHome').addEventListener('click',()=>{
    promptDangerHome(()=>{
      document.body.classList.remove('settings-in-game');
      G.mode='menu';
      G.paused=false;
      G.placing=null;
      select(null);
      hideEnd();
      refreshContinue();
      showScreen('homeScreen');
    });
  });
  $('btnSettingsReturnGame').addEventListener('click',()=>{ $('settingsScreen').classList.add('hidden');document.body.classList.remove('settings-in-game');$('btnSettingsReturnGame').classList.add('hidden');document.body.classList.remove('menu-mode');G.paused=true;Snd.syncMusic();toast('De volta à partida. O jogo continua pausado; use ▶ para continuar.','good');});
  $('btnMapsBack').addEventListener('click',()=>showScreen('homeScreen'));
  $('btnMapPrev').addEventListener('click',()=>{
    mapPage--;
    renderMapPagination(false);
    Snd.play('ui');
  });
  $('btnMapNext').addEventListener('click',()=>{
    mapPage++;
    renderMapPagination(false);
    Snd.play('ui');
  });
  const syncMapCards=val=>{document.querySelectorAll('.map-card').forEach(c=>c.classList.toggle('selected',c.dataset.map===val));};
  const syncDiffPills=val=>{document.querySelectorAll('.diff-pill').forEach(p=>p.classList.toggle('active',p.dataset.diff===val));};
  startGameOperation=()=>{
    Snd.init();
    document.body.classList.remove('menu-mode');
    document.body.classList.remove('settings-in-game');
    // Co-op online: mapa e dificuldade definidos pelo Host valem para os DOIS jogadores
    // (antes eram sobrescritos pelos seletores do menu inicial de cada PC -> partidas diferentes).
    if(COOP.active&&COOP.isMultiplayer){
      if($('difficultySelect'))$('difficultySelect').value=activeDifficulty;
      if($('mapSelect'))$('mapSelect').value=activeMap;
      syncMapCards(activeMap);syncDiffPills(activeDifficulty);
    }
    activeDifficulty=$('difficultySelect').value||'normal';
    career.lastDifficulty=activeDifficulty;
    selectMap($('mapSelect').value||'four');
    career.lastMap=activeMap;
    saveCareer();
    ['homeScreen','aboutScreen','settingsScreen','startScreen','achScreen','rankScreen','techScreen'].forEach(k=>{
      setElementHidden($(k),true);
    });
    resetGame();
    psGameStart();
    Snd.syncMusic();
    Snd.play('ui');
    fitCanvas();
  };

  document.querySelectorAll('.map-card').forEach(card=>card.addEventListener('click',()=>{
    const wasSelected=card.classList.contains('selected')&&$('mapSelect').value===card.dataset.map;
    $('mapSelect').value=card.dataset.map;
    syncMapCards(card.dataset.map);
    Snd.play('ui');
    if(IS_MOBILE&&wasSelected){
      startGameOperation();
    }
  }));
  $('mapSelect').addEventListener('change',e=>{syncMapCards(e.target.value);renderMapPagination(true);Snd.play('ui');});
  $('difficultySelect').addEventListener('change',e=>{syncDiffPills(e.target.value);Snd.play('ui');});
  document.querySelectorAll('.diff-pill').forEach(pill=>pill.addEventListener('click',()=>{
    $('difficultySelect').value=pill.dataset.diff;syncDiffPills(pill.dataset.diff);Snd.play('ui');
  }));
  document.querySelectorAll('.map-filter').forEach(btn=>btn.addEventListener('click',()=>{
    activeMapFilter=btn.dataset.filter||'all';
    document.querySelectorAll('.map-filter').forEach(b=>b.classList.toggle('active',b===btn));
    mapPage=0;
    renderMapPagination(false);
    Snd.play('ui');
  }));
  $('btnSaveSettings').addEventListener('click',()=>{
    $('mapSelect').value=$('settingsMap').value;$('difficultySelect').value=$('settingsDifficulty').value;
    syncMapCards($('mapSelect').value);syncDiffPills($('difficultySelect').value);
    $('vol').value=$('settingsVolume').value;Snd.init();Snd.vol=+$('settingsVolume').value/100;Snd.apply();
    if($('settingsPlatform'))applyPlatformMode($('settingsPlatform').value);
    applyQuality();
    if($('fpsCapSelect'))PERF.fpsCap=+$('fpsCapSelect').value===30?30:60;
    try{localStorage.setItem('ztd_v5_volume',$('settingsVolume').value);localStorage.setItem('ztd_v5_quality',$('qualitySelect').value);localStorage.setItem('ztd_v5_map',$('settingsMap').value);localStorage.setItem('ztd_v5_difficulty',$('settingsDifficulty').value);if($('fpsCapSelect'))localStorage.setItem('ztd_v5_fpscap',$('fpsCapSelect').value);}catch(e){}
    toast('Configurações salvas!','good');
  });
  if($('btnActivateLicense')){
    $('btnActivateLicense').addEventListener('click',()=>{
      OnlineAPI.activateLicense($('licenseKeyInput')?$('licenseKeyInput').value:'');
    });
  }
  if($('licenseKeyInput')){
    $('licenseKeyInput').addEventListener('keydown',e=>{
      if(e.key==='Enter')OnlineAPI.activateLicense($('licenseKeyInput').value);
    });
  }
  // Unificação de captura de entrada via Pointer Events API (elimina delay de 300ms no mobile)
  cv.addEventListener('pointermove',e=>updateMouse(e));
  cv.addEventListener('pointerleave',()=>{M.in=false;});
  cv.addEventListener('pointerdown',e=>{ if(e.button===2){return;} Snd.unlockMobileAudio(); updateMouse(e); canvasClick(e); });
  cv.addEventListener('pointerup',e=>updateMouse(e));
  cv.addEventListener('pointercancel',()=>{M.in=false;});
  cv.addEventListener('contextmenu',e=>{e.preventDefault();cancelAll();});

  $('btnPlay').addEventListener('click',startGameOperation);
  $('btnAgain').addEventListener('click',()=>{Snd.init();resetGame();psGameStart();});
  $('btnEndExit').addEventListener('click',()=>{document.body.classList.remove('settings-in-game');G.mode='menu';G.paused=false;G.placing=null;select(null);hideEnd();refreshContinue();showScreen('homeScreen');});
  $('btnContinue').addEventListener('click',()=>{hideEnd();G.paused=false;});
  $('btnPause').addEventListener('click',togglePause);
  document.querySelectorAll('.spd').forEach(b=>b.addEventListener('click',()=>setSpeed(+b.dataset.speed)));
  $('btnNext').addEventListener('click',()=>{ if(G.mode==='play'&&!G.paused){dispatch({type:'wave'});} else if(G.mode==='play'&&G.paused&&$('endScreen').classList.contains('hidden')){toast('Jogo pausado','bad');} });
  $('chkAuto').addEventListener('change',e=>dispatch({type:'auto',on:e.target.checked}));
  $('btnCancel').addEventListener('click',cancelAll);
  $('btnRestart').addEventListener('click',()=>{
    const b=$('btnRestart');
    if(UI.restartT){clearTimeout(UI.restartT);UI.restartT=0;b.textContent='Reiniciar';resetGame();return;}
    b.textContent='Confirmar?'; UI.restartT=setTimeout(()=>{UI.restartT=0;b.textContent='Reiniciar';},3000);
  });
  $('btnMute').addEventListener('click',()=>{Snd.init();Snd.muted=!Snd.muted;Snd.apply();$('btnMute').innerHTML=Snd.muted?'&#128263;':'&#128266;';});
  $('vol').addEventListener('input',e=>{Snd.init();Snd.vol=e.target.value/100;Snd.apply();});

  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      const im=$('installModal');
      if(im&&!im.classList.contains('hidden')){closeInstallModal();return;}
      const m=$('homeConfirmModal');
      if(m&&!m.classList.contains('hidden')){hideDangerHome();return;}
      cancelAll();
      return;
    }
    if(e.key==='F3'){psAdd('f3');PERF.show=!PERF.show;e.preventDefault();return;}
    if(G.mode!=='play'||document.body.classList.contains('menu-mode')||document.body.classList.contains('settings-in-game'))return;
    if(e.key===' '){e.preventDefault();togglePause();}
    else if(e.key==='n'||e.key==='N'){if(!G.paused)dispatch({type:'wave'});}
    else if(e.key==='f'||e.key==='F'){setSpeed(G.speed%3+1);}
    else if(e.key==='z'||e.key==='Z'){if(!G.paused)dispatch({type:'callin',callin:'napalm'});}
    else if(e.key==='x'||e.key==='X'){if(!G.paused)dispatch({type:'callin',callin:'overclock'});}
    else if(e.key==='c'||e.key==='C'){if(!G.paused)dispatch({type:'callin',callin:'barricade'});}
    else { const ix=TOWER_KEYS.indexOf(e.key.toLowerCase()); if(ix>=0&&TOWER_ORDER[ix]&&!G.paused)pickTower(TOWER_ORDER[ix]); }
  });
  window.addEventListener('resize',()=>{fitCanvas();if($('startScreen')&&!$('startScreen').classList.contains('hidden'))renderMapPagination(true);});
  window.addEventListener('orientationchange',()=>{fitCanvas();if($('startScreen')&&!$('startScreen').classList.contains('hidden'))renderMapPagination(true);});
  if(window.ResizeObserver)new ResizeObserver(fitCanvas).observe($('stage'));
  // Gerenciamento de Ciclo de Vida: pausa a simulação e silencia o áudio ao minimizar/alternar aba
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      if(G.mode==='play'&&$('endScreen').classList.contains('hidden'))G.paused=true;
      try{saveGame();psSave();}catch(_){}   // salva ao ir para segundo plano (ligacao, troca de app, bloqueio)
      Snd.onVisibilityChange(true);
      releaseWakeLock();
    } else {
      Snd.onVisibilityChange(false);
      if(G.mode==='play')requestWakeLock();
    }
  });
  // pagehide e mais confiavel que beforeunload no mobile
  window.addEventListener('pagehide',()=>{try{saveGame();psSave();}catch(_){}});
  // Mantem a tela acesa durante a partida (quando o navegador suporta Wake Lock)
  let wakeLock=null;
  function requestWakeLock(){try{if(navigator.wakeLock&&!wakeLock){navigator.wakeLock.request('screen').then(l=>{wakeLock=l;l.addEventListener('release',()=>{wakeLock=null;});}).catch(()=>{});}}catch(_){}}
  function releaseWakeLock(){try{if(wakeLock){wakeLock.release();wakeLock=null;}}catch(_){}}
  window.addEventListener('pointerdown',requestWakeLock,{once:true});
  // Bloqueia zoom por pinca/duplo toque e menu de contexto no canvas
  document.addEventListener('gesturestart',e=>e.preventDefault());
  $('game')&&$('game').addEventListener('contextmenu',e=>e.preventDefault());
}

/* ===================== 12. LOOP PRINCIPAL ===================== */
let last=0;
const STEP=1/60;let ACC=0;
const PERF={avg:.016,n:0,low:false,show:false,fpsCap:60,lastRender:0};
function frame(now){
  requestAnimationFrame(frame);
  if(PERF.fpsCap===30&&now-PERF.lastRender<31)return;
  PERF.lastRender=now;
  let dt=(now-last)/1000; last=now; if(!(dt>0))dt=0; if(dt>.1)dt=.1;
  // Se estiver bloqueado em orientação vertical (Portrait) no mobile, pausa o loop de lógica
  if(syncOrientationState()){
    render(); updateUI();
    return;
  }
  G.anim+=dt;
  if(G.shake>0)G.shake=Math.max(0,G.shake-dt*28);
  if(G.flash>0)G.flash=Math.max(0,G.flash-dt*1.6);
  if(G.replay)stepReplay();
  if(G.mode==='play'&&!G.paused&&!G.replay){
    G.time+=dt;                       // tempo sobrevivido (real, sem pausa)
    Powers.update(dt);                // recarga dos poderes: tempo REAL (ignora 2x/3x)
    ACC+=dt*G.speed;                  // passo FIXO: a simulação não depende da taxa de quadros (determinismo)
    const t0=performance.now();
    while(ACC>=STEP){ update(STEP); ACC-=STEP; if(G.mode!=='play')break; if(performance.now()-t0>14){ACC=0;break;} }  // sobrecarga: desacelera em vez de congelar
  }
  PERF.avg=PERF.avg*.97+dt*.03;
  if(!PERF.low&&G.mode==='play'&&PERF.avg>.034&&++PERF.n>120){PERF.low=true;CFG.weatherN=0;CFG.maxParts=Math.min(CFG.maxParts,300);toast('Modo desempenho ativado: efeitos reduzidos');}
  if(document.body.classList.contains('menu-mode')){
    renderMenuBg(dt);
    return;
  }
  render(); updateUI();
  if(G.replay){const R=G.replay,pc=Math.min(100,Math.round(G.tick/Math.max(1,R.target)*100));ctx.save();ctx.fillStyle='rgba(4,7,14,.82)';ctx.fillRect(-VIEW.padX,-VIEW.padY,W+VIEW.padX*2,H+VIEW.padY*2);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 26px "Segoe UI",sans-serif';ctx.fillText('Carregando partida… '+pc+'%',W/2,H/2-8);ctx.fillStyle='#22304d';ctx.fillRect(W/2-150,H/2+12,300,8);ctx.fillStyle='#27c9ff';ctx.fillRect(W/2-150,H/2+12,3*pc,8);ctx.restore();}
  if(G.mode==='play'&&!G.replay){if(!G.paused){PS.time=(PS.time||0)+dt;PS.dirty=true;}drawBanner(dt);drawBossBar();PERF.achT=(PERF.achT||0)+dt;if(PERF.achT>.5){PERF.achT=0;checkAch();}
    if(G.tips&&G.tips.length&&!G.paused&&G.simT>=G.tips[0][0]){const tp=G.tips.shift();toast(tp[1]);if(!G.tips.length)try{localStorage.setItem('ztd_v19_tut','1');}catch(e){}}}
  if(PERF.show){ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(6,6,190,24);ctx.fillStyle='#7fffa0';ctx.font='12px monospace';ctx.fillText(Math.round(1/PERF.avg)+' FPS · '+zombies.length+' zumbis (F3)',12,22);}
}

function init(){
  ctx=$('game').getContext('2d');
  UI.endEl=$('endScreen');
  G.auto=true; $('chkAuto').checked=true;
  loadCareer();
  $('mapSelect').value=career.lastMap; $('difficultySelect').value=career.lastDifficulty;
  document.querySelectorAll('.map-card').forEach(c=>c.classList.toggle('selected',c.dataset.map===career.lastMap));
  try{$('qualitySelect').value=localStorage.getItem('ztd_v5_quality')||'balanced';if($('fpsCapSelect')){$('fpsCapSelect').value=localStorage.getItem('ztd_v5_fpscap')||'60';PERF.fpsCap=+$('fpsCapSelect').value===30?30:60;}$('settingsMap').value=localStorage.getItem('ztd_v5_map')||career.lastMap;$('settingsDifficulty').value=localStorage.getItem('ztd_v5_difficulty')||career.lastDifficulty;const sv=localStorage.getItem('ztd_v5_volume');if(sv!==null){$('vol').value=sv;$('settingsVolume').value=sv;Snd.vol=+sv/100;}Snd.musicMuted=localStorage.getItem('ztd_v19_music_muted')==='1';}catch(e){}
  applyPlatformMode(getPlatformPref());
  activeDifficulty=career.lastDifficulty; selectMap(career.lastMap);
  TOWER_ORDER.forEach(k=>{
    UI.icons[k]=makeIcon(k);
    // Pré-carrega os retratos de evolução (T0..T5) no cache em memória para troca instantânea de skin (0ms)
    for(let tr=0;tr<=5;tr++)getTowerPortrait({key:k,level:Math.min(4,tr+1),spec:-1,dominantPath:0,tier:tr,paragon:false});
  });
  if(window.QZ_BTD6_UI&&typeof window.QZ_BTD6_UI.preloadAllBtd6Assets==='function'){
    UI.preloadedAssets=window.QZ_BTD6_UI.preloadAllBtd6Assets(TOWER_ORDER);
  }
  SecurityGuard.lockDefinitions();
  buildSidebar(); bindEvents(); fitCanvas(); Snd.syncMusic(); OnlineAPI.sync(); refreshInstallUI();
  // Registra o Service Worker (PWA offline) fora de inline script para manter CSP script-src 'self' e força atualização imediata
  try{
    if(typeof navigator!=='undefined'&&'serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
      let refreshing=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;location.reload();}});
      navigator.serviceWorker.register('./sw.js?v=19.34').then(reg=>{try{reg.update();}catch(_){}}).catch(()=>{});
    }
  }catch(_){}
  document.querySelectorAll('.map-card').forEach(c=>c.classList.toggle('selected',c.dataset.map===$('mapSelect').value));
  document.querySelectorAll('.diff-pill').forEach(p=>p.classList.toggle('active',p.dataset.diff===$('difficultySelect').value));
  G.life=CFG.baseLife; G.money=CFG.startMoney;
  SecurityGuard.syncVault();
  requestAnimationFrame(t=>{last=t;requestAnimationFrame(frame);});
}

// Pequena API para depuração/testes automatizados
window.ZTD={G,UI,CFG,MAPS,TOWERS,ZOMBIES,WM,Powers,powerState,towers,zombies,projs,mines,bombs,hazards,allies,obstacles,portals,COOP,generateCoopRoomCode,donateCoopCoins,triggerCoopPing,voteCoopAction,evaluateElementalCombo,buildWave,placeTower,upgradeTower,sellTower,setTowerAim,setPortalExit,clearObstacle,stunZ,getTowerPortrait,select,selectMap,refreshPanel,renderMapMedals,update,resetGame,validSpot,applyDamage,pathPos,PATH_LEN,endGame:()=>endGame(),POWERS,dispatch,CMDLOG,stateHash,seedRng,srand,rngState:()=>_s,achievements:()=>ACH,achLoad,ps:()=>PS,psSave,career:()=>career,loadCareer,saveCareer,computeLocalSig,renderAch,checkAch,saveGame,readSave,loadRank,renderRank,getPlayerName,setPlayerName,recordRankEntry,clearRanks,deleteRankEntry,OnlineAPI,SecurityGuard,detectDevice,applyPlatformMode,isMobile:()=>IS_MOBILE,TECH_DEFS,getTechBonus,buyTechPerk,resetTechPerks,renderTechScreen,callinState,triggerCommanderCallin};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
