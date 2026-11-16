// =========================================================
// QUARENTENA Z - BTD6 UI/UX & DEFENSIVE VALIDATION MODULE
// - Painel de Inspeção da Torre (Retrato, Abates, Alvo, 3 Linhas)
// - Skins Dinâmicas por Upgrade no Retrato
// - Medalhas de Dificuldade nos 18 Mapas
// - Validação Defensiva de Coordenadas, Limites e Saldo
// =========================================================
(function (root) {
  'use strict';

  const DIFF_MEDALS = [
    { key: 'easy', label: 'Fácil', icon: '🥉', cls: 'medal-easy' },
    { key: 'normal', label: 'Normal', icon: '🥈', cls: 'medal-normal' },
    { key: 'hard', label: 'Difícil', icon: '🥇', cls: 'medal-hard' },
    { key: 'apocalypse', label: 'Apocalipse', icon: '☣️', cls: 'medal-apoc' }
  ];

  function validateFinitePoint(x, y, maxW, maxH, margin) {
    const m = Number.isFinite(margin) ? margin : 8;
    const w = Number.isFinite(maxW) ? maxW : 960;
    const h = Number.isFinite(maxH) ? maxH : 640;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= m && x <= (w - m) && y >= m && y <= (h - m);
  }

  function clampPointToMap(x, y, maxW, maxH, margin) {
    const m = Number.isFinite(margin) ? margin : 14;
    const w = Number.isFinite(maxW) ? maxW : 960;
    const h = Number.isFinite(maxH) ? maxH : 640;
    const cx = Number.isFinite(x) ? Math.max(m, Math.min(w - m, x)) : w * 0.5;
    const cy = Number.isFinite(y) ? Math.max(m, Math.min(h - m, y)) : h * 0.5;
    return { x: Math.round(cx), y: Math.round(cy) };
  }

  function renderPathPipsHtml(level, maxLevel) {
    const max = maxLevel || 5;
    const lv = Math.max(0, Math.min(max, level || 0));
    let html = '<span class="btd6-pips" aria-label="Nível ' + lv + ' de ' + max + '">';
    for (let i = 1; i <= max; i++) {
      html += '<span class="btd6-pip' + (i <= lv ? ' on' : '') + '"></span>';
    }
    html += '</span>';
    return html;
  }

  function renderMapMedalsHtml(mapKey, careerMedals) {
    const mapRec = (careerMedals && careerMedals[mapKey]) || {};
    let html = '<div class="map-medals" aria-label="Medalhas conquistadas">';
    for (let i = 0; i < DIFF_MEDALS.length; i++) {
      const m = DIFF_MEDALS[i];
      const won = !!mapRec[m.key];
      html +=
        '<span class="map-medal ' + m.cls + (won ? ' won' : ' locked') + '" title="' +
        m.label + (won ? ' (Conquistada!)' : ' (Pendente)') + '">' +
        '<span class="mm-ico">' + m.icon + '</span>' +
        '</span>';
    }
    html += '</div>';
    return html;
  }

  const PRELOADED_IMAGES = {};
  function preloadImageAsset(src) {
    if (!src || PRELOADED_IMAGES[src]) return PRELOADED_IMAGES[src] || null;
    if (typeof Image === 'undefined') return null;
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      PRELOADED_IMAGES[src] = img;
      return img;
    } catch (_) {
      return null;
    }
  }

  function preloadAllBtd6Assets(towerKeys) {
    const keys = Array.isArray(towerKeys) ? towerKeys : [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      preloadImageAsset('assets/towers/' + k + '.svg');
      for (let tr = 0; tr <= 5; tr++) {
        preloadImageAsset('assets/towers/' + k + '-tier' + tr + '.svg');
      }
      preloadImageAsset('assets/towers/' + k + '-paragon.svg');
    }
    for (let pi = 0; pi < 3; pi++) {
      for (let lv = 1; lv <= 5; lv++) {
        preloadImageAsset('assets/upgrades/path' + pi + '-lv' + lv + '.svg');
      }
    }
    return PRELOADED_IMAGES;
  }

  root.QZ_BTD6_UI = {
    DIFF_MEDALS,
    PRELOADED_IMAGES,
    preloadImageAsset,
    preloadAllBtd6Assets,
    validateFinitePoint,
    clampPointToMap,
    renderPathPipsHtml,
    renderMapMedalsHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
