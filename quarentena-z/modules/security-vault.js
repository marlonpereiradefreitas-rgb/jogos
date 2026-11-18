// ============================================================================
// QUARENTENA Z — APPSEC, ANTI-CHEAT VAULT & LOCAL INTEGRITY MODULE
// - Isolamento Anti-Cheat em escopo léxico fechado (moedas, vida, multiplicadores)
// - Validação por Hash e Assinatura Digital para salvamentos locais (localStorage)
// - Proteção Anti-XSS (sanitização estrita e atribuição segura de texto no DOM)
// ============================================================================
(function (root) {
  'use strict';

  const DOMAIN_SALT = 'QZ_V19_APPSEC_DIGITAL_SIG_2026_#9F4A7C';
  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;'
  };

  // --- 1. PROTEÇÃO ANTI-XSS E ATRIBUIÇÃO SEGURA DE TEXTO ---
  function escHtml(raw) {
    return String(raw === null || raw === undefined ? '' : raw).replace(/[&<>"'`/]/g, (c) => HTML_ENTITIES[c] || c);
  }

  function sanitizeText(raw, maxLen) {
    const limit = Number.isFinite(maxLen) && maxLen > 0 ? maxLen : 32;
    return String(raw === null || raw === undefined ? '' : raw)
      .replace(/[\u0000-\u001F\u007F<>'"`\\]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:text\/html/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .slice(0, limit);
  }

  function setSafeText(el, text) {
    if (!el) return;
    el.textContent = String(text === null || text === undefined ? '' : text);
  }

  // --- 2. ASSINATURA DIGITAL E HASH DE INTEGRIDADE LOCAL (64-BIT DUAL MAC) ---
  function canonicalize(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'string') return JSON.stringify(val);
    if (Array.isArray(val)) {
      return '[' + val.map(canonicalize).join(',') + ']';
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val).filter((k) => k !== '_sig' && k !== 'dirty').sort();
      const parts = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (typeof val[k] === 'function' || val[k] === undefined) continue;
        parts.push(JSON.stringify(k) + ':' + canonicalize(val[k]));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  }

  function computeDigitalSignature(namespace, data) {
    const rawStr = typeof data === 'string' ? data : canonicalize(data);
    const msg = `${DOMAIN_SALT}|${namespace}|${rawStr}|${DOMAIN_SALT.length}`;
    let h1 = 0x811c9dc5 >>> 0;
    let h2 = 0x1505 >>> 0;
    let h3 = 0x9e3779b9 >>> 0;
    for (let i = 0; i < msg.length; i++) {
      const c = msg.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = ((Math.imul(h2, 33) >>> 0) ^ c) >>> 0;
      h3 = (Math.imul(h3 ^ c, 0x85ebca6b) >>> 0);
      h3 = ((h3 << 13) | (h3 >>> 19)) >>> 0;
    }
    return (
      'qzsig_' +
      h1.toString(16).padStart(8, '0') +
      h2.toString(16).padStart(8, '0') +
      h3.toString(16).padStart(8, '0')
    );
  }

  function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function verifyDigitalSignature(namespace, data, signature) {
    if (!signature || typeof signature !== 'string') return false;
    const expected = computeDigitalSignature(namespace, data);
    return constantTimeEqual(signature, expected);
  }

  // --- 3. COFRE DE ISOLAMENTO ANTI-CHEAT EM ESCOPO FECHADO ---
  function createAntiCheatVault() {
    let k1 = ((Math.random() * 0x7fffffff) | 0) ^ 0x5a3c9e17;
    let k2 = ((Math.random() * 0x7fffffff) | 0) ^ 0x3c6ef372;
    if (k1 === 0) k1 = 0x5a3c9e17;
    if (k2 === 0) k2 = 0x3c6ef372;

    let encMoney = 0 ^ k1;
    let encLife = 0 ^ k2;
    let encWave = 0 ^ k1;
    let encKills = 0 ^ k2;
    let encDmgMult = 1000 ^ k1; // 1.000x em ponto fixo
    let stateSeal = 0;
    let active = false;
    let tamperEvents = 0;

    function computeSeal(m, l, w, k, dm) {
      let h = 0x811c9dc5 >>> 0;
      const mix = (v) => {
        h ^= (v | 0);
        h = Math.imul(h, 0x01000193) >>> 0;
      };
      mix(m);
      mix(l);
      mix(w);
      mix(k);
      mix(dm);
      mix(k1);
      return h >>> 0;
    }

    return Object.freeze({
      sync(money, life, wave, kills, dmgMult) {
        const m = Math.floor(Number(money) || 0) | 0;
        const l = Math.floor(Number(life) || 0) | 0;
        const w = Math.floor(Number(wave) || 0) | 0;
        const k = Math.floor(Number(kills) || 0) | 0;
        const dm = Math.round((Number(dmgMult) || 1) * 1000) | 0;
        encMoney = m ^ k1;
        encLife = l ^ k2;
        encWave = w ^ k1;
        encKills = k ^ k2;
        encDmgMult = dm ^ k1;
        stateSeal = computeSeal(m, l, w, k, dm);
        active = true;
      },
      verifyAndRestore(G, WM) {
        if (!active || !G || !WM) return { ok: true, tampered: false };
        const expM = encMoney ^ k1;
        const expL = encLife ^ k2;
        const expW = encWave ^ k1;
        const expK = encKills ^ k2;
        const expDm = encDmgMult ^ k1;
        const expectedSeal = computeSeal(expM, expL, expW, expK, expDm);

        let tampered = false;
        if (stateSeal !== expectedSeal) {
          tampered = true;
        }
        const curM = Math.floor(Number(G.money) || 0) | 0;
        const curL = Math.floor(Number(G.life) || 0) | 0;
        const curW = Math.floor(Number(WM.num) || 0) | 0;
        const curK = Math.floor(Number(G.kills) || 0) | 0;

        if (curM !== expM) { G.money = expM; tampered = true; }
        if (curL !== expL) { G.life = expL; tampered = true; }
        if (curW !== expW) { WM.num = expW; tampered = true; }
        if (curK !== expK) { G.kills = expK; tampered = true; }

        if (tampered) {
          tamperEvents++;
          this.sync(G.money, G.life, WM.num, G.kills, expDm / 1000);
        }
        return { ok: !tampered, tampered, tamperEvents };
      },
      readSnapshot() {
        return {
          money: encMoney ^ k1,
          life: encLife ^ k2,
          wave: encWave ^ k1,
          kills: encKills ^ k2,
          dmgMult: (encDmgMult ^ k1) / 1000,
          tamperEvents
        };
      },
      getTamperCount() {
        return tamperEvents;
      },
      recordTamper() {
        tamperEvents++;
        return tamperEvents;
      }
    });
  }

  const QZ_SECURITY = Object.freeze({
    escHtml,
    sanitizeText,
    setSafeText,
    canonicalize,
    computeDigitalSignature,
    verifyDigitalSignature,
    constantTimeEqual,
    createAntiCheatVault
  });

  root.QZ_SECURITY = QZ_SECURITY;
})(typeof globalThis !== 'undefined' ? globalThis : window);
