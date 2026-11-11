// Prova de determinismo: grava uma partida (comandos) e reproduz só pelos comandos, em condições diferentes.
// Uso: node tools/determinism-test.js ./game.js
const load=require('./harness.js');
const file=process.argv[2]||'./game.js';
const TICKS=4000;
function play(seed,log,hostile){
  const T=load(file),Z=T.ZTD;let t=0;T.frame(0);Z.resetGame(seed);Z.G.money=80000;
  const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=34;if(gx>780){gx=30;gy+=34;if(gy>600)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
  const keys=['gunner','sniper','mortar','tesla','ice','radar','drone','flame','poison','archer','antitank','engineer'];
  let i=0,acc=7;const rec=!log;
  const saved=Math.random;if(hostile)Math.random=()=>0.987654;   // aleatoriedade visual diferente
  for(let k=0;k<TICKS;k++){
    if(rec){
      if(k===0)keys.forEach(key=>{const p=free();Z.dispatch({type:'place',key,x:p[0],y:p[1]});});
      if(k===30||k%900===0)Z.dispatch({type:'wave'});
      if(k>=300&&k%60===0&&Z.towers.length){const tw=Z.towers[(k/60|0)%Z.towers.length];Z.dispatch({type:'up',id:tw.id,i:0,path:(k/60|0)%3});}
      if(k===100||k===160||k===220){const by=x=>Z.towers.find(q=>q.key===x);const r=by('radar'),ic=by('ice'),sn=by('drone');if(r)Z.dispatch({type:'up',id:r.id,i:0,path:1});if(ic)Z.dispatch({type:'up',id:ic.id,i:0,path:2});if(sn)Z.dispatch({type:'up',id:sn.id,i:0,path:1});}
      if(k===2000)Z.dispatch({type:'auto',on:false});
      if(k===2600&&Z.towers[0])Z.dispatch({type:'ability',id:Z.towers[0].id});
    }else while(i<log.length&&log[i].tick===Z.G.tick)Z.dispatch(log[i++]);
    if(hostile&&k%7===0){Z.G.paused=true;T.frame(t+=16);Z.G.paused=false;}   // render no meio da simulação
    Z.update(1/60);
    if(k%50===0)acc=(Math.imul(acc,31)+Z.stateHash())>>>0;   // resumo de todos os instantes
  }
  Math.random=saved;
  return {rng:Z.rngState(),crits:(()=>{let c=0;for(const q of Z.towers)if(q.s.crit)c++;return c})(),hash:acc,log:Z.CMDLOG.map(c=>Object.assign({},c)),kills:Z.G.kills,wave:Z.WM.num,towers:Z.towers.length,zs:Z.zombies.length};
}
const A=play(20260101,null,false);
const B=play(20260101,A.log,true);
const C=play(777,A.log.map(c=>c),false);
console.log('Torres com crítico:',A.crits,'| estado do RNG após a partida:',A.rng,'(semente inicial 20260101)');
console.log('Gravação  : resumo',A.hash,'| comandos',A.log.length,'| onda',A.wave,'| kills',A.kills,'| torres',A.towers);
console.log('Replay    : resumo',B.hash,'| kills',B.kills,'(render intercalado + Math.random diferente)');
console.log('Outra semente: resumo',C.hash,'| kills',C.kills);
console.log(A.hash!==C.hash?'Semente diferente gera partida diferente: OK.':'AVISO: outra semente não alterou nada (RNG pouco exercitado).');
console.log(A.hash===B.hash&&A.rng===B.rng?'DETERMINISMO OK: mesma semente + mesmos comandos = mesmo estado.':'FALHOU: replay divergiu.');
process.exit(A.hash===B.hash&&A.rng===B.rng?0:1);
