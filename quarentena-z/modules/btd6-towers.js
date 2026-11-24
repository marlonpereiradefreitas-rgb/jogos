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

  // =========================================================
  // SISTEMA DE 3 COMANDANTES JOGÁVEIS (NÍVEL 1 A 15)
  // =========================================================
  const COMMANDERS = Object.freeze({
    vance: {
      id: 'vance',
      name: 'Comandante Vance',
      title: 'Bastião Blindado',
      icon: '🛡️',
      accent: '#38bdf8',
      role: 'Artilharia Balística & Fortificação',
      desc: 'Aumenta o dano de torres balísticas/explosivas e reforça a blindagem máxima da Base Alfa.',
      perkSummary: lv => `+${Math.round(3 + lv * 1.5)}% Dano Balístico · +${lv * 2} Vida da Base`
    },
    elena: {
      id: 'elena',
      name: 'Dra. Elena Kovács',
      title: 'Valquíria Bio-Tech',
      icon: '⚡',
      accent: '#a855f7',
      role: 'Energia, Elementos & Recarga Tática',
      desc: 'Amplifica o dano elemental/químico/laser e reduz o tempo de recarga das habilidades ativas.',
      perkSummary: lv => `+${Math.round(4 + lv * 1.7)}% Dano Elemental · -${Math.round(3 + lv * 1.3)}% Recarga`
    },
    marcus: {
      id: 'marcus',
      name: 'Major Marcus Sterling',
      title: 'Fantasma Tático',
      icon: '🎯',
      accent: '#10b981',
      role: 'Operações Especiais, Alcance & Economia',
      desc: 'Expande o alcance de radar das torres, concede moedas extras iniciais e fortalece Sniper, Dino e Direcional.',
      perkSummary: lv => `+${Math.round(2 + lv * 1.2)}% Alcance Global · +$${10 + lv * 8} Moedas Iniciais`
    }
  });

  function getCommanderLevelInfo(xp) {
    const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    let neededForNext = 100;
    let accum = 0;
    for (let lv = 1; lv < 15; lv++) {
      const step = Math.round(100 * Math.pow(1.26, lv - 1));
      if (safeXp >= accum + step) {
        accum += step;
        level = lv + 1;
      } else {
        neededForNext = step;
        break;
      }
    }
    const currentInLevel = level >= 15 ? neededForNext : Math.max(0, safeXp - accum);
    const progressPct = level >= 15 ? 100 : Math.min(100, Math.round((currentInLevel / Math.max(1, neededForNext)) * 100));
    return {
      level: Math.max(1, Math.min(15, level)),
      maxLevel: 15,
      xp: safeXp,
      currentInLevel,
      neededForNext,
      progressPct
    };
  }

  function getCommanderBonuses(commanderId, xpOrLevel) {
    const id = COMMANDERS[commanderId] ? commanderId : 'vance';
    const lv = (xpOrLevel >= 1 && xpOrLevel <= 15 && xpOrLevel === Math.floor(xpOrLevel))
      ? xpOrLevel
      : getCommanderLevelInfo(xpOrLevel).level;
    return {
      id,
      level: lv,
      ballisticDmgMult: id === 'vance' ? 1 + (0.03 + lv * 0.015) : 1,
      baseLifeBonus: id === 'vance' ? lv * 2 : 0,
      elementalDmgMult: id === 'elena' ? 1 + (0.04 + lv * 0.017) : 1,
      abilityCdMult: id === 'elena' ? Math.max(0.70, 1 - (0.03 + lv * 0.013)) : 1,
      rangeMult: id === 'marcus' ? 1 + (0.02 + lv * 0.012) : 1,
      startMoneyBonus: id === 'marcus' ? (10 + lv * 8) : 0,
      specOpsDmgMult: id === 'marcus' ? 1 + (0.04 + lv * 0.016) : 1
    };
  }

  // =========================================================
  // SISTEMA GEOMÉTRICO DE LINHA DE VISÃO (RAYCASTING 2D — ESTILO BTD6 SNIPER)
  // =========================================================
  const LOS_TOWER_KEYS = new Set(['sniper', 'dartgun', 'gunner', 'shotgun', 'antitank', 'railgun', 'archer']);

  function isTowerAffectedByLoS(tower) {
    if (!tower) return false;
    if (tower.paragon) return false; // Ascendidas enxergam sobre barreiras
    if (tower.s && tower.s.ignoreLoS) return false; // Upgrades de Mira Térmica / Satélite / Perfuração Total
    const lv = tower.levels || [0, 0, 0];
    // Tier 4+ na linha de Tecnologia/Óptica (caminho 2 ou 3 no Sniper/Direcional) contorna barreiras menores
    if ((tower.key === 'sniper' || tower.key === 'dartgun') && (lv[1] >= 4 || lv[2] >= 4)) return false;
    return LOS_TOWER_KEYS.has(tower.key);
  }

  /**
   * Verifica se o segmento de reta (x1,y1)->(x2,y2) intercepta um círculo (cx,cy,r)
   */
  function segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return false;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    // Ignora extremidades exatas (0..0.04) para não auto-bloquear na própria base
    if (t < 0.04 || t > 0.98) return false;
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const distSq = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    return distSq <= r * r;
  }

  /**
   * Retorna true se há linha de visão livre entre (x1,y1) e (x2,y2)
   */
  function hasLineOfSight(x1, y1, x2, y2, obstacles, tower) {
    if (!Array.isArray(obstacles) || obstacles.length === 0) return true;
    if (tower && !isTowerAffectedByLoS(tower)) return true;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (!obs || obs.blocksLoS === false) continue;
      const rad = Math.max(10, (obs.r || 18) * 0.88);
      if (segmentIntersectsCircle(x1, y1, x2, y2, obs.x, obs.y, rad)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Calcula o primeiro ponto de impacto de um raio direcional (ex: Torre Direcional) contra uma barreira
   */
  function raycastFirstBarrierHit(x1, y1, angle, maxDist, obstacles, tower) {
    if (!Array.isArray(obstacles) || obstacles.length === 0) return null;
    if (tower && !isTowerAffectedByLoS(tower)) return null;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let bestT = maxDist + 1;
    let hitObs = null;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (!obs || obs.blocksLoS === false) continue;
      const r = Math.max(10, (obs.r || 18) * 0.9);
      const fx = obs.x - x1;
      const fy = obs.y - y1;
      const proj = fx * cos + fy * sin;
      if (proj <= 6 || proj > maxDist) continue;
      const perpSq = (fx * fx + fy * fy) - proj * proj;
      if (perpSq <= r * r) {
        const offset = Math.sqrt(Math.max(0, r * r - perpSq));
        const tHit = Math.max(6, proj - offset);
        if (tHit < bestT) {
          bestT = tHit;
          hitObs = obs;
        }
      }
    }
    if (!hitObs) return null;
    return {
      x: x1 + cos * bestT,
      y: y1 + sin * bestT,
      dist: bestT,
      obstacle: hitObs
    };
  }

  /**
   * Calcula os cones de sombra 2D projetados pelas barreiras dentro do alcance da torre
   */
  function computeShadowCones(tx, ty, range, obstacles) {
    const cones = [];
    if (!Array.isArray(obstacles) || !obstacles.length) return cones;
    const maxR = Math.min(980, Math.max(120, range || 260));
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (!obs || obs.blocksLoS === false) continue;
      const dx = obs.x - tx;
      const dy = obs.y - ty;
      const d = Math.hypot(dx, dy);
      const r = Math.max(10, (obs.r || 18) * 0.92);
      if (d <= r + 4 || d > maxR + r) continue;
      const centerAng = Math.atan2(dy, dx);
      const halfSpread = Math.asin(Math.min(0.98, r / d));
      cones.push({
        obs,
        dist: d,
        r,
        a1: centerAng - halfSpread,
        a2: centerAng + halfSpread,
        maxR: Math.max(maxR, d + 120)
      });
    }
    return cones;
  }

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
    COMMANDERS,
    LOS_TOWER_KEYS,
    getCommanderLevelInfo,
    getCommanderBonuses,
    isTowerAffectedByLoS,
    segmentIntersectsCircle,
    hasLineOfSight,
    raycastFirstBarrierHit,
    computeShadowCones,
    getTowerSkinInfo
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
