# Changelog

## [v1.0.1] — 2026-11-11

### Interface & Experiência do Usuário (UI/UX)
- **Tela Personalizada de Instalação (`#installModal`)**: acessível no Menu Inicial (`📲 INSTALAR JOGO`), detecta automaticamente PC/Windows, Android (PWA 1 clique via `beforeinstallprompt`) ou iOS/Safari (guia passo-a-passo) e inclui link direto para o instalador `.exe` no GitHub Releases.
- **Tela Personalizada para Voltar ao Home (`#homeConfirmModal`)**: ao clicar em `⌂ HOME` durante a partida ou nas configurações em jogo, exibe alerta tático com resumo ao vivo da operação (**Onda**, **Vida da Base**, **Torres** ativas e **Abates**) antes de evacuar para o menu inicial.
- **Menu Inicial em Paisagem Mobile (`844x390`)**: reorganizado em layout tático de 2 colunas para que todos os botões (`CONTINUAR`, `JOGAR`, `RANKING`, `CONQUISTAS`, `CONFIGURAÇÕES`, `INSTALAR JOGO`) fiquem 100% visíveis acima da dobra sem rolagem.
- **Correção de Overflow Horizontal em Partida Mobile (`844x390`)**: ajustado `#app`, `#bottombar` e `#progress` (`min-width: 0; max-width: 100vw`) para eliminar o esticamento de ~1007px e garantir que `⚙ Configurações`, `⌂ HOME` e `Reiniciar` permaneçam totalmente visíveis dentro da tela (`right <= 836px`).

### Torres & Efeitos Visuais
- **Anel temático por classe**: aro elíptico sutil na cor temática de cada torre sob a base para distinção imediata em telas pequenas (celular).
- **Indicadores de evolução (níveis 1–5)**: pontos luminosos coloridos por tier abaixo da torre.
- **Visual de Ascensão (Paragon)**: anel dourado pulsante + aro tracejado giratório + 2 orbes dourados orbitais com núcleo branco brilhante.
- **Projéteis aprimorados**: núcleo branco de energia em projéteis diretos, ponta incandescente em mísseis/shells e halo neon em globs tóxicos.

### Balanceamento (valores centralizados em `BALANCE`, em `game.js`)
Método: DPS base × cadência dividido pelo custo (alvo único) e revisão da auditoria de ascensões.

| Torre | Atributo | Antes | Depois | Variação | Motivo |
|---|---|---|---|---|---|
| Canhão Antitanque | custo | 620 | 660 | +6,5% | Melhor DPS/custo do jogo (0,197); concorria com todas as outras |
| Guarda de Escopeta | dano | 15 | 16,5 | +10% | DPS/custo baixo (0,081) para uma torre de alcance curto |
| Torre Elétrica | dano | 22 | 24 | +9% | DPS/custo baixo (0,067) mesmo com cadeia de 3 alvos |
| Canhão Eletromagnético | custo | 880 | 940 | +6,8% | Maior DPS/custo pós-upgrade no endgame (0,61/moeda no caminho 1) |
| Torre de Estase | custo | 480 | 450 | -6,2% | Suporte criogênico caro para entrada em partidas iniciais |

### Segurança
- Removido o último `<script>` inline de `index.html` (registro do Service Worker movido para `game.js`) e removido `'unsafe-inline'` de `script-src` na meta CSP do cliente: **0 erros de CSP e 0 erros de console** no navegador.
- `.env.example` limpo (`QZ_SECRET` vazio) e `data/.server_secret` / `data/db.json` removidos do histórico do git.
- `server.js` atualizado com `Cache-Control: no-cache, must-revalidate` para `.html`, `.js`, `.css` e `/sw.js`, evitando servir código antigo após atualizações.
- Versionamento `?v=19.16` nos assets estáticos e `CACHE_VERSION = 'quarentena-z-v19-16'` no `sw.js`.

### Mobile, Performance & Métricas (Antes → Depois)
- **Object Pooling**: partículas (`_partPool`) e anéis de impacto (`_ringPool`) reaproveitados sem realocação contínua durante hordas grandes.
- **Culling de renderização**: partículas e projéteis fora da área visível (`VIEW`) são ignorados antes do desenho.
- **Opção de Economia de Bateria**: seletor de limite de FPS (`60 FPS` vs `30 FPS`) nas Configurações, persistido em `localStorage`.
- **Ciclo de vida mobile**: salvamento automático em `visibilitychange` (hidden) e `pagehide`, Wake Lock durante partidas, bloqueio de `gesturestart`, menu de contexto no canvas e pull-to-refresh (`overscroll-behavior: none`).

| Métrica | Antes | Depois | Como foi medido |
|---|---|---|---|
| Botões em partida mobile (`844x390`) | 26px–28px de altura; `HOME` fora da tela (`right = 1007px`) | **44px** em todos os botões; `HOME` em `right = 836px` (`<= 844px`) | Medição real via `getBoundingClientRect()` no navegador em `844x390` |
| Menu mobile (`844x390`) | Botões a partir de `y = 568px` (exigia scroll) | Todos os 6 botões visíveis acima da dobra (`y <= 389.7px`, `50px` de altura) | Medição real no navegador em `844x390` |
| Erros de console / CSP no navegador | 1 erro de CSP (`inline script` bloqueado) | **0 erros** de console / CSP | Verificação no navegador em `http://localhost:8080` |
| Simulação sob estresse extremo (40 torres, pico 2237 zumbis) | — | **2,76 ms** média/step (pior step **13,7 ms**, abaixo dos 16,6 ms de 60 FPS) | `node tools/stress-logic.js game.js` |
| Tamanho do shell PWA (sem gzip) | — | **423,1 KB** (HTML + JS + CSS + manifest + SW + ícone SVG) | Soma dos arquivos estáticos do shell PWA |
| Instalador Windows (GitHub Release) | — | **76,9 MB** (Setup) / **76,7 MB** (Portátil) | Build `electron-builder` publicado em Releases |

### Auditoria numérica das ascensões (referência)
| Torre / caminho | Custo total | DPS aprox. | DPS por moeda | Observação |
|---|---|---|---|---|
| Canhão Antitanque / 1 | 5420 | 2941 | 0,54 | Muito acima das demais torres de dano (0,1 a 0,3); custo base ajustado (+6,5%) |
| Canhão Eletromagnético / 1 | 6950 | 4248 | 0,61 | Maior DPS/custo pós-upgrade; custo base ajustado (+6,8%) |
| Boomerangue / 3 | 2610 | 1170 | 0,45 | Acima da média (alcance médio, trajetória curva) |

### Licença
- Licença MIT (`LICENSE`).

## [v1.0.2] — 2026-11-11

### Balanceamento das Ascensões (`ASCENSION_BALANCE` em `game.js`)
- **Correção de bug crítico em `recalc()`**: habilidades de suporte (`medstation`/`beacon`) que chamam `recalc()` apagavam os bônus de torres Ascendidas. Agora `applyParagonStats(t)` roda dentro de `recalc()`, preservando 100% da Ascensão.
- **Escala para classes negligenciadas**: dano contínuo (`burnDps`/`poisonDps` × 1,85–2,20), raio de explosão (`splash` × 1,15–1,18), auras de suporte (`auraDmg`/`auraRate`/`auraRange`/`vuln` × 1,35–1,40), renda da Base de Suprimentos (`income` × 2,30) e cura da base (+1/onda).

| Torre / Grupo | Atributo | Antes | Depois | Motivo |
|---|---|---|---|---|
| Padrão (demais torres) | dmg / rate / bigMult | ×3,2 / ×1,7 / ×2,0 | ×2,85 / ×1,55 / ×1,70 | Reduz salto extremo mantendo superioridade clara sobre 3 torres T5 |
| Canhão Antitanque | custo / dmg / rate / bigMult | 4200 / ×3,2 / ×1,7 / ×2,0 | **4700** / ×2,55 / ×1,48 / ×1,50 | Evita que anule todas as demais contra chefes |
| Canhão Eletromagnético | custo / dmg / rate / bigMult | 4900 / ×3,2 / ×1,7 / ×2,0 | **5500** / ×2,50 / ×1,45 / ×1,50 | Maior DPS/custo do jogo no endgame |
| Boomerangue | custo / dmg / rate / bigMult | 3400 / ×3,2 / ×1,7 / ×2,0 | **3600** / ×2,65 / ×1,50 / ×1,60 | DPS acima da média em grupo |
| Lança-Chamas / Veneno / Ácido | custo / DoT | 3300–3800 / ×1,0 DoT | **3000–3600** / ×2,0–2,2 DoT | Ascensão não escalava queimadura nem veneno |
| Atirador / Arqueiro / Escopeta | custo | 3000 / 3100 / 3200 | **2800 / 2900 / 3000** | Tornar ascensões iniciais viáveis antes das ondas finais |
| Gelo / Elétrica / Estase / Suprimentos | custo / utilidade | 3300–3700 / sem escala | **3000–3500** / aura e renda ×1,4–2,3 | Compensar custo alto de 3× T5 em torres de suporte/controle |

## [v1.0.3] — 2026-11-11

### Correção de Seleção de Mapas no Mobile (CSS `v19.19`)
- Corrigida regra em `theme-v19.css` onde `.map-screen .map-card { display: flex !important }` dentro da media query paisagem sobrescrevia `.map-card.hidden-page` e exibia todos os 18 mapas esmagados ao mesmo tempo em 6 linhas. Agora `.map-screen .map-card.hidden-filter, .map-screen .map-card.hidden-page { display: none !important }` garante 6 mapas por página com altura proporcional.
- Alterado `.map-thumb-img` em paisagem mobile para `object-fit: contain !important`, exibindo 100% da área de cada mapa sem cortar bordas.
- Ajustado `.map-bar` e `#btnPlay { width: auto !important }` em paisagem estreita (`667x375` e `844x390`) para manter seletores de dificuldade e o botão `INICIAR OPERAÇÃO ▶` lado a lado sem empurrar nem cortar a grade de mapas.

## [v1.0.4] — 2026-11-12

### Paginação Responsiva dos Mapas no Mobile (`v19.20`)
- Substituído `MAPS_PER_PAGE = 6` fixo pela função `getMapsPerPage()` em `game.js`:
  - **Mobile paisagem** (`IS_MOBILE` ou altura `<= 540px`): **3 mapas grandes por página** (1 linha × 3 colunas em 6 páginas para os 18 mapas), dobrando a altura útil de cada card e exibindo miniatura inteira (`object-fit: contain`), título e descrição sem cortar nada.
  - **Mobile retrato / tablet estreito** (`<= 768px`): **4 mapas por página** (2×2 em 5 páginas).
  - **Desktop**: mantém **6 mapas por página** (3×2 em 3 páginas).
- Removido `backgroundImage: url(...)` com `backgroundSize: cover` atrás de `.map-thumb-img` para não vazar borda cortada atrás da miniatura `contain`.
- Recalcula a paginação automaticamente em `resize`, `orientationchange` e troca de modo de plataforma.
