# Segurança

## Medidas aplicadas (verificadas no código e em execução)
- **Content Security Policy estrita sem `'unsafe-inline'` em scripts**:
  - `server.js` envia `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` e HSTS.
  - `index.html` também define `<meta http-equiv="Content-Security-Policy">` com `script-src 'self'` (sem `'unsafe-inline'`). Todo JavaScript (incluindo registro do Service Worker `sw.js`) roda exclusivamente a partir de `game.js`.
  - Validado no navegador com **0 erros de CSP** e **0 erros de console**.
- **Anti-XSS**: dados de usuário (como nome de comandante e registros de ranking) passam por `escHtml` antes de entrar em `innerHTML`.
- **Integridade & Anti-Cheat**:
  - `server.js`: assinatura HMAC-SHA256 para tokens de cliente, saves em nuvem e licenças; comparação em tempo constante para `ADMIN_KEY`; rate limiting e CORS restrito à mesma origem / localhost.
  - `game.js`: `SecurityGuard` faz verificação de integridade e cofre de estado em runtime (`dispatch` + `stateHash`) e validação/sanitização de entradas carregadas de `localStorage`.
- **Controle de Cache Seguro**: arquivos críticos (`.html`, `.js`, `.css`, `/sw.js`) são servidos com `Cache-Control: no-cache, must-revalidate`.
- **Testes automatizados**: `node tools/test-backend.js` valida DRM, HMAC-SHA256, ticket autoritativo, anti-cheat e cabeçalhos CSP (`TEST-BACKEND SECURITY PASS 100%`).

## Segredos
- Nunca versione `.env` nem `data/` (`.gitignore` bloqueia `.env`, `.env.local`, `data/.server_secret`, `data/db.json`).
- Gere o segredo do servidor com `openssl rand -hex 32` e configure `QZ_SECRET` em `.env`.

## Limitações conhecidas
- `style-src` ainda utiliza `'unsafe-inline'` para estilos dinâmicos da UI.
- `connect-src` na meta tag HTML aceita `http:`, `https:`, `ws:` e `wss:` para compatibilidade com servidores locais/externos configurados pelo usuário; no `server.js`, o header HTTP restringe para `'self'`.
- Código JavaScript executado no cliente pode ser inspecionado pelo usuário em modo offline; a validação autoritativa de ranking e saves em nuvem fica no `server.js`.

## Reportar vulnerabilidades
Abra um aviso privado de segurança (Security Advisory) no repositório do GitHub.
