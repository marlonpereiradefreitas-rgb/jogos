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

### Auditoria numérica das ascensões (sem alterações aplicadas)
Método: dano x cadência (com bônus de perfuração) do caminho completo (5 níveis) dividido pelo custo total gasto. **Métrica simplificada**: ignora armadura, área, status e alcance global.

| Torre / caminho | Custo total | DPS aprox. | DPS por moeda | Observação |
|---|---|---|---|---|
| Canhão Antitanque / 1 | 5420 | 2941 | 0,54 | Muito acima das demais torres de dano (0,1 a 0,3); candidato a ser forte demais |
| Canhão Eletromagnético / 1 | 6950 | 4248 | 0,61 | Idem; é a maior diferença da tabela |
| Boomerangue / 3 | 2610 | 1170 | 0,45 | Acima da média |
| Veneno, Gelo, Estase / todos | 2200 a 3800 | 9 a 36 | menos de 0,02 | Controle e dano contínuo: a métrica não captura o valor real |
| Base de Suprimentos / todos | 3560 | 0 | 0 | Suporte puro; valor depende de efeitos não medidos |

Conclusão: as diferenças são grandes demais para o limite de 5 a 15% e a métrica é imprecisa. **Nenhuma ascensão foi alterada.** Antes de qualquer ajuste, valide em partidas reais (ondas 30+), principalmente os dois canhões do caminho 1.

### Visual das torres (pequeno, sem impacto relevante de desempenho)
- Pontos de nível sob cada torre (1 a 5), para ler a evolução em telas pequenas.
- Ascensão: anel dourado pulsante e aro tracejado giratório.
- Já existiam: brilho por nível, sprites por torre, recuo e clarão de disparo.
- Não houve redesign completo das torres, dos inimigos, do HUD nem dos menus. Isso exige validação visual em navegador.

### Licença
- Adicionada a licença MIT (`LICENSE`), em nome de "Quarentena Z Studio". Troque se preferir outra.
