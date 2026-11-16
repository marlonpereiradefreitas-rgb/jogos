// =========================================================
// QUARENTENA Z - OBJECT POOLING MODULE (BTD6 PERFORMANCE)
// Reutilização de memória para projéteis, minas, aliados,
// partículas, anéis de choque e zumbis (Zero GC Stutter).
// =========================================================
(function (root) {
  'use strict';

  function createPool(maxSize, resetFn) {
    const stack = [];
    let hits = 0;
    let misses = 0;
    return {
      acquire(props) {
        let obj;
        if (stack.length > 0) {
          obj = stack.pop();
          hits++;
        } else {
          obj = {};
          misses++;
        }
        if (resetFn) resetFn(obj);
        if (props) Object.assign(obj, props);
        return obj;
      },
      release(obj) {
        if (!obj) return;
        if (stack.length < maxSize) {
          stack.push(obj);
        }
      },
      releaseAll(arr) {
        if (!Array.isArray(arr)) return;
        while (arr.length > 0) {
          const item = arr.pop();
          if (item && stack.length < maxSize) stack.push(item);
        }
      },
      stats() {
        return { pooled: stack.length, maxSize, hits, misses };
      }
    };
  }

  const QZ_POOL = {
    createPool,
    proj: createPool(600, (o) => {
      o.x = 0; o.y = 0; o.vx = 0; o.vy = 0; o.dmg = 0;
      o.splash = 0; o.pierce = 0; o.life = 0; o.crit = false;
      o.flame = false; o.slow = 0; o.slowT = 0; o.freeze = 0;
      o.poison = 0; o.poisonT = 0; o.burn = 0; o.burnT = 0;
      o.stun = 0; o.armorBreak = 0; o.knockback = 0;
      o.instakill = 0; o.execute = 0; o.cluster = 0;
      o.homing = false; o.ricochet = 0; o.emp = false;
      o.rad = false; o.acid = false; o.psionic = false;
      o.sonic = false; o.confuse = 0; o.ownerId = 0;
      o.hitSet = null;
    }),
    mine: createPool(300, (o) => {
      o.x = 0; o.y = 0; o.dmg = 0; o.splash = 56;
      o.stun = 0.65; o.stacks = 1; o.maxStacks = 5;
      o.life = 35; o.maxLife = 35; o.armT = 0.15;
      o.color = '#fbbf24'; o.ownerId = 0; o.burn = 0; o.burnT = 0;
      o.emp = false; o.armorBreak = 0;
    }),
    ally: createPool(120, (o) => {
      o.x = 0; o.y = 0; o.hp = 100; o.maxHp = 100;
      o.dmg = 20; o.speed = 65; o.range = 28;
      o.atkCd = 0; o.atkRate = 0.65; o.life = 18;
      o.kind = 'trooper'; o.isDino = false; o.ownerId = 0;
      o.stun = 0; o.bleed = 0; o.color = '#4ade80';
      o.pathIdx = 0; o.dir = 1; o.recoil = 0;
    }),
    particle: createPool(800, (o) => {
      o.x = 0; o.y = 0; o.vx = 0; o.vy = 0;
      o.life = 0.3; o.max = 0.3; o.size = 2;
      o.color = '#ffffff'; o.grav = 0;
    }),
    ring: createPool(200, (o) => {
      o.x = 0; o.y = 0; o.r = 4; o.maxR = 40;
      o.life = 0.25; o.max = 0.25; o.color = '#fbbf24';
    })
  };

  root.QZ_POOL = QZ_POOL;
})(typeof globalThis !== 'undefined' ? globalThis : window);
