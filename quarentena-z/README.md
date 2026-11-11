![Quarentena Z](docs/images/banner.jpg)

# Quarentena Z

Tower defense de zumbis em HTML5/JS, com versÃ£o para PC (Electron), Web/PWA e servidor opcional para ranking e saves em nuvem.

## Jogar / Baixar

- **Navegador (PC e celular, instalável como PWA):** https://marlonpereiradefreitas-rgb.github.io/jogos/
- **Windows (instalador e portátil):** https://github.com/marlonpereiradefreitas-rgb/jogos/releases/latest
- **Android:** use o PWA acima (menu do navegador > Instalar app). Não há APK nativo ainda.

> Os links ficam ativos depois que o GitHub Actions concluir o deploy do Pages (Settings > Pages > Source: GitHub Actions) e o build da Release. Capturas de tela e GIFs ainda não foram adicionados.

## Recursos
- 22 torres com 3 caminhos de upgrade e 5 nÃ­veis cada
- VÃ¡rios mapas e dificuldades, conquistas e ranking
- PWA instalÃ¡vel (`manifest.webmanifest` e `sw.js`)
- Empacotamento para Windows com Electron

## Lore
Vale Cinzento foi isolada pela CorporaÃ§Ã£o Aurora quando a Febre PÃ¡lida escapou dos seus laboratÃ³rios. VocÃª comanda o Ãºltimo perÃ­metro. A histÃ³ria completa estÃ¡ em [LORE.md](LORE.md).

## Como rodar
```bash
npm install
npm run web      # servidor em http://localhost:8080
npm start        # versÃ£o desktop (Electron)
npm run dist     # build para Windows
```
Antes de rodar o servidor, copie `.env.example` para `.env` e defina `QZ_SECRET` (`openssl rand -hex 32`).

## Testes
`node tools/test-backend.js` e `node tools/test-upgrades.js game.js`.

## SeguranÃ§a e mudanÃ§as
Veja [SECURITY.md](SECURITY.md) e [CHANGELOG.md](CHANGELOG.md).

## CrÃ©ditos e licenÃ§a
Veja `CREDITS.txt`. A licenÃ§a ainda nÃ£o foi definida.