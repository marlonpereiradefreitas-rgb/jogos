// ============================================================================
// QUARENTENA Z — MODO COOPERATIVO (2 A 4 JOGADORES), DOAÇÃO POR PORCENTAGEM,
// DIVISÃO DE MAPA, ASCENSÃO EM EQUIPE, COMBOS ELEMENTAIS E VOTAÇÃO EM GRUPO
// ============================================================================
(function (root) {
  'use strict';

  const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const VALID_DONATION_PCTS = [0.25, 0.50, 1.00];

  /**
   * Gera um código alfanumérico aleatório único para Salas Privadas (ex: QZ-8K4M9X)
   */
  function generateRoomCode() {
    let code = 'QZ-';
    for (let i = 0; i < 6; i++) {
      let r = 0;
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buf = new Uint8Array(1);
        crypto.getRandomValues(buf);
        r = buf[0];
      } else {
        r = Math.floor(Math.random() * 256);
      }
      code += CODE_ALPHABET[r % CODE_ALPHABET.length];
    }
    return code;
  }

  function isValidRoomCode(raw) {
    const clean = String(raw || '').trim().toUpperCase();
    return /^QZ-?[2-9A-Z]{4,8}$/.test(clean);
  }

  /**
   * Calcula e valida uma doação percentual de moedas (25%, 50%, 100%)
   * Arredonda sempre para número inteiro (Math.floor) e bloqueia valores inválidos.
   */
  function calculatePercentageDonation(currentBalance, pct) {
    const bal = Math.floor(Number(currentBalance) || 0);
    const numPct = Number(pct);
    if (!Number.isFinite(bal) || bal <= 0) {
      return { valid: false, amount: 0, remaining: Math.max(0, bal), error: 'Saldo insuficiente para doação.' };
    }
    const matchedPct = VALID_DONATION_PCTS.find((p) => Math.abs(p - numPct) < 0.001);
    if (!matchedPct) {
      return { valid: false, amount: 0, remaining: bal, error: 'Porcentagem de doação inválida. Use 25%, 50% ou 100%.' };
    }
    const amount = Math.floor(bal * matchedPct);
    if (amount < 1 || amount > bal) {
      return { valid: false, amount: 0, remaining: bal, error: 'Valor calculado insuficiente para transferência.' };
    }
    return {
      valid: true,
      pct: matchedPct,
      amount: amount | 0,
      remaining: (bal - amount) | 0
    };
  }

  /**
   * Retorna os limites retangulares {x, y, width, height, pct, label} da área atribuída ao jogador.
   * Varia estritamente de acordo com a quantidade de players (2P = 50%, 3P = 33/34%, 4P = 25%).
   */
  function getSectorBounds(slot, mapW, mapH, playerCount, divisionMode) {
    const w = mapW || 960;
    const h = mapH || 640;
    const n = Math.max(2, Math.min(4, playerCount || 2));
    const s = Math.max(0, Math.min(n - 1, slot || 0));

    if (divisionMode === 'free') {
      return { x: 0, y: 0, width: w, height: h, pct: 100, label: 'Livre' };
    }

    if (divisionMode === 'horizontal') {
      const stepH = h / n;
      const pct = Math.round(100 / n);
      return { x: 0, y: Math.round(s * stepH), width: w, height: Math.round(stepH), pct, label: `Faixa ${s + 1}` };
    }

    if (divisionMode === 'vertical') {
      const stepW = w / n;
      const pct = Math.round(100 / n);
      return { x: Math.round(s * stepW), y: 0, width: Math.round(stepW), height: h, pct, label: `Coluna ${s + 1}` };
    }

    // Setores Adaptativos Padrão: 2P = 2 metades (50%), 3P = 3 faixas verticais (33%), 4P = 4 quadrantes (25%)
    if (n === 2) {
      const halfW = Math.round(w * 0.5);
      return s === 0
        ? { x: 0, y: 0, width: halfW, height: h, pct: 50, label: 'Oeste (50%)' }
        : { x: halfW, y: 0, width: w - halfW, height: h, pct: 50, label: 'Leste (50%)' };
    }

    if (n === 3) {
      const colW = Math.round(w / 3);
      if (s === 0) return { x: 0, y: 0, width: colW, height: h, pct: 33, label: 'Flanco Oeste (33%)' };
      if (s === 1) return { x: colW, y: 0, width: colW, height: h, pct: 34, label: 'Centro (34%)' };
      return { x: colW * 2, y: 0, width: w - (colW * 2), height: h, pct: 33, label: 'Flanco Leste (33%)' };
    }

    // 4 jogadores: 4 quadrantes exatos (25% cada)
    const midX = Math.round(w * 0.5);
    const midY = Math.round(h * 0.5);
    if (s === 0) return { x: 0, y: 0, width: midX, height: midY, pct: 25, label: 'Noroeste (25%)' };
    if (s === 1) return { x: midX, y: 0, width: w - midX, height: midY, pct: 25, label: 'Nordeste (25%)' };
    if (s === 2) return { x: 0, y: midY, width: midX, height: h - midY, pct: 25, label: 'Sudoeste (25%)' };
    return { x: midX, y: midY, width: w - midX, height: h - midY, pct: 25, label: 'Sudeste (25%)' };
  }

  /**
   * Verifica a qual jogador pertence a coordenada (x, y) de acordo com o modo e contagem de players
   */
  function getPointSectorOwner(x, y, mapW, mapH, playerCount, divisionMode) {
    if (divisionMode === 'free' || !playerCount || playerCount <= 1) return 0;
    const w = mapW || 960;
    const h = mapH || 640;
    const n = Math.max(2, Math.min(4, playerCount || 2));

    if (divisionMode === 'horizontal') {
      const idx = Math.floor((y / h) * n);
      return Math.max(0, Math.min(n - 1, idx));
    }

    if (divisionMode === 'vertical') {
      const idx = Math.floor((x / w) * n);
      return Math.max(0, Math.min(n - 1, idx));
    }

    // Setores adaptativos padrão
    if (n === 2) {
      return x < w * 0.5 ? 0 : 1;
    }
    if (n === 3) {
      if (x < w / 3) return 0;
      if (x < (w * 2) / 3) return 1;
      return 2;
    }
    // 4 jogadores: quadrantes
    const right = x >= w * 0.5 ? 1 : 0;
    const bottom = y >= h * 0.5 ? 2 : 0;
    return bottom + right;
  }

  /**
   * Calcula o multiplicador de Combo Elemental quando aliados combinam
   * Fogo, Gelo, Eletricidade e Veneno no mesmo infectado.
   */
  function evaluateElementalCombo(zombie, incomingDtype) {
    if (!zombie) return { count: 0, mult: 1.0, activeElements: [] };
    const elems = [];
    if ((zombie.burnT && zombie.burnT > 0) || incomingDtype === 'fire') elems.push('fire');
    if ((zombie.slowT && zombie.slowT > 0) || (zombie.freezeT && zombie.freezeT > 0) || incomingDtype === 'ice') elems.push('ice');
    if ((zombie.stunT && zombie.stunT > 0) || incomingDtype === 'elec') elems.push('elec');
    if ((zombie.poisonT && zombie.poisonT > 0) || incomingDtype === 'poison') elems.push('poison');

    const count = elems.length;
    if (count < 2) return { count, mult: 1.0, activeElements: elems };
    // 2 elementos = +18% dano | 3 elementos = +30% dano | 4 elementos = +45% dano
    const bonusTable = [1.0, 1.0, 1.18, 1.30, 1.45];
    return {
      count,
      mult: bonusTable[Math.min(4, count)] || 1.18,
      activeElements: elems
    };
  }

  const SECTOR_COLORS = ['#38bdf8', '#4ade80', '#facc15', '#f472b6'];

  function formatRoomCode(raw) {
    if (!raw) return '';
    let clean = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.startsWith('QZ')) clean = clean.slice(2);
    clean = clean.slice(0, 6);
    return 'QZ-' + clean;
  }

  function getSectorColor(slot) {
    return SECTOR_COLORS[Math.max(0, Math.min(3, slot || 0))] || '#38bdf8';
  }

  function getSectorName(slot, playerCount, divisionMode) {
    if (divisionMode === 'free' || !playerCount || playerCount <= 1) {
      return 'Zona Livre (100% Compartilhado)';
    }
    const p = (slot | 0) + 1;
    const n = Math.max(2, Math.min(4, playerCount || 2));
    if (divisionMode === 'horizontal') {
      const pct = Math.round(100 / n);
      const hNames = [
        ['Norte · Vanguarda', 'Sul · Retaguarda'],
        ['Zona Norte', 'Zona Central', 'Zona Sul'],
        ['Faixa 1 (Norte)', 'Faixa 2 (Centro-Norte)', 'Faixa 3 (Centro-Sul)', 'Faixa 4 (Sul)']
      ];
      const desc = (hNames[n - 2] && hNames[n - 2][slot]) || `Faixa ${p}`;
      return `${desc} (${pct}% do mapa)`;
    }
    if (divisionMode === 'vertical') {
      const pct = Math.round(100 / n);
      const vNames = [
        ['Setor Oeste', 'Setor Leste'],
        ['Flanco Oeste', 'Setor Central', 'Flanco Leste'],
        ['Coluna 1 (Oeste)', 'Coluna 2 (Centro-Oeste)', 'Coluna 3 (Centro-Leste)', 'Coluna 4 (Leste)']
      ];
      const desc = (vNames[n - 2] && vNames[n - 2][slot]) || `Coluna ${p}`;
      return `${desc} (${pct}% do mapa)`;
    }
    // sectors (adaptativo padrão)
    if (n === 2) {
      return slot === 0 ? 'Setor Alfa · Oeste (50% do mapa)' : 'Setor Bravo · Leste (50% do mapa)';
    }
    if (n === 3) {
      const names = ['Flanco Oeste (33% do mapa)', 'Setor Central (34% do mapa)', 'Flanco Leste (33% do mapa)'];
      return names[slot] || `Setor P${p} (33% do mapa)`;
    }
    // 4 jogadores: quadrantes
    const qNames = [
      'Quadrante Noroeste (25% do mapa)',
      'Quadrante Nordeste (25% do mapa)',
      'Quadrante Sudoeste (25% do mapa)',
      'Quadrante Sudeste (25% do mapa)'
    ];
    return qNames[slot] || `Quadrante P${p} (25% do mapa)`;
  }

  /**
   * Renderiza os limites táticos de setores no canvas durante a batalha
   */
  function drawSectorLines(ctx, w, h, playerCount, divisionMode, localSlot, isPlacing) {
    if (divisionMode === 'free' || !playerCount || playerCount <= 1) return;
    const n = Math.max(2, Math.min(4, playerCount || 2));
    ctx.save();

    for (let slot = 0; slot < n; slot++) {
      const b = getSectorBounds(slot, w, h, n, divisionMode);
      const col = SECTOR_COLORS[slot] || '#38bdf8';
      const isMine = slot === (localSlot || 0);

      // Se o jogador estiver posicionando uma torre, destaca suavemente o setor dele
      if (isPlacing && isMine) {
        ctx.fillStyle = col === '#38bdf8' ? 'rgba(56, 189, 248, 0.08)' : (col + '14');
        ctx.fillRect(b.x, b.y, b.width, b.height);
      }

      // Linhas de perímetro e bordas
      ctx.lineWidth = isMine ? 2 : 1.2;
      ctx.strokeStyle = isMine ? col : 'rgba(148, 163, 184, 0.35)';
      ctx.setLineDash(isMine ? [8, 6] : [6, 8]);
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.width - 1, b.height - 1);

      // Cantos táticos reforçados
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      const cornerSize = 14;
      ctx.beginPath();
      ctx.moveTo(b.x + 2, b.y + 2 + cornerSize);
      ctx.lineTo(b.x + 2, b.y + 2);
      ctx.lineTo(b.x + 2 + cornerSize, b.y + 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(b.x + b.width - 2 - cornerSize, b.y + b.height - 2);
      ctx.lineTo(b.x + b.width - 2, b.y + b.height - 2);
      ctx.lineTo(b.x + b.width - 2, b.y + b.height - 2 - cornerSize);
      ctx.stroke();

      // Plaqueta tática com o nome do setor e porcentagem
      const tagW = Math.min(180, Math.max(120, b.width - 20));
      const tagH = 18;
      const tagX = b.x + 12;
      const tagY = b.y + 10;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, tagY, tagW, tagH);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labelText = isMine
        ? `[ SEU SETOR · P${slot + 1} (${b.pct}%) ]`
        : `[ P${slot + 1} ALIADO (${b.pct}%) ]`;
      ctx.fillText(labelText, tagX + 6, tagY + tagH / 2);
    }

    ctx.restore();
  }

  root.QZ_COOP = {
    VALID_DONATION_PCTS,
    generateRoomCode,
    isValidRoomCode,
    formatRoomCode,
    getSectorColor,
    getSectorName,
    getSectorBounds,
    drawSectorLines,
    calculatePercentageDonation,
    getPointSectorOwner,
    evaluateElementalCombo
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
