// =========================================================
// QUARENTENA Z - BTD6 TOWERS, BOSSES & OBSTACLES MODULE
// - Torre Direcional (dartgun / Arma de Dardos/Dados)
// - Torre com Invocações & Dinossauro (dino)
// - Usina de Minas Terrestres com Stun (minefactory)
// - Torre de Portal Tático (portal / Habilidade Ativa)
// - Boss de Alta Velocidade (speedboss)
// - Obstáculos Destrutíveis por Mapa
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

  // Obstáculos destrutíveis determinísticos para mapas (removíveis com moedas)
  const MAP_OBSTACLE_PRESETS = {
    metro: [
      { dx: 310, dy: 210, r: 22, cost: 220, name: 'Vagão Descarrilado', kind: 'wagon' },
      { dx: 520, dy: 390, r: 21, cost: 260, name: 'Barricada de Concreto', kind: 'debris' },
      { dx: 690, dy: 230, r: 20, cost: 300, name: 'Gerador Subterrâneo', kind: 'crate' }
    ],
    default: [
      { dx: 330, dy: 220, r: 20, cost: 200, name: 'Destroços Blindados', kind: 'debris' },
      { dx: 540, dy: 410, r: 20, cost: 240, name: 'Contentor Militar', kind: 'crate' },
      { dx: 680, dy: 240, r: 20, cost: 280, name: 'Ruína de Contenção', kind: 'wagon' }
    ]
  };

  function getTowerSkinInfo(tower) {
    if (!tower) return { tier: 0, dominantPath: -1, palette: SKIN_PALETTES[0], pathSkin: null, portraitIcon: '🗼' };
    const lv = tower.levels || [0, 0, 0];
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
    MAP_OBSTACLE_PRESETS,
    getTowerSkinInfo
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
