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
   * Verifica se uma coordenada (x, y) pertence ao setor do jogador no modo Setores Divididos
   */
  function getPointSectorOwner(x, y, mapW, mapH, playerCount, divisionMode) {
    if (divisionMode === 'free' || !playerCount || playerCount <= 1) return 0;
    const w = mapW || 960;
    const h = mapH || 640;
    if (playerCount === 2) {
      return x < w * 0.5 ? 0 : 1;
    }
    if (playerCount === 3) {
      if (x < w / 3) return 0;
      if (x < (w * 2) / 3) return 1;
      return 2;
    }
    // 4 jogadores: quadrantes (0: sup-esq, 1: sup-dir, 2: inf-esq, 3: inf-dir)
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
      return 'Zona Livre (Toda a Extensão)';
    }
    const p = (slot | 0) + 1;
    if (playerCount === 2) {
      return slot === 0 ? `Setor Alfa · Oeste (P1)` : `Setor Bravo · Leste (P2)`;
    }
    if (playerCount === 3) {
      const names = ['Flanco Oeste (P1)', 'Setor Central (P2)', 'Flanco Leste (P3)'];
      return names[slot] || `Setor P${p}`;
    }
    const qNames = ['Quadrante Noroeste (P1)', 'Quadrante Nordeste (P2)', 'Quadrante Sudoeste (P3)', 'Quadrante Sudeste (P4)'];
    return qNames[slot] || `Quadrante P${p}`;
  }

  /**
   * Renderiza os limites táticos de setores no canvas durante a batalha
   */
  function drawSectorLines(ctx, w, h, playerCount, divisionMode, localSlot) {
    if (divisionMode === 'free' || !playerCount || playerCount <= 1) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);

    if (playerCount === 2) {
      const midX = w * 0.5;
      // Linha vertical divisória
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();

      // Indicadores de setor nas bordas superiores
      ctx.setLineDash([]);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = localSlot === 0 ? 'rgba(56, 189, 248, 0.75)' : 'rgba(148, 163, 184, 0.45)';
      ctx.fillText('[ SETOR P1 · VOCÊ ]', midX * 0.5, 20);
      ctx.fillStyle = localSlot === 1 ? 'rgba(74, 222, 128, 0.75)' : 'rgba(148, 163, 184, 0.45)';
      ctx.fillText('[ SETOR P2 · ALIADO ]', midX * 1.5, 20);
    } else if (playerCount === 3) {
      const x1 = w / 3, x2 = (w * 2) / 3;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x1, 0); ctx.lineTo(x1, h);
      ctx.moveTo(x2, 0); ctx.lineTo(x2, h);
      ctx.stroke();
    } else if (playerCount === 4) {
      const midX = w * 0.5, midY = h * 0.5;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(midX, 0); ctx.lineTo(midX, h);
      ctx.moveTo(0, midY); ctx.lineTo(w, midY);
      ctx.stroke();
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
    drawSectorLines,
    calculatePercentageDonation,
    getPointSectorOwner,
    evaluateElementalCombo
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
