const load=require('./harness.js');
const T=load(process.argv[2]),Z=T.ZTD;let t=0;const errs=new Set();
const frame=()=>{t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,90))}};
frame();T.els.mapSelect.value='four';T.els.btnPlay._l.click();Z.G.money=1e9;
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=30;if(gx>800){gx=30;gy+=30;if(gy>610)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
for(const k of ['gunner','radar','drone','tesla','ice','mortar','sniper','flame','poison','archer','antitank','engineer']){const p=free();Z.dispatch({type:'place',key:k,x:p[0],y:p[1]});}
Z.dispatch({type:'wave'});frame();
console.log('faixa de onda:',Z.G.banner?Z.G.banner.title+' | '+Z.G.banner.sub.slice(0,40):'NÃO CRIADA');
for(let n=0;n<12;n++){Z.dispatch({type:'wave'});let g=0;while((Z.WM.queue.length||Z.zombies.length)&&Z.G.mode==='play'&&g++<20000){Z.G.money=1e9;Z.update(.05)}}
for(let i=0;i<40;i++)frame();                       // deixa o loop checar conquistas
console.log('onda',Z.WM.num,'| kills',Z.G.kills,'| dicas pendentes:',Z.G.tips?Z.G.tips.length:'(já vistas)');
T.els.btnHomeAch._l.click();
console.log('tela de conquistas:',T.els.achList.innerHTML.length>200?'renderizada':'VAZIA','|',T.els.achCount.textContent);
Z.endGame();frame();console.log('estrelas no fim:',/[★☆]/.test(T.els.endStats.innerHTML)?'ok ('+(T.els.endStats.innerHTML.match(/[★☆]+/)||[''])[0]+')':'AUSENTE');
console.log('erros de frame:',errs.size?[...errs]:'nenhum','| comandos gravados:',Z.CMDLOG.length);
