# Guia técnico: do jogo single-player ao multiplayer

## O que já está pronto (v19)
- **Simulação determinística**: tudo que afeta o resultado usa `srand()` (RNG com semente); efeitos visuais usam `Math.random()` e não entram na simulação.
- **Tudo é comando**: construir, melhorar, vender, Paragon, habilidade, prioridade, enviar onda e envio automático passam por `dispatch({type,...})` e ficam em `CMDLOG` com o `tick`.
- **`stateHash()`**: resumo do estado para comparar cliente e servidor (detecta divergência/trapaça).
- **Servidor headless viável**: `tools/harness.js` roda o `game.js` sem navegador (DOM simulado). Base para o servidor.
- **Replay**: semente + `CMDLOG` reproduz a partida inteira. Servem para desafio diário, ranking verificável e anti-trapaça.
- **Prova automática**: `node tools/determinism-test.js ./game.js` (replay idêntico mesmo com render intercalado e `Math.random` alterado).

## Arquitetura recomendada
Servidor **autoritativo** (Node.js + WebSocket): o servidor roda a simulação a 50 ticks/s; o cliente só envia comandos e desenha o estado recebido.
1. Cliente envia `{type:'place', key, x, y}`; o servidor valida (dinheiro, posição, cooldown, limite de taxa) e aplica no próximo tick.
2. Servidor envia snapshots periódicos (ou diferenças) com torres, zumbis, vida, dinheiro; o cliente interpola.
3. Tower defense tolera latência bem: não precisa de predição complexa.
Por que não "lockstep" entre clientes: `Math.sin/cos` podem diferir entre navegadores; com servidor autoritativo o problema não existe.

## Modos sugeridos
- **Co-op 2 a 4 jogadores** na mesma base (economia compartilhada ou individual).
- **Duelo**: cada um defende seu mapa e envia hordas ao rival.
- **Desafio diário**: semente do dia igual para todos + ranking.

## Backend
Contas (ticket da Steam ou OAuth), perfil, ranking, replays (semente + comandos), conquistas validadas no servidor, lobbies (Redis), banco (PostgreSQL).

## Trabalho ainda necessário (honesto)
1. **Modularizar** o `game.js` (~2.000 linhas): separar simulação / render / interface. Hoje a simulação ainda chama som, partículas e `toast` diretamente.
2. **Estado por jogador**: `G.money`, `G.life` e a seleção são globais; é preciso `players[]` com dono em cada torre e cada comando.
3. **Remover o código de administrador** (`ZOMBIE-ADM-2026`) e o botão de invocar zumbis.
4. **Validação no servidor** de todos os comandos (hoje a interface valida e a simulação confia).
5. Protocolo de rede, reconexão e tratamento de lag.
6. Testes de carga e de segurança.

## Fases sugeridas
F1 modularizar → F2 servidor headless + cliente espectador → F3 co-op 2 jogadores → F4 contas, ranking e desafio diário → F5 duelo.
