// Gerador de imagens vetoriais exclusivas em alta resolução (SVGs) para as 26 Torres (com skins de evolução)
// e para os 15 Ícones Circulares da Árvore de Upgrades (Estilo Bloons TD 6)
const fs = require('fs');
const path = require('path');

const towersDir = path.join(__dirname, '..', 'assets', 'towers');
const upgradesDir = path.join(__dirname, '..', 'assets', 'upgrades');
fs.mkdirSync(towersDir, { recursive: true });
fs.mkdirSync(upgradesDir, { recursive: true });

const TOWER_META = {
  gunner:      { name: 'Atirador', col: '#84cc16', sec: '#3f6212', badge: 'METRALHADORA', kind: 'dual_barrel' },
  sniper:      { name: 'Franco-Atirador', col: '#38bdf8', sec: '#0369a1', badge: 'PRECISÃO', kind: 'sniper_rifle' },
  mortar:      { name: 'Morteiro', col: '#f59e0b', sec: '#b45309', badge: 'ARTILHARIA', kind: 'mortar_tube' },
  flame:       { name: 'Lança-Chamas', col: '#f97316', sec: '#c2410c', badge: 'INCINERADOR', kind: 'flamethrower' },
  tesla:       { name: 'Torre Elétrica', col: '#38bdf8', sec: '#1d4ed8', badge: 'ALTA TENSÃO', kind: 'tesla_coil' },
  ice:         { name: 'Torre de Gelo', col: '#7dd3fc', sec: '#0284c7', badge: 'CRIOGENIA', kind: 'ice_crystal' },
  poison:      { name: 'Torre Bio-Tóxica', col: '#a3e635', sec: '#3f6212', badge: 'BIO-TOXINA', kind: 'bio_tank' },
  antitank:    { name: 'Canhão Antitanque', col: '#fbbf24', sec: '#92400e', badge: 'ANTIBLINDAGEM', kind: 'heavy_cannon' },
  archer:      { name: 'Balista Tática', col: '#fbbf24', sec: '#78350f', badge: 'BALISTA', kind: 'crossbow' },
  boomerang:   { name: 'Lançador Glaive', col: '#2dd4bf', sec: '#0f766e', badge: 'GLAIVE', kind: 'glaive' },
  engineer:    { name: 'Engenheiro', col: '#f59e0b', sec: '#1e293b', badge: 'MECATRÔNICA', kind: 'eng_turret' },
  radar:       { name: 'Sentinela Radar', col: '#38bdf8', sec: '#0f172a', badge: 'DETECÇÃO', kind: 'radar_dish' },
  shotgun:     { name: 'Escopeta Pesada', col: '#fb923c', sec: '#7c2d12', badge: 'CANO DUPLO', kind: 'shotgun' },
  drone:       { name: 'Base de Drone', col: '#7dd3fc', sec: '#0369a1', badge: ' ESQUADRÃO AÉREO', kind: 'quad_drone' },
  demolition:  { name: 'Demolidor', col: '#ef4444', sec: '#991b1b', badge: 'MÍSSEIS', kind: 'rocket_pod' },
  railgun:     { name: 'Canhão Railgun', col: '#a855f7', sec: '#4c1d95', badge: 'ELETROMAGNÉTICO', kind: 'railgun' },
  medstation:  { name: 'Estação Médica', col: '#10b981', sec: '#065f46', badge: 'SUPORTE', kind: 'med_dome' },
  acid:        { name: 'Canhão de Ácido', col: '#bef264', sec: '#365314', badge: 'CORROSIVO', kind: 'acid_gun' },
  beacon:      { name: 'Farol de Comando', col: '#fbbf24', sec: '#1e293b', badge: 'COMANDO', kind: 'beacon_tower' },
  supplydepot: { name: 'Base Suprimentos', col: '#f59e0b', sec: '#78350f', badge: 'ECONOMIA', kind: 'supply_bunker' },
  cryogen:     { name: 'Torre de Estase', col: '#c084fc', sec: '#581c87', badge: 'ESTASE', kind: 'stasis_gyro' },
  nanomed:     { name: 'Estação Nano-Med', col: '#2be3a1', sec: '#064e3b', badge: 'NANO-REPARO', kind: 'nano_dome' },
  dartgun:     { name: 'Metralhadora Direcional', col: '#38bdf8', sec: '#334155', badge: 'MIRA TRAVADA', kind: 'dartgun_tripod' },
  dino:        { name: 'Domador Jurássico', col: '#10b981', sec: '#f97316', badge: 'INVOCAÇÃO DINO', kind: 'dino_handler' },
  minefactory: { name: 'Usina de Minas', col: '#facc15', sec: '#ef4444', badge: 'MINAS COM STUN', kind: 'mine_factory' },
  portal:      { name: 'Portal Tático', col: '#c084fc', sec: '#38bdf8', badge: 'TELEPORTE', kind: 'portal_gate' }
};

function renderTowerWeaponSvg(kind, col, sec, tier) {
  const isMax = tier >= 4;
  switch (kind) {
    case 'dartgun_tripod': {
      const gunCol = isMax ? '#0284c7' : tier >= 2 ? '#334155' : '#475569';
      const glow = isMax ? '#38bdf8' : '#22d3ee';
      return `
        <!-- Tripé Tático Militar -->
        <line x1="60" y1="54" x2="34" y2="74" stroke="#334155" stroke-width="4" stroke-linecap="round"/>
        <line x1="60" y1="54" x2="86" y2="74" stroke="#334155" stroke-width="4" stroke-linecap="round"/>
        <line x1="60" y1="54" x2="60" y2="78" stroke="#334155" stroke-width="4" stroke-linecap="round"/>
        <circle cx="34" cy="74" r="3.5" fill="${glow}"/><circle cx="86" cy="74" r="3.5" fill="${glow}"/><circle cx="60" cy="78" r="3.5" fill="${glow}"/>
        <!-- Mira Laser -->
        <line x1="78" y1="42" x2="116" y2="30" stroke="${isMax ? '#38bdf8' : '#ef4444'}" stroke-width="2" stroke-dasharray="4 2"/>
        <!-- Corpo e Canos Rotativos / Canhão de Energia Azul -->
        <g transform="translate(60,46) rotate(-18)">
          <rect x="-18" y="-11" width="26" height="22" rx="4" fill="${gunCol}" stroke="${glow}" stroke-width="1.5"/>
          <rect x="-14" y="-7" width="10" height="14" rx="2" fill="#090d16"/>
          <rect x="-12" y="-5" width="7" height="10" rx="1" fill="${glow}"/>
          <rect x="6" y="-8" width="${28 + tier * 2}" height="4" rx="1.5" fill="${gunCol}"/>
          <rect x="6" y="-2" width="${32 + tier * 2}" height="4" rx="1.5" fill="${isMax ? '#bae6fd' : '#94a3b8'}"/>
          <rect x="6" y="4" width="${28 + tier * 2}" height="4" rx="1.5" fill="${gunCol}"/>
          <rect x="18" y="-9" width="4" height="18" rx="1" fill="${glow}"/>
          ${isMax ? `<circle cx="${38 + tier * 2}" cy="0" r="6" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>` : ''}
        </g>`;
    }
    case 'dino_handler': {
      const dDark = isMax ? '#991b1b' : tier >= 2 ? '#9a3412' : '#14532d';
      const dCol = isMax ? '#dc2626' : tier >= 2 ? '#ea580c' : '#15803d';
      const dLight = isMax ? '#fca5a5' : tier >= 2 ? '#fdba74' : '#86efac';
      const dGlow = isMax ? '#38bdf8' : tier >= 2 ? '#facc15' : '#34d399';
      return `
        <!-- Centro de Comando Bio-Jurássico com Reator de Âmbar e Holograma -->
        <polygon points="12,72 20,46 50,46 58,72" fill="#0f172a" stroke="#10b981" stroke-width="1.8"/>
        <circle cx="35" cy="59" r="8" fill="#064e3b" stroke="#34d399" stroke-width="1.4"/>
        <circle cx="35" cy="59" r="4" fill="#f59e0b" stroke="#fff" stroke-width="0.9"/>
        <rect x="18" y="30" width="22" height="13" rx="2" fill="rgba(6,78,59,0.88)" stroke="#34d399" stroke-width="1.5"/>
        <line x1="21" y1="35" x2="36" y2="35" stroke="#a7f3d0" stroke-width="1.5"/>
        <line x1="21" y1="39" x2="32" y2="39" stroke="#38bdf8" stroke-width="1.5"/>
        <line x1="45" y1="46" x2="45" y2="22" stroke="#64748b" stroke-width="2.5"/>
        <circle cx="45" cy="20" r="4" fill="#34d399" stroke="#fff" stroke-width="1"/>
        <!-- Dinossauro Alfa Gigante Esculpido (T-Rex / Predador Cibernético) -->
        <g transform="translate(82,56)">
          <!-- Cauda Longa em Curva S -->
          <path d="M6,2 Q22,-4 34,-12 L24,6 Q14,8 4,6 Z" fill="${dDark}"/>
          <!-- Pernas Traseiras Musculosas e Garras -->
          <ellipse cx="4" cy="8" rx="6" ry="9" fill="${dDark}"/>
          <ellipse cx="-3" cy="8" rx="6.5" ry="9.5" fill="${dCol}" stroke="#090d16" stroke-width="1"/>
          <polygon points="-11,16 2,16 4,20 -13,20" fill="#0f172a"/>
          <polygon points="-11,16 -16,18 -11,20" fill="#fef3c7"/>
          <!-- Torso Colossal Escamoso e Placas Dorsais -->
          <ellipse cx="0" cy="-3" rx="18" ry="11" transform="rotate(10)" fill="${dCol}" stroke="${dDark}" stroke-width="1.6"/>
          <ellipse cx="-2" cy="1" rx="12" ry="5" transform="rotate(8)" fill="${dLight}"/>
          <polygon points="14,-9 17,-16 20,-8" fill="${dGlow}"/>
          <polygon points="7,-12 10,-19 13,-11" fill="${dGlow}"/>
          <polygon points="0,-14 3,-21 6,-13" fill="${dGlow}"/>
          <polygon points="-7,-14 -4,-21 -1,-13" fill="${dGlow}"/>
          <!-- Sela Cibernética e Reator Peitoral -->
          <polygon points="-8,-12 8,-10 10,-1 -6,-2" fill="#1e293b" stroke="${dGlow}" stroke-width="1.3"/>
          <circle cx="1" cy="-6" r="3.2" fill="${dGlow}"/>
          <!-- Pescoço e Cabeça Esculpida de T-Rex com Presas Serrilhadas -->
          <polygon points="-6,-10 -16,-24 -4,-22 2,-12" fill="${dCol}"/>
          <polygon points="-8,-28 -28,-26 -30,-17 -10,-16" fill="${dCol}" stroke="${dDark}" stroke-width="1.3"/>
          ${tier >= 2 ? `<polygon points="-8,-29 -21,-28 -18,-21 -8,-21" fill="#1e293b" stroke="${dGlow}" stroke-width="1"/>` : ''}
          <!-- Presas Superiores e Inferiores -->
          <polygon points="-27,-17 -25,-12 -23,-17" fill="#fef3c7"/>
          <polygon points="-22,-17 -20,-12 -18,-17" fill="#fef3c7"/>
          <polygon points="-17,-17 -15,-12 -13,-17" fill="#fef3c7"/>
          <polygon points="-9,-14 -26,-11 -24,-7 -9,-10" fill="${dDark}"/>
          <!-- Olho Feroz de Predador -->
          <polygon points="-19,-25 -13,-25 -14,-21 -19,-21" fill="${isMax ? '#38bdf8' : '#fef08a'}"/>
          <rect x="-16.5" y="-25" width="1.4" height="3.8" fill="#090d16"/>
        </g>`;
    }
    case 'mine_factory': {
      return `
        <!-- Instalação Industrial Militar Compacta -->
        <rect x="18" y="34" width="46" height="34" rx="5" fill="#1e293b" stroke="#facc15" stroke-width="1.8"/>
        <rect x="22" y="38" width="38" height="26" rx="3" fill="#0f172a"/>
        <!-- Calha Ejetora de Minas -->
        <rect x="58" y="44" width="22" height="14" rx="2" fill="#334155" stroke="#94a3b8" stroke-width="1.2"/>
        <circle cx="41" cy="51" r="10" fill="#1e293b" stroke="#facc15" stroke-width="1.8"/>
        <circle cx="41" cy="51" r="4" fill="#ef4444"/>
        <!-- Minas Metálicas Táticas com LEDs Piscantes -->
        <g transform="translate(92,42)">
          <ellipse cx="0" cy="0" rx="11" ry="7" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
          <ellipse cx="0" cy="-1.5" rx="7" ry="4.5" fill="#475569"/>
          <circle cx="0" cy="-2" r="3" fill="#ef4444"/>
        </g>
        <g transform="translate(88,62)">
          <ellipse cx="0" cy="0" rx="11" ry="7" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
          <ellipse cx="0" cy="-1.5" rx="7" ry="4.5" fill="#475569"/>
          <circle cx="0" cy="-2" r="3" fill="#facc15"/>
        </g>`;
    }
    case 'portal_gate': {
      return `
        <!-- Anéis Dimensionais do Portal Tático -->
        <ellipse cx="42" cy="48" rx="18" ry="24" fill="rgba(192,132,252,0.22)" stroke="#c084fc" stroke-width="3"/>
        <ellipse cx="42" cy="48" rx="11" ry="16" fill="rgba(56,189,248,0.28)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3"/>
        <ellipse cx="86" cy="48" rx="15" ry="20" fill="rgba(56,189,248,0.22)" stroke="#38bdf8" stroke-width="2.5"/>
        <path d="M58,42 C66,34 72,34 78,42" fill="none" stroke="#fde047" stroke-width="2" stroke-dasharray="3 2"/>`;
    }
    default: {
      return `
        <!-- Plataforma Blindada 2.5D + Torreta Evoluída -->
        <polygon points="32,68 42,46 78,46 88,68" fill="#1e293b" stroke="${col}" stroke-width="1.8"/>
        <circle cx="60" cy="48" r="${16 + tier}" fill="#0f172a" stroke="${col}" stroke-width="2.2"/>
        <g transform="translate(60,46) rotate(-16)">
          <rect x="-12" y="-9" width="24" height="18" rx="4" fill="${sec}" stroke="${col}" stroke-width="1.5"/>
          <rect x="8" y="-6" width="${24 + tier * 2.5}" height="5" rx="2" fill="#475569" stroke="${col}" stroke-width="1"/>
          <rect x="8" y="1" width="${24 + tier * 2.5}" height="5" rx="2" fill="#475569" stroke="${col}" stroke-width="1"/>
          ${tier >= 2 ? `<rect x="-8" y="-14" width="16" height="4" rx="1.5" fill="${col}"/>` : ''}
          ${tier >= 4 ? `<circle cx="${33 + tier * 2.5}" cy="0" r="5" fill="${col}" stroke="#fff" stroke-width="1.2"/>` : ''}
        </g>
        <circle cx="60" cy="46" r="5.5" fill="${col}" stroke="#ffffff" stroke-width="1.2"/>`;
    }
  }
}

function buildTowerSvg(key, meta, tier = 0, isParagon = false) {
  const col = isParagon ? '#fbbf24' : meta.col;
  const sec = isParagon ? '#78350f' : meta.sec;
  const tLvl = isParagon ? 5 : tier;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84" width="120" height="84">
  <defs>
    <radialGradient id="bg_${key}_${tier}" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${col}" stop-opacity="${0.28 + tLvl * 0.06}"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0.98"/>
    </radialGradient>
  </defs>
  <rect width="120" height="84" rx="10" fill="url(#bg_${key}_${tier})"/>
  <g stroke="rgba(148,163,184,0.12)" stroke-width="1">
    <line x1="24" y1="0" x2="24" y2="84"/><line x1="48" y1="0" x2="48" y2="84"/>
    <line x1="72" y1="0" x2="72" y2="84"/><line x1="96" y1="0" x2="96" y2="84"/>
    <line x1="0" y1="28" x2="120" y2="28"/><line x1="0" y1="56" x2="120" y2="56"/>
  </g>
  ${tLvl >= 1 ? `<circle cx="60" cy="48" r="${28 + tLvl}" fill="none" stroke="${col}" stroke-width="${1 + tLvl * 0.3}" stroke-opacity="0.55" stroke-dasharray="${tLvl >= 3 ? '5 3' : 'none'}"/>` : ''}
  ${renderTowerWeaponSvg(meta.kind, col, sec, tLvl)}
  ${tLvl >= 5 ? `<polygon points="60,6 64,14 72,14 66,19 68,27 60,22 52,27 54,19 48,14 56,14" fill="#fde047" stroke="#090d16" stroke-width="1"/>` : ''}
</svg>`;
}

// Gera imagens principais e de evolução para todas as 26 torres
for (const [key, meta] of Object.entries(TOWER_META)) {
  fs.writeFileSync(path.join(towersDir, `${key}.svg`), buildTowerSvg(key, meta, 2, false), 'utf8');
  for (let tr = 0; tr <= 5; tr++) {
    fs.writeFileSync(path.join(towersDir, `${key}-tier${tr}.svg`), buildTowerSvg(key, meta, tr, false), 'utf8');
  }
  fs.writeFileSync(path.join(towersDir, `${key}-paragon.svg`), buildTowerSvg(key, meta, 5, true), 'utf8');
}

// Gera os 15 Ícones Circulares Ilustrados da Árvore de Upgrades (3 caminhos x 5 níveis)
const PATH_COLORS = [
  { main: '#f97316', rim: '#fbbf24', bg: '#431407' }, // Linha 1: Poder de Fogo
  { main: '#38bdf8', rim: '#7dd3fc', bg: '#082f49' }, // Linha 2: Cadência & Tática
  { main: '#a855f7', rim: '#e879f9', bg: '#3b0764' }  // Linha 3: Alcance & Tecnologia
];

const UPGRADE_SHAPES = [
  // Path 0 (Poder de Fogo)
  [
    '<circle cx="24" cy="24" r="10" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6" stroke="#fbbf24" stroke-width="2.5"/><circle cx="24" cy="24" r="3.5" fill="#ef4444"/>',
    '<path d="M15 34V18l4.5-7 4.5 7v16h-9zm9 0V20l4.5-6 4.5 6v14h-9z" fill="#fbbf24" stroke="#fff" stroke-width="1.2"/>',
    '<polygon points="24,7 28,17 39,17 30,24 33,35 24,28 15,35 18,24 9,17 20,17" fill="#f97316" stroke="#fde047" stroke-width="1.6"/>',
    '<circle cx="24" cy="24" r="9" fill="#ef4444" stroke="#fde047" stroke-width="2"/><circle cx="24" cy="24" r="14" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="5 3"/>',
    '<path d="M10 34h28v3H10v-3zm0-3l4-15 10 7 10-7 4 15H10z" fill="#fde047" stroke="#f97316" stroke-width="1.6"/>'
  ],
  // Path 1 (Cadência & Tática)
  [
    '<path d="M13 31l8-7-8-7M23 31l8-7-8-7" fill="none" stroke="#38bdf8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    '<polygon points="26,7 12,25 22,25 20,41 36,21 25,21" fill="#fde047" stroke="#38bdf8" stroke-width="1.5"/>',
    '<circle cx="24" cy="15" r="4.5" fill="#38bdf8"/><circle cx="16" cy="29" r="4.5" fill="#38bdf8"/><circle cx="32" cy="29" r="4.5" fill="#38bdf8"/><circle cx="24" cy="24" r="13" fill="none" stroke="#bae6fd" stroke-width="2"/>',
    '<path d="M24 8l4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9z" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>',
    '<polygon points="24,6 37,14 37,34 24,42 11,34 11,14" fill="none" stroke="#fde047" stroke-width="2.4"/><circle cx="24" cy="24" r="7" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>'
  ],
  // Path 2 (Alcance & Tecnologia)
  [
    '<path d="M8 24s6-10 16-10 16 10 16 10-6 10-16 10-16-10-16-10z" fill="none" stroke="#e879f9" stroke-width="2.4"/><circle cx="24" cy="24" r="5" fill="#38bdf8"/>',
    '<path d="M11 32a13 13 0 0 1 26 0M16 32a8 8 0 0 1 16 0" fill="none" stroke="#38bdf8" stroke-width="2.4"/><circle cx="24" cy="32" r="3.5" fill="#fde047"/>',
    '<rect x="14" y="14" width="20" height="20" rx="3" fill="#1e1b4b" stroke="#c084fc" stroke-width="2.2"/><rect x="19" y="19" width="10" height="10" fill="#38bdf8"/>',
    '<ellipse cx="24" cy="24" rx="15" ry="6.5" transform="rotate(-30 24 24)" fill="none" stroke="#38bdf8" stroke-width="2.2"/><ellipse cx="24" cy="24" rx="15" ry="6.5" transform="rotate(30 24 24)" fill="none" stroke="#e879f9" stroke-width="2.2"/><circle cx="24" cy="24" r="4.5" fill="#fde047"/>',
    '<polygon points="24,6 40,24 24,42 8,24" fill="none" stroke="#fde047" stroke-width="2.4"/><circle cx="24" cy="24" r="6.5" fill="#c084fc" stroke="#fff" stroke-width="1.5"/>'
  ]
];

for (let pi = 0; pi < 3; pi++) {
  const c = PATH_COLORS[pi];
  for (let lv = 0; lv < 5; lv++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>
    <radialGradient id="ug_${pi}_${lv}" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${c.main}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${c.bg}" stop-opacity="0.98"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="24" r="22" fill="url(#ug_${pi}_${lv})" stroke="${c.rim}" stroke-width="2"/>
  ${UPGRADE_SHAPES[pi][lv]}
</svg>`;
    fs.writeFileSync(path.join(upgradesDir, `path${pi}-lv${lv + 1}.svg`), svg, 'utf8');
  }
}

console.log('Assets gerados com sucesso:', Object.keys(TOWER_META).length * 8, 'imagens de torres e 15 ícones circulares de upgrades.');
