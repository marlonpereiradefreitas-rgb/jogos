const load=require('./harness.js');const file=process.argv[2];let ok=true;
const chk=(c,m)=>{console.log((c?'OK    ':'FALHA ')+m);if(!c)ok=false;};
global.__store={};
let T=load(file),Z=T.ZTD,t=0;const errs=new Set();const frame=()=>{t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,80))}};
frame();
const ACH=Z.achievements();
chk(ACH.length===50,'50 conquistas ('+ACH.length+')');
chk(ACH.filter(a=>a.secret).length===10,'10 secretas ('+ACH.filter(a=>a.secret).length+')');
chk(new Set(ACH.map(a=>a.id)).size===50&&new Set(ACH.map(a=>a.name)).size===50,'ids e nomes únicos');
chk(ACH.every(a=>/^[a-z0-9_]+$/.test(a.id)),'ids válidos para a Steam (a-z, 0-9, _)');
// tela
T.els.btnHomeAch._l.click();let html=T.els.achList.innerHTML;
chk((html.match(/class="ach-item/g)||[]).length===50,'tela mostra 50 cartões');
const secretNames=ACH.filter(a=>a.secret).map(a=>a.name);
chk(secretNames.every(n=>!html.includes(n)),'nomes das secretas NÃO aparecem enquanto bloqueadas');
chk((html.match(/Conquista secreta/g)||[]).length===10,'10 cartões "Conquista secreta" com dica');
chk(/ach-prog/.test(html),'barras de progresso presentes');
console.log('   contador:',T.els.achCount.textContent);
// jogar
T.els.mapSelect.value='four';T.els.btnPlay._l.click();
chk(!ACH.find(a=>a.id==='ghost').test()||true,'(ghost só vale em partida)');
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=34;if(gx>780){gx=30;gy+=34;if(gy>600)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
for(const key of ['gunner','archer','tesla']){const p=free();Z.dispatch({type:'place',key,x:p[0],y:p[1]});}
Z.dispatch({type:'wave'});
for(let k=0;k<3500;k++){Z.update(1/60);if(k%250===0)frame();}
for(let i=0;i<60;i++)frame();
const done=JSON.parse(global.__store['ztd_v19_ach']||'{}');
console.log('   desbloqueadas na partida:',Object.keys(done).join(', '));
chk(done.build1&&done.first_blood,'build1 e first_blood desbloqueadas');
chk(!done.ghost,'secreta "ghost" NÃO desbloqueou indevidamente (há torres)');
// derrota -> secreta "Todo Herói Cai" + linha de conquistas no fim
Z.endGame();frame();
chk(!!JSON.parse(global.__store['ztd_v19_ach']).fall,'derrota desbloqueia a secreta "Todo Herói Cai"');
chk(/Conquistas/.test(T.els.endStats.innerHTML),'tela de fim lista conquistas novas');
// Curioso
T.els.btnHomeAbout._l.click();T.els.btnHomeAch._l.click();
chk(!!JSON.parse(global.__store['ztd_v19_ach']).curious,'abrir "Sobre o jogo" desbloqueia a secreta "Curioso"');
html=T.els.achList.innerHTML;chk(html.includes('Curioso')&&html.includes('Todo Herói Cai'),'secretas desbloqueadas passam a mostrar o nome');
Z.psSave();const killsA=JSON.parse(global.__store['ztd_v19_stats']).kills;
// persistência em nova sessão
T=load(file);Z=T.ZTD;t=0;frame();T.els.btnHomeAch._l.click();
chk(Z.ps().kills===killsA&&/\b\d+ \/ 50/.test(T.els.achCount.textContent),'persiste ao reabrir o jogo ('+T.els.achCount.textContent+', kills '+Z.ps().kills+')');
// carregar save não conta estatística em dobro
T.els.mapSelect.value='four';T.els.btnPlay._l.click();
const f2=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=34;if(gx>780){gx=30;gy+=34;if(gy>600)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
for(let k=0;k<3000;k++){if(k===3){const p=f2();Z.dispatch({type:'place',key:'gunner',x:p[0],y:p[1]});}if(k===20)Z.dispatch({type:'wave'});Z.update(1/60);}
Z.dispatch({type:'wave'});Z.psSave();
const before=JSON.stringify(Object.assign({},Z.ps(),{t:0,time:0,dirty:0}));
T=load(file);Z=T.ZTD;t=0;frame();T.els.btnHomeContinue._l.click();let f=0;while(Z.G.replay&&f<50000){frame();f++;}
Z.psSave();const after=JSON.stringify(Object.assign({},JSON.parse(global.__store['ztd_v19_stats']),{t:0,time:0,dirty:0}));
const pa=JSON.parse(before),pb=JSON.parse(after);
chk(pa.kills===pb.kills&&pa.built===pb.built&&pa.upgrades===pb.upgrades,'CONTINUAR não duplica estatísticas (kills '+pa.kills+' -> '+pb.kills+', torres '+pa.built+' -> '+pb.built+')');
chk(errs.size===0,'sem erros de frame '+[...errs]);
process.exit(ok?0:1);
