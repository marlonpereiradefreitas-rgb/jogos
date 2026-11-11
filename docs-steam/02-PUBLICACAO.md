# Passo a passo: do zero ao lançamento na Steam

> Valores e prazos mudam. Confirme tudo no portal oficial (partner.steamgames.com) antes de agir.

## Antes de tudo
1. Jogue o jogo inteiro e corrija o que estiver ruim. Meça o FPS (F3) em um PC fraco.
2. Defina um nome final e verifique se não há outro jogo/marca com o mesmo nome.
3. Troque as imagens ou textos que não sejam seus (o jogo já não usa imagens `.jpg` externas).
4. Revise `CREDITS.txt`.

## Conta e burocracia
5. Crie a conta no **Steamworks** (partner.steamgames.com) e aceite o contrato.
6. Preencha **dados fiscais e bancários** (você, ou sua empresa). Isso pode levar dias e a Valve pode pedir documentos.
7. Pague a **taxa do app** (historicamente US$ 100 por jogo, recuperável depois de certa receita; confirme o valor atual).
8. Crie o **App** no Steamworks e anote o **App ID** e o **Depot ID**.

## Configuração do jogo
9. **Conquistas:** crie as 50 do arquivo `01-LOJA.md` (API Name idêntico ao do código; marque as 10 secretas como ocultas).
10. **Steam Cloud (Auto-Cloud):** ative e aponte para a pasta `%APPDATA%\Quarentena Z\cloud` (arquivo `savegame.json`).
11. **Rich Presence:** adicione o token `#Status` com o texto `%status%`.
12. **Opções de lançamento:** executável `Quarentena Z.exe`, Windows.

## Build e envio
13. Siga `03-BUILD-ELECTRON.md` para gerar o build e testar com a Steam aberta.
14. Edite `steam/app_build.vdf` e `steam/depot_build.vdf` com seus IDs e rode `steam/ENVIAR-BUILD.bat`.
15. No Steamworks, defina o build como o **branch de teste**, instale pela Steam e jogue tudo de novo (conquistas, nuvem, sair, tela cheia).

## Página da loja
16. Preencha a página com os textos e imagens de `01-LOJA.md`.
17. Envie a página para **revisão da Valve** e publique a página "Em breve" o quanto antes: ela precisa ficar no ar por um tempo mínimo antes do lançamento, e é nela que se juntam os **desejos** (lista de desejos).
18. Preencha o **questionário de classificação etária** e as informações de **impostos/região**.
19. Defina o **preço** (veja jogos parecidos; a Steam sugere faixas por região).

## Lançamento
20. Envie o **build final** para revisão da Valve (leva alguns dias) e, aprovado, escolha a data.
21. No dia: coloque o build como **padrão (default)** e aperte o botão de lançar.
22. Divulgue: desejos antes do lançamento, trailer, comunidades de tower defense, criadores de conteúdo, Steam Next Fest (se der tempo).

## Depois
23. Responda à comunidade, corrija bugs rápido (use branch de teste para atualizações).
24. Atualizações com novidades (mapas, torres) mantêm o jogo visível. Considere DLCs e o modo multiplayer depois (veja `MULTIPLAYER-ROADMAP.md`).
