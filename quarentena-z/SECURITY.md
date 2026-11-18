# Segurança & Arquitetura AppSec (Quarentena Z v19.29)

## 1. Proteção Anti-XSS & Content Security Policy (CSP)
- **Content Security Policy estrita sem `'unsafe-inline'` em scripts**:
  - `server.js` envia `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` e HSTS.
  - `index.html` define `<meta http-equiv="Content-Security-Policy">` com `script-src 'self'` e todos os recursos referenciados por caminhos relativos (`./...`).
- **Sanitização e Atribuição Segura**:
  - `modules/security-vault.js` (`QZ_SECURITY.escHtml`, `QZ_SECURITY.sanitizeText`, `QZ_SECURITY.setSafeText`) e `SecurityGuard` sanitizam nomes de comandantes, salas multiplayer e entradas de ranking contra injeção de HTML/JS e Prototype Pollution (`__proto__`, `constructor`, `prototype`).

## 2. Isolamento Anti-Cheat em Escopos Fechados
- **Cofre Léxico (`QZ_SECURITY.createAntiCheatVault` & `SecurityGuard`)**:
  - Variáveis críticas de partida (`money`, `life`, `wave`, `kills`, multiplicadores de dano) são espelhadas em escopo fechado com chaves XOR dinâmicas e selo criptográfico FNV-1a/DJB2.
  - Edições manuais via console DevTools são detectadas em tempo de execução (`verifyVault` / `verifyAndRestore`) e revertidas automaticamente para o estado legítimo.
  - As definições estáticas (`TOWERS`, `ZOMBIES`, `DIFFS`, `BALANCE`, `ASCENSION_BALANCE`, `POWERS`) são congeladas recursivamente com `Object.freeze`.

## 3. Integridade Local (Validação por Hash e Assinatura Digital)
- Todos os salvamentos locais em `localStorage` possuem assinatura digital verificada (`computeLocalSig` / `QZ_SECURITY.computeDigitalSignature`):
  - Conquistas (`ztd_v19_ach` + `ztd_v19_ach_sig`)
  - Estatísticas permanentes (`ztd_v19_stats` + `ztd_v19_stats_sig`)
  - Carreira e medalhas (`quarentenaz_career_v4` + `quarentenaz_career_v4_sig`)
  - Ranking local (`quarentenaz_rank_v1` + `quarentenaz_rank_v1_sig`)
  - Partida em andamento (`ztd_v19_save` com selo `sig`)
- Qualquer adulteração manual invalida a assinatura digital, bloqueia a carga fraudulenta e incrementa o contador de auditoria `SecurityGuard.tamperCount`.

## 4. Banco de Dados em Nuvem, Multiplayer e Sincronização Híbrida
- **Esquemas de Nuvem**:
  - `database/supabase_schema.sql`: Tabelas PostgreSQL com Row Level Security (RLS) para `users_profiles`, `user_achievements`, `global_leaderboard`, `cloud_saves`, `mp_rooms`, `mp_room_players`, `mp_wave_events` e `mp_scores`.
  - `database/firebase_rules.json`: Regras de segurança para Firebase Auth / Realtime Database / Firestore.
- **Módulos de Rede e Sincronização**:
  - `modules/cloud-db.js`: Adaptador híbrido para Supabase, Firebase e servidor nativo com fila offline-first (`quarentenaz_hybrid_sync_queue_v1`) assinada digitalmente.
  - `modules/network-multiplayer.js` + `server.js`: WebSocket nativo RFC 6455 (`/ws`) e API REST (`/api/mp/*`) com validação autoritativa de comandos no servidor.

## 5. Suíte de Validação Automatizada
- `node verificar_projeto.js`
- `node tools/test-backend.js`
- `node tools/test-btd6-expansion.js game.js`
- `node tools/determinism-test.js game.js`
