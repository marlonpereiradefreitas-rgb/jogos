# Segurança

## Medidas existentes (verificadas no código)
- Servidor: assinatura HMAC-SHA256 de tokens, saves e licenças; comparação em tempo constante da chave de admin; cabeçalhos CSP e CORS restritos (`server.js`).
- Cliente: CSP no `index.html`; nomes e dados vindos do ranking passam por `escHtml` antes de `innerHTML`.
- `tools/test-backend.js` valida DRM, HMAC, anti-cheat e CSP.

## Segredos
- Nunca versione `.env` nem `data/`. Gere o segredo com `openssl rand -hex 32` e defina `QZ_SECRET`.
- Se um segredo já foi commitado, considere-o vazado: rotacione e reescreva o histórico.

## Limitações conhecidas
- CSP do cliente ainda permite `'unsafe-inline'` em scripts e estilos.
- `connect-src` aceita `http:`, `https:`, `ws:` e `wss:` de qualquer origem.
- Há cerca de 48 usos de `innerHTML` em `game.js`; apenas os de dados de usuário foram conferidos.
- Código em JavaScript de cliente não impede trapaça local por completo; a validação autoritativa está no servidor.

## Reportar vulnerabilidades
Abra um aviso privado de segurança no repositório.