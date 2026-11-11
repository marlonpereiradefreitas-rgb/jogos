# Gerar o executável de Windows e testar com a Steam

> NÃO foi testado: eu não tinha Windows nem internet para gerar o `.exe`. Os arquivos `electron/`, `package.json` e `steam/` são um ponto de partida; versões e APIs devem ser conferidas ao instalar.

## Pré-requisitos (no Windows)
- Node.js LTS (nodejs.org)
- Cliente Steam instalado e logado
- Opcional: SteamCMD (para enviar o build)

## Passos
1. Abra um terminal na pasta do projeto e rode: `npm install`
2. Teste local: `npm start`. Com a Steam aberta, o `steam_appid.txt` (valor 480 = jogo de teste da Valve) faz a Steam reconhecer o jogo. **Troque o 480 pelo seu App ID depois de criar o app** e apague o arquivo no build final (a Steam fornece o ID).
3. Gere o build: `npm run dist` (saída em `dist/win-unpacked/`).
4. Rode `dist/win-unpacked/Quarentena Z.exe` com a Steam aberta e confira: tela cheia (F11), botão Sair, salvamento e continuar.
5. Para conquistas e Rich Presence, o app precisa estar com o **seu App ID** e as conquistas criadas no Steamworks.
6. Envie o build com `steam/ENVIAR-BUILD.bat` (veja `02-PUBLICACAO.md`).

## O que já está ligado no código
- `window.steamBridge` (só existe dentro do Electron): desbloquear conquista, Rich Presence ("Onda N"), sair, tela cheia, ler/gravar save em arquivo (para Steam Cloud).
- Fora da Steam o jogo continua funcionando normalmente (a ponte é opcional).

## Se algo falhar
- `steamworks.js`: confira a documentação da versão instalada; os nomes dos métodos podem ter mudado.
- O build não abre: rode `npm start` e leia o erro no terminal.
