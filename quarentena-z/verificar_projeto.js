/* Verificador local simples — execute com: node verificar_projeto.js */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
let errors = 0;
function check(ok, message) {
  console.log(`${ok ? 'OK' : 'FALHA'} - ${message}`);
  if (!ok) errors++;
}
try { new Function(js); check(true, 'game.js possui sintaxe JavaScript válida'); }
catch (e) { check(false, `sintaxe JavaScript: ${e.message}`); }
check(/<canvas[^>]+id=["']game["']/.test(html), 'canvas principal existe');
check(/<script[^>]+src=["']game\.js(?:\?[^"']*)?["']/.test(html), 'game.js está ligado ao HTML');
check(/<link[^>]+href=["']style\.css(?:\?[^"']*)?["']/.test(html), 'style.css está ligado ao HTML');
const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
const refs = [...js.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const missing = [...new Set(refs.filter(id => !ids.has(id)))];
check(missing.length === 0, missing.length ? `IDs ausentes: ${missing.join(', ')}` : 'IDs DOM consultados diretamente existem');
check(!/\.jpg/.test(css + sw + html), 'nenhuma imagem .jpg externa referenciada (arte gerada por codigo)');
check(!/ADMIN_ACCESS_CODE|adminUnlocked/.test(js), 'codigo de administrador removido');
check(!/four circles|zombie apocalypse|nêmesis/i.test(js + html), 'nomes de terceiros removidos do codigo e da pagina');
check(css.length > 1000, 'folha de estilos carregada');
try { JSON.parse(manifest); check(true, 'manifesto PWA possui JSON válido'); } catch (e) { check(false, `manifesto PWA: ${e.message}`); }
check(/serviceWorker\.register/.test(html + js), 'registro do service worker está configurado (HTML ou game.js)');
check(/addEventListener\(['"]install['"]/.test(sw) && /addEventListener\(['"]fetch['"]/.test(sw), 'service worker possui instalação e cache de recursos');
check(fs.existsSync(path.join(root, 'assets', 'icon.svg')), 'ícone instalável existe');
console.log(errors ? `\n${errors} verificacao(oes) falharam.` : '\nTodas as verificacoes estaticas passaram.');
process.exitCode = errors ? 1 : 0;
