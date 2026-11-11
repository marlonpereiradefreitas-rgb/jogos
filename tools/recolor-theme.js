const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const themePath = path.join(root, 'theme-v19.css');
let css = fs.readFileSync(themePath, 'utf8');

// 1. Substituir bloco :root
const rootRegex = /:root\s*\{[^}]*\}/;
const newRoot = `:root {
  /* Design Tokens — Hierarquia Cromática Oficial: Verde, Cinza e Branco */
  --ui-primary: #10B981;
  --ui-primary-hover: #34D399;
  --ui-primary-active: #059669;
  --ui-primary-glow: rgba(16, 185, 129, 0.45);

  --ui-bg-base: #121417;
  --ui-bg-surface: #1E2228;
  --ui-bg-elevated: #2A2F37;
  --ui-border: #374151;
  --ui-text-muted: #9CA3AF;

  --ui-text-primary: #FFFFFF;
  --ui-text-secondary: #F3F4F6;

  /* Aliases para compatibilidade total com o código legado */
  --bg: var(--ui-bg-base);
  --panel: var(--ui-bg-surface);
  --panel2: var(--ui-bg-elevated);
  --line: var(--ui-border);
  --text: var(--ui-text-primary);
  --dim: var(--ui-text-muted);
  --gold: var(--ui-primary);
  --green: var(--ui-primary);
  --blue: var(--ui-primary);
  --neon: var(--ui-primary);
  --warn: var(--ui-primary-hover);
  --red: #ef4444;
}`;

css = css.replace(rootRegex, newRoot);

// 2. Mapeamentos de cores hex e rgba específicas em menus/UI
const replacements = [
  // Ciano neon e azul vibrante
  [/#27c9ff/gi, 'var(--ui-primary)'],
  [/#38e8ff/gi, 'var(--ui-primary-hover)'],
  [/#0f7ea3/gi, 'var(--ui-primary-active)'],
  [/#2be3a1/gi, 'var(--ui-primary)'],
  [/#17a673/gi, 'var(--ui-primary-active)'],
  [/#7ee06a/gi, 'var(--ui-primary)'],
  [/#48f5a2/gi, 'var(--ui-primary-hover)'],
  [/#5cffb0/gi, 'var(--ui-primary-hover)'],
  [/rgba\(39,\s*201,\s*255/gi, 'rgba(16, 185, 129'],
  [/rgba\(72,\s*245,\s*162/gi, 'rgba(16, 185, 129'],
  [/rgba\(43,\s*227,\s*161/gi, 'rgba(16, 185, 129'],

  // Laranja, roxo e ouro legados em UI/botões/conquistas
  [/#ff9a2a/gi, 'var(--ui-primary)'],
  [/#d9570a/gi, 'var(--ui-primary-active)'],
  [/#ffc27a/gi, 'var(--ui-primary-hover)'],
  [/#ffb020/gi, 'var(--ui-primary)'],
  [/#ff7a1a/gi, 'var(--ui-primary-hover)'],
  [/#c24c08/gi, 'var(--ui-primary-active)'],
  [/#ffb04a/gi, 'var(--ui-primary-hover)'],
  [/#ffb347/gi, 'var(--ui-primary-hover)'],
  [/#e86010/gi, 'var(--ui-primary-active)'],
  [/#d95208/gi, 'var(--ui-primary-active)'],
  [/#ff8c24/gi, 'var(--ui-primary)'],
  [/#d9381e/gi, 'var(--ui-primary-active)'],
  [/#d98a0b/gi, 'var(--ui-primary-active)'],
  [/#ff9a3d/gi, 'var(--ui-primary-hover)'],
  [/#fff2b0/gi, '#d1fae5'],
  [/#b36b00/gi, 'var(--ui-primary-active)'],
  [/#8a5200/gi, '#065f46'],
  [/#ffd08a/gi, 'var(--ui-primary-hover)'],
  [/#ffd0a6/gi, 'var(--ui-text-secondary)'],
  [/#ffd468/gi, '#ffffff'],
  [/#ffd86b/gi, '#ffffff'],
  [/#ffe07d/gi, '#ffffff'],
  [/#ffb988/gi, '#e5e7eb'],
  [/#8a6cff/gi, 'var(--ui-primary)'],
  [/#c9b8ff/gi, 'var(--ui-primary-hover)'],
  [/#9cecd0/gi, 'var(--ui-primary-hover)'],

  // Fundos azuis/roxos/marrons legados -> Cinzas do tema
  [/#0d1424/gi, 'var(--ui-bg-surface)'],
  [/#0e1420/gi, 'var(--ui-bg-surface)'],
  [/#0e1930/gi, 'var(--ui-bg-surface)'],
  [/#0f1b33/gi, 'var(--ui-bg-surface)'],
  [/#121a2e/gi, 'var(--ui-bg-elevated)'],
  [/#131d33/gi, 'var(--ui-bg-elevated)'],
  [/#131d31/gi, 'var(--ui-bg-elevated)'],
  [/#1c1926/gi, '#182820'],
  [/#120f1d/gi, '#121f19'],
  [/#1c1a0c/gi, '#182820'],
  [/#0d0b1c/gi, 'var(--ui-bg-surface)'],
  [/#001018/gi, '#ffffff'],
  [/#1a0d12/gi, 'var(--ui-bg-base)'],
  [/#5a2030/gi, 'var(--ui-border)'],
  [/#d8ecff/gi, '#e5e7eb'],
  [/#8ab4d8/gi, '#9ca3af'],
  [/#e8f2ff/gi, '#ffffff'],
  [/#e2eefc/gi, '#f3f4f6'],
  [/#ff4a3d/gi, '#ef4444'],
  [/#ff5a4d/gi, '#ef4444'],
  [/#ff6a5e/gi, '#f87171'],
  [/#d6281c/gi, '#dc2626'],
  [/#5c1616/gi, '#374151'],
  [/#380a0a/gi, '#1E2228'],
  [/#ffd2cc/gi, '#FFFFFF'],
  [/#3a1018/gi, 'var(--ui-bg-elevated)'],
  [/#240a10/gi, 'var(--ui-bg-surface)'],
  [/#8a2a38/gi, 'var(--ui-border)'],
  [/#ffb0b8/gi, '#fca5a5'],
  [/rgba\(255,\s*140,\s*30/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*154,\s*42/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*176,\s*32/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*122,\s*26/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*150,\s*40/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*150,\s*50/gi, 'rgba(16, 185, 129'],
  [/rgba\(255,\s*130,\s*25/gi, 'rgba(16, 185, 129'],

  // Azuis escuros e grafites de fundo
  [/#07090f/gi, 'var(--ui-bg-base)'],
  [/#04060d/gi, 'var(--ui-bg-base)'],
  [/#05070c/gi, 'var(--ui-bg-base)'],
  [/#05070d/gi, 'var(--ui-bg-base)'],
  [/#080c16/gi, 'var(--ui-bg-surface)'],
  [/#0b1120/gi, 'var(--ui-bg-surface)'],
  [/#0d1220/gi, 'var(--ui-bg-surface)'],
  [/#0f1626/gi, 'var(--ui-bg-surface)'],
  [/#0f172a/gi, 'var(--ui-bg-surface)'],
  [/#0a0f1b/gi, 'var(--ui-bg-base)'],
  [/#070a12/gi, 'var(--ui-bg-base)'],
  [/#070b14/gi, 'var(--ui-bg-base)'],
  [/#070c18/gi, 'var(--ui-bg-base)'],
  [/#080d19/gi, 'var(--ui-bg-base)'],
  [/#090e1a/gi, 'var(--ui-bg-base)'],
  [/#0a1020/gi, 'var(--ui-bg-elevated)'],
  [/#0a1222/gi, 'var(--ui-bg-elevated)'],
  [/#0b1324/gi, 'var(--ui-bg-elevated)'],
  [/#0c111e/gi, 'var(--ui-bg-surface)'],
  [/#0c1426/gi, 'var(--ui-bg-elevated)'],
  [/#101828/gi, 'var(--ui-bg-surface)'],
  [/#141b2e/gi, 'var(--ui-bg-elevated)'],
  [/#18223a/gi, 'var(--ui-bg-elevated)'],
  [/#0f4a63/gi, '#133829'],
  [/#0a2f42/gi, '#0e2a1e'],
  [/#123e59/gi, '#133829'],
  [/#0c293d/gi, '#0e2a1e'],
  [/#143d59/gi, '#133829'],
  [/#0c263b/gi, '#0e2a1e'],
  [/#16365a/gi, '#1a2f26'],
  [/#0b1830/gi, '#121f1a'],
  [/#17233f/gi, '#1e3328'],
  [/#0d1527/gi, '#14221b'],
  [/#102a3a/gi, 'var(--ui-bg-elevated)'],
  [/#0b1a28/gi, 'var(--ui-bg-surface)'],
  [/#1f6a8a/gi, 'var(--ui-border)'],

  // Bordas azuis
  [/#22304d/gi, 'var(--ui-border)'],
  [/#2c3d63/gi, 'var(--ui-border)'],
  [/#1e2c4a/gi, 'var(--ui-border)'],
  [/#2b426e/gi, 'var(--ui-border)'],
  [/#223458/gi, 'var(--ui-border)'],
  [/#26385e/gi, 'var(--ui-border)'],
  [/#2c426e/gi, 'var(--ui-border)'],
  [/#354c7c/gi, 'var(--ui-border)'],

  // Cores de texto desbotadas / azuis claros para a escala cinza/branca
  [/#dfe9f5/gi, 'var(--ui-text-secondary)'],
  [/#b8cde6/gi, 'var(--ui-text-secondary)'],
  [/#b8cae0/gi, 'var(--ui-text-secondary)'],
  [/#b4c6de/gi, 'var(--ui-text-secondary)'],
  [/#9ab0cc/gi, 'var(--ui-text-muted)'],
  [/#8fa6c4/gi, 'var(--ui-text-muted)'],
  [/#93a8c4/gi, 'var(--ui-text-muted)'],
  [/#a8c0de/gi, 'var(--ui-text-secondary)'],
  [/#dbe7f7/gi, 'var(--ui-text-secondary)'],
  [/#7f90ad/gi, 'var(--ui-text-muted)'],
  [/#6f84a3/gi, 'var(--ui-text-muted)'],

  // Gradientes em botões e menus
  [/rgba\(14,\s*23,\s*42,\s*\.92\)/gi, 'rgba(30, 34, 40, .92)'],
  [/rgba\(9,\s*14,\s*26,\s*\.82\)/gi, 'rgba(18, 20, 23, .82)'],
  [/rgba\(20,\s*32,\s*58,\s*\.95\)/gi, 'rgba(30, 34, 40, .95)'],
  [/rgba\(10,\s*16,\s*30,\s*\.95\)/gi, 'rgba(18, 20, 23, .95)'],
  [/rgba\(22,\s*42,\s*74,\s*\.96\)/gi, 'rgba(42, 47, 55, .96)'],
  [/rgba\(12,\s*24,\s*44,\s*\.9\)/gi, 'rgba(30, 34, 40, .9)'],
  [/rgba\(60,\s*90,\s*140,\s*\.45\)/gi, 'rgba(55, 65, 81, .45)'],
  [/rgba\(60,\s*90,\s*140,\s*\.42\)/gi, 'rgba(55, 65, 81, .42)'],
  [/rgba\(60,\s*90,\s*140,\s*\.4\)/gi, 'rgba(55, 65, 81, .4)'],
  [/rgba\(60,\s*90,\s*140,\s*\.5\)/gi, 'rgba(55, 65, 81, .5)'],
  [/rgba\(11,\s*18,\s*34,\s*\.88\)/gi, 'rgba(30, 34, 40, .92)'],
  [/rgba\(6,\s*10,\s*20,\s*\.92\)/gi, 'rgba(18, 20, 23, .95)'],
  [/rgba\(14,\s*22,\s*40,\s*\.97\)/gi, 'rgba(30, 34, 40, .97)'],
  [/rgba\(7,\s*10,\s*18,\s*\.97\)/gi, 'rgba(18, 20, 23, .97)'],
  [/rgba\(14,\s*22,\s*40,\s*\.92\)/gi, 'rgba(30, 34, 40, .92)'],
  [/rgba\(8,\s*13,\s*24,\s*\.95\)/gi, 'rgba(18, 20, 23, .95)'],
  [/rgba\(11,\s*17,\s*32,\s*\.92\)/gi, 'rgba(30, 34, 40, .92)'],
  [/rgba\(7,\s*11,\s*20,\s*\.96\)/gi, 'rgba(18, 20, 23, .96)'],
  [/rgba\(8,\s*12,\s*22,\s*\.92\)/gi, 'rgba(30, 34, 40, .94)'],
  [/rgba\(8,\s*12,\s*22,\s*\.94\)/gi, 'rgba(30, 34, 40, .94)'],
  [/rgba\(8,\s*12,\s*22,\s*\.96\)/gi, 'rgba(30, 34, 40, .96)'],
  [/rgba\(7,\s*12,\s*22,\s*\.94\)/gi, 'rgba(18, 20, 23, .94)'],
  [/rgba\(7,\s*12,\s*22,\s*\.96\)/gi, 'rgba(18, 20, 23, .96)'],
  [/rgba\(9,\s*14,\s*27,\s*\.96\)/gi, 'rgba(30, 34, 40, .96)'],
  [/rgba\(9,\s*14,\s*27,\s*\.95\)/gi, 'rgba(30, 34, 40, .95)'],
  [/rgba\(4,\s*7,\s*14,\s*\.72\)/gi, 'rgba(18, 20, 23, .78)'],
  [/rgba\(10,\s*16,\s*30,\s*\.85\)/gi, 'rgba(30, 34, 40, .85)'],

  // HUD módulos táticos
  [/--mrgb:39,201,255/g, '--mrgb:16,185,129'],
  [/--mrgb:255,176,32/g, '--mrgb:16,185,129'],
  [/--mrgb:56,232,255/g, '--mrgb:52,211,153'],
  [/--mrgb:43,227,161/g, '--mrgb:16,185,129'],
  [/--lc:#2be3a1/g, '--lc:var(--ui-primary)'],
  [/--lc:#ffb020/g, '--lc:var(--ui-primary-hover)'],
  [/#1a0c00/gi, '#ffffff'],
  [/#1a0900/gi, '#ffffff'],
  [/#3b1800/gi, '#e5e7eb']
];

for (const [pattern, rep] of replacements) {
  css = css.replace(pattern, rep);
}

// 3. Adicionar o bloco de responsividade cirúrgica para a Tarefa 2
const mobileMediaBlock = `
/* ==========================================================================
   TAREFA 2: CORREÇÃO DE RESPONSIVIDADE NA SELEÇÃO DE MAPAS (MOBILE)
   Garante 0 clipping / overflow nos cards e miniaturas em 360x640, 390x844,
   412x915 e 768x1024 em portrait e landscape, sem alterar o Desktop.
   ========================================================================== */
@media (max-width: 768px) {
  .map-screen {
    height: 100vh !important;
    height: 100dvh !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain !important;
    padding-top: max(4px, env(safe-area-inset-top)) !important;
    padding-bottom: max(6px, env(safe-area-inset-bottom)) !important;
    padding-left: max(6px, env(safe-area-inset-left)) !important;
    padding-right: max(6px, env(safe-area-inset-right)) !important;
  }
  .map-header {
    padding: 8px 12px !important;
    gap: 8px !important;
  }
  .map-header .career-record {
    display: none !important;
  }
  .map-filter-group {
    overflow-x: auto !important;
    max-width: 100% !important;
    -webkit-overflow-scrolling: touch !important;
    padding: 2px !important;
  }
  .map-filter {
    min-height: 44px !important;
    min-width: 44px !important;
    padding: 6px 12px !important;
  }
  .map-stage-wrap {
    padding: 4px 6px !important;
    gap: 6px !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    align-items: center !important;
  }
  .map-page-arrow {
    flex: 0 0 44px !important;
    width: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    height: 120px !important;
    border-radius: 10px !important;
  }
  .map-page-arrow .arrow-glyph {
    font-size: 28px !important;
  }
  .map-page-arrow small {
    display: none !important;
  }
  .map-screen .map-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-template-rows: auto !important;
    gap: 8px !important;
    padding: 4px !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .map-screen .map-card {
    min-height: 44px !important;
    min-width: 44px !important;
    padding-bottom: 6px !important;
  }
  .map-screen .map-thumb {
    min-height: 0 !important;
    height: auto !important;
    aspect-ratio: 16 / 9 !important;
    flex: 1 1 auto !important;
  }
  .map-thumb-img {
    object-fit: contain !important;
    background-color: var(--ui-bg-base) !important;
  }
  .map-bar {
    padding: 8px 12px !important;
    gap: 8px !important;
  }
  .map-bar .start-options {
    width: 100% !important;
    flex-direction: column !important;
    gap: 6px !important;
  }
  .map-bar .start-options label {
    min-width: 0 !important;
    width: 100% !important;
  }
  .map-bar .start-options select {
    min-height: 44px !important;
    width: 100% !important;
  }
  .map-bar .map-nav {
    width: 100% !important;
  }
  #btnPlay {
    width: 100% !important;
    min-height: 48px !important;
    text-align: center !important;
    justify-content: center !important;
  }
}

@media (max-width: 420px) {
  .map-screen .map-cards {
    grid-template-columns: 1fr !important;
  }
}

@media (max-height: 500px) and (orientation: landscape) {
  .map-screen {
    height: 100vh !important;
    height: 100dvh !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: max(2px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(2px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left)) !important;
  }
  .map-header {
    padding: 4px 10px !important;
    min-height: 36px !important;
  }
  .map-title-block h1 {
    font-size: 16px !important;
  }
  .map-header .career-record {
    display: none !important;
  }
  .map-stage-wrap {
    padding: 2px 6px !important;
    gap: 6px !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
  .map-page-arrow {
    flex: 0 0 44px !important;
    width: 44px !important;
    height: 100% !important;
    min-height: 44px !important;
  }
  .map-page-arrow .arrow-glyph {
    font-size: 24px !important;
  }
  .map-page-arrow small {
    display: none !important;
  }
  .map-screen .map-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
    gap: 4px !important;
    padding: 2px !important;
    min-height: 0 !important;
  }
  .map-screen .map-card {
    padding-bottom: 2px !important;
    min-height: 44px !important;
  }
  .map-screen .map-card b {
    font-size: 10px !important;
    margin-top: 2px !important;
    padding: 0 6px !important;
  }
  .map-screen .map-card small {
    display: none !important;
  }
  .map-screen .map-thumb {
    min-height: 0 !important;
    height: auto !important;
    aspect-ratio: 16 / 9 !important;
  }
  .map-thumb-img {
    object-fit: contain !important;
  }
  .map-pagination-bar {
    padding: 2px 8px !important;
    gap: 8px !important;
    font-size: 10px !important;
  }
  .map-bar {
    padding: 3px 10px !important;
    gap: 6px !important;
    min-height: 40px !important;
  }
  .map-bar .start-options {
    gap: 8px !important;
  }
  .map-bar .start-options label {
    min-width: 140px !important;
    font-size: 9px !important;
  }
  .map-bar .start-options select {
    padding: 4px 6px !important;
    font-size: 11px !important;
    min-height: 32px !important;
  }
  #btnPlay {
    padding: 6px 16px !important;
    font-size: 12px !important;
    min-height: 36px !important;
  }
}
`;

if (!css.includes('TAREFA 2: CORREÇÃO DE RESPONSIVIDADE')) {
  css += '\n' + mobileMediaBlock;
}

fs.writeFileSync(themePath, css, 'utf8');
console.log('theme-v19.css atualizado com sucesso com Design Tokens e Responsividade Mobile!');
