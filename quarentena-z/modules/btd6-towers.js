// =========================================================
// QUARENTENA Z - BTD6 TOWERS, BOSSES & OBSTACLES MODULE
// - Torre Direcional (dartgun / Arma de Dardos/Dados)
// - Torre com Invocações & Dinossauro (dino / Domador Jurássico)
// - Usina de Minas Terrestres com Stun (minefactory)
// - Torre de Portal Tático (portal / Habilidade Ativa)
// - Boss de Alta Velocidade (speedboss / Carnífice Voraz)
// - Obstáculos Destrutíveis Temáticos nos 18 Mapas
// =========================================================
(function (root) {
  'use strict';

  const SKIN_PALETTES = {
    0: { badge: 'T0', ring: '#64748b', glow: 'rgba(148,163,184,0.22)', trim: '#94a3b8' },
    1: { badge: 'T1', ring: '#38bdf8', glow: 'rgba(56,189,248,0.28)', trim: '#7dd3fc' },
    2: { badge: 'T2', ring: '#4ade80', glow: 'rgba(74,222,128,0.30)', trim: '#86efac' },
    3: { badge: 'T3', ring: '#facc15', glow: 'rgba(250,204,21,0.34)', trim: '#fde047' },
    4: { badge: 'T4', ring: '#fb923c', glow: 'rgba(251,146,60,0.40)', trim: '#fdba74' },
    5: { badge: 'T5', ring: '#f43f5e', glow: 'rgba(244,63,94,0.48)', trim: '#fda4af' }
  };

  const PATH_SKINS = [
    { name: 'Calibre Pesado', accent: '#f97316', crown: '🔥' },
    { name: 'Cadência & Tática', accent: '#38bdf8', crown: '⚡' },
    { name: 'Tecnologia & Alcance', accent: '#a855f7', crown: '🛰️' }
  ];

  // Limites e parâmetros de balanceamento tático das 4 novas torres
  const NEW_TOWER_BALANCE = Object.freeze({
    dino: {
      baseCost: 520,
      maxCleaveTargets: 4,
      biteBaseCd: 0.85,
      allyMaxCount: 3,
      paragonAllyMaxCount: 5,
      abilityCost: 165,
      abilityCd: 28
    },
    dartgun: {
      baseCost: 340,
      basePierce: 2,
      baseRate: 5.6,
      baseRange: 280
    },
    minefactory: {
      baseCost: 430,
      maxMinesOnTrackPerTower: 18,
      baseMaxStacks: 4,
      bossStunFactor: 0.55,
      speedBossStunFactor: 0.85
    },
    portal: {
      baseCost: 580,
      abilityCost: 150,
      abilityCd: 24,
      maxTeleportedZombies: 10,
      baseWarpBack: 190
    }
  });

  // Obstáculos destrutíveis determinísticos e temáticos para os 18 mapas (removíveis com moedas)
  const MAP_OBSTACLE_PRESETS = {
    four: [
      { dx: 320, dy: 230, r: 18, cost: 200, name: 'Blindado Abandonado', kind: 'wagon' },
      { dx: 490, dy: 370, r: 18, cost: 240, name: 'Contentor Militar', kind: 'crate' },
      { dx: 660, dy: 250, r: 18, cost: 270, name: 'Barricada Urbana', kind: 'debris' }
    ],
    forest: [
      { dx: 315, dy: 225, r: 18, cost: 190, name: 'Tronco Mutante Caído', kind: 'debris' },
      { dx: 510, dy: 380, r: 18, cost: 230, name: 'Rocha Coberta de Musgo', kind: 'crate' },
      { dx: 675, dy: 245, r: 18, cost: 260, name: 'Caminhão Florestal', kind: 'wagon' }
    ],
    industrial: [
      { dx: 330, dy: 235, r: 18, cost: 210, name: 'Caldeira Enferrujada', kind: 'crate' },
      { dx: 495, dy: 365, r: 18, cost: 250, name: 'Empilhadeira Tombada', kind: 'wagon' },
      { dx: 665, dy: 255, r: 18, cost: 280, name: 'Escória Siderúrgica', kind: 'debris' }
    ],
    metro: [
      { dx: 310, dy: 240, r: 18, cost: 220, name: 'Vagão Descarrilado', kind: 'wagon' },
      { dx: 480, dy: 360, r: 18, cost: 250, name: 'Barricada Subterrânea', kind: 'debris' },
      { dx: 650, dy: 260, r: 18, cost: 280, name: 'Gerador de Linha', kind: 'crate' }
    ],
    highway: [
      { dx: 325, dy: 220, r: 18, cost: 220, name: 'Carreta Incendiada', kind: 'wagon' },
      { dx: 500, dy: 375, r: 18, cost: 260, name: 'Bloco de Pedágio', kind: 'debris' },
      { dx: 670, dy: 250, r: 18, cost: 290, name: 'Carga de Suprimentos', kind: 'crate' }
    ],
    laboratorio: [
      { dx: 320, dy: 230, r: 18, cost: 230, name: 'Câmara Criogênica Quebrada', kind: 'crate' },
      { dx: 490, dy: 370, r: 18, cost: 260, name: 'Reator Bioquímico', kind: 'wagon' },
      { dx: 660, dy: 250, r: 18, cost: 300, name: 'Entulho de Contenção', kind: 'debris' }
    ],
    artico: [
      { dx: 320, dy: 230, r: 18, cost: 210, name: 'Bloco Glacial Denso', kind: 'debris' },
      { dx: 490, dy: 370, r: 18, cost: 250, name: 'Trator de Neve Congelado', kind: 'wagon' },
      { dx: 660, dy: 250, r: 18, cost: 280, name: 'Cápsula Polar', kind: 'crate' }
    ],
    pantano: [
      { dx: 320, dy: 230, r: 18, cost: 200, name: 'Raízes Petrifícadas', kind: 'debris' },
      { dx: 490, dy: 370, r: 18, cost: 240, name: 'Barcaça Afundada', kind: 'wagon' },
      { dx: 660, dy: 250, r: 18, cost: 270, name: 'Barril Tóxico', kind: 'crate' }
    ],
    cratera: [
      { dx: 320, dy: 230, r: 18, cost: 230, name: 'Fragmento de Meteoro', kind: 'debris' },
      { dx: 490, dy: 370, r: 18, cost: 260, name: 'Sonda Militar Caída', kind: 'crate' },
      { dx: 660, dy: 250, r: 18, cost: 295, name: 'Blindado Derretido', kind: 'wagon' }
    ],
    default: [
      { dx: 320, dy: 230, r: 18, cost: 200, name: 'Destroços Blindados', kind: 'debris' },
      { dx: 490, dy: 370, r: 18, cost: 240, name: 'Contentor Militar', kind: 'crate' },
      { dx: 660, dy: 250, r: 18, cost: 270, name: 'Barricada Pesada', kind: 'wagon' }
    ]
  };

  function getTowerSkinInfo(tower) {
    if (!tower) return { tier: 0, dominantPath: -1, palette: SKIN_PALETTES[0], pathSkin: null, portraitIcon: '🗼' };
    const lv = tower.levels || tower.pathLevels || [0, 0, 0];
    const maxLv = Math.max(lv[0] || 0, lv[1] || 0, lv[2] || 0);
    let dominantPath = -1;
    if (maxLv > 0) {
      if (lv[0] >= lv[1] && lv[0] >= lv[2]) dominantPath = 0;
      else if (lv[1] >= lv[0] && lv[1] >= lv[2]) dominantPath = 1;
      else dominantPath = 2;
    }
    const palette = tower.paragon
      ? { badge: 'ASC', ring: '#fbbf24', glow: 'rgba(251,191,36,0.65)', trim: '#fef08a' }
      : (SKIN_PALETTES[Math.min(5, maxLv)] || SKIN_PALETTES[0]);
    const pathSkin = dominantPath >= 0 ? PATH_SKINS[dominantPath] : null;
    return {
      tier: maxLv,
      dominantPath,
      palette,
      pathSkin
    };
  }

  root.QZ_BTD6_TOWERS = {
    SKIN_PALETTES,
    PATH_SKINS,
    NEW_TOWER_BALANCE,
    MAP_OBSTACLE_PRESETS,
    getTowerSkinInfo
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
