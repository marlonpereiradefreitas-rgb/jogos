Ferramentas de teste (precisam de Node.js; não precisam de navegador):
  node tools/determinism-test.js ./game.js   prova de determinismo / replay
  node tools/test-upgrades.js ./game.js      270 upgrades das 18 torres
  node tools/test-maps.js ./game.js          11 mapas: caminho, espaço e 25 ondas
  node tools/test-features.js ./game.js      faixa de onda, conquistas, estrelas
  node tools/stress-render.js ./game.js 450  chamadas de desenho por quadro com 450 zumbis
  node tools/stress-logic.js ./game.js       custo da lógica com milhares de zumbis
  node tools/test-browser.js URL             teste de ponta a ponta em navegador real (precisa do Playwright):
                                             telas, conquistas, HUD, construir, salvar/recarregar/continuar, derrota.
                                             Ex.: node tools/test-browser.js http://localhost:8123/index.html
Observação: os testes simulados chamam update(1/60), o mesmo passo fixo do jogo.
