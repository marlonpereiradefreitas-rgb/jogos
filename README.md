# Quarentena Z

Tower defense de zumbis em HTML5/JS, com versão para PC (Electron), Web/PWA e servidor opcional para ranking e saves em nuvem.

> **Status:** em preparação. Ainda não há releases, capturas de tela nem link do GitHub Pages publicados.

## Recursos
- 22 torres com 3 caminhos de upgrade e 5 níveis cada
- Vários mapas e dificuldades, conquistas e ranking
- PWA instalável (`manifest.webmanifest` e `sw.js`)
- Empacotamento para Windows com Electron

## Lore
Vale Cinzento foi isolada pela Corporação Aurora quando a Febre Pálida escapou dos seus laboratórios. Você comanda o último perímetro. A história completa está em [LORE.md](LORE.md).

## Como rodar
```bash
npm install
npm run web      # servidor em http://localhost:8080
npm start        # versão desktop (Electron)
npm run dist     # build para Windows
```
Antes de rodar o servidor, copie `.env.example` para `.env` e defina `QZ_SECRET` (`openssl rand -hex 32`).

## Testes
`node tools/test-backend.js` e `node tools/test-upgrades.js game.js`.

## Segurança e mudanças
Veja [SECURITY.md](SECURITY.md) e [CHANGELOG.md](CHANGELOG.md).

## Créditos e licença
Veja `CREDITS.txt`. A licença ainda não foi definida.