# Changelog

## [Não publicado]

### Balanceamento (valores em `BALANCE`, em `game.js`)
Método: DPS base x cadência dividido pelo custo (alvo único, sem efeitos de área ou status). **Não houve partida completa de validação**; os ajustes são conservadores e devem ser conferidos em jogo.

| Torre | Atributo | Antes | Depois | Variação | Motivo |
|---|---|---|---|---|---|
| Canhão Antitanque | custo | 620 | 660 | +6,5% | Melhor DPS/custo do jogo (0,197); concorria com todas as outras |
| Guarda de Escopeta | dano | 15 | 16,5 | +10% | DPS/custo baixo (0,081) para uma torre de alcance curto |
| Torre Elétrica | dano | 22 | 24 | +9% | DPS/custo baixo (0,067) mesmo com cadeia de 3 alvos |

Ascensões e upgrades: **não alterados**. A auditoria numérica das ascensões ainda não foi feita (ver `UPGRADES-TABELA.md`).

### Segurança
- `.env.example` não contém mais um `QZ_SECRET` preenchido.
- `data/.server_secret` removido do disco (será regenerado). Ainda precisa sair do índice e do histórico do git.
### Mobile (alterações de código; **ainda não testadas em aparelho ou emulador**)
- Salvamento automático (`saveGame` e `psSave`) ao ir para segundo plano (`visibilitychange`) e em `pagehide`, além do `beforeunload` que já existia.
- Wake Lock: a tela não apaga durante a partida, onde o navegador suporta. É liberado em segundo plano.
- Bloqueio de zoom por gesto (`gesturestart`), menu de contexto no canvas e pull-to-refresh (`overscroll-behavior:none`); remoção do realce de toque.
- Já existiam: pausa ao esconder a aba, safe-area, `viewport-fit=cover`, `touch-action`, modo desempenho automático, service worker e manifest.
- Sem métricas antes/depois: ainda não medi FPS, memória, tempo de carregamento nem tamanho do pacote.
