const load=require('./harness.js');const file=process.argv[2];let ok=true;
const chk=(c,m)=>{console.log((c?'OK    ':'FALHA ')+m);if(!c)ok=false;};
global.__store={};
let T=load(file),Z=T.ZTD,t=0;const errs=new Set();const frame=()=>{t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,80))}};
frame();T.els.mapSelect.value='four';T.els.btnPlay._l.click();
const sup=()=>Z.dispatch({type:'power',key:'supply'});
const run=sec=>{for(let i=0;i<sec*60;i++)Z.update(1/60);};
let m0=Z.G.money;sup();chk(Math.round(Z.G.money-m0)===1250,'1º uso: +1500 -250 = +1250 (veio '+Math.round(Z.G.money-m0)+')');
m0=Z.G.money;sup();chk(Z.G.money===m0,'2º uso imediato é bloqueado (cooldown)');
run(299);m0=Z.G.money;sup();chk(Z.G.money===m0,'aos 299 s ainda bloqueado');
run(2);m0=Z.G.money;sup();chk(Math.round(Z.G.money-m0)===1250,'aos 5 min: liberado (2º uso)');
run(301);m0=Z.G.money;sup();chk(Math.round(Z.G.money-m0)===1250,'3º uso liberado');
run(301);m0=Z.G.money;sup();chk(Z.G.money===m0,'4º uso bloqueado: limite de 3 por partida');
for(let i=0;i<3;i++)frame();chk(errs.size===0,'interface dos poderes atualiza sem erro '+[...errs]);
// nova partida zera o limite
T.els.btnPlay._l.click();m0=Z.G.money;sup();chk(Math.round(Z.G.money-m0)===1250,'nova partida: suprimentos zerados');
// salvar/carregar com suprimentos no meio
global.__store={};T=load(file);Z=T.ZTD;t=0;frame();T.els.mapSelect.value='four';T.els.btnPlay._l.click();
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=34;if(gx>780){gx=30;gy+=34;if(gy>600)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
for(let k=0;k<19000;k++){if(k===5){const p=free();Z.dispatch({type:'place',key:'gunner',x:p[0],y:p[1]});}if(k===30||k===18500)Z.dispatch({type:'power',key:'supply'});if(k===40)Z.dispatch({type:'wave'});Z.update(1/60);}
Z.dispatch({type:'wave'});const hA=Z.stateHash(),uA=Z.G.money;const sv=Z.readSave();
T=load(file);Z=T.ZTD;t=0;frame();T.els.btnHomeContinue._l.click();let f=0;while(Z.G.replay&&f<60000){frame();f++;}
chk(!!sv&&Z.stateHash()===hA&&Math.abs(Z.G.money-uA)<1e-6,'continuar após usar suprimentos: partida idêntica (tick '+Z.G.tick+', onda '+Z.WM.num+')');
process.exit(ok?0:1);
