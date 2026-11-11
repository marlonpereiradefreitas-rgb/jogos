// Salvar e carregar: a partida carregada precisa ser IDÊNTICA à salva (dois tipos de autosave).
const load=require('./harness.js');const file=process.argv[2];let allOk=true;
function scenario(name,finalWave){
  global.__store={};
  let T=load(file),Z=T.ZTD,t=0;T.frame(0);T.els.mapSelect.value='cruzamento';T.els.difficultySelect.value='normal';T.els.btnPlay._l.click();
  const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=34;if(gx>780){gx=30;gy+=34;if(gy>600)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
  const hist={};
  for(let k=0;k<4500;k++){
    if(k%100===0&&k<1500){const key=['gunner','archer','tesla','ice','radar','mortar'][(k/100|0)%6];const p=free();Z.dispatch({type:'place',key,x:p[0],y:p[1]});}
    if(k===20)Z.dispatch({type:'wave'});
    if(k>300&&k%120===0&&Z.towers.length){const tw=Z.towers[(k/120|0)%Z.towers.length];Z.dispatch({type:'up',id:tw.id,i:0,path:(k/120|0)%3});}
    Z.update(1/60);hist[Z.G.tick]=Z.stateHash();
  }
  let hashA;if(finalWave){Z.dispatch({type:'wave'});hashA=Z.stateHash();}
  const sv=Z.readSave();if(!sv){console.log(name,': NENHUM SAVE GRAVADO');allOk=false;return;}
  if(!finalWave)hashA=hist[sv.ticks];
  const before={tick:sv.ticks,wave:sv.wave,cmds:sv.log.length};
  T=load(file);Z=T.ZTD;t=0;T.frame(0);
  const vis=!T.els.btnHomeContinue.classList.contains('hidden');
  T.els.btnHomeContinue._l.click();let frames=0;while(Z.G.replay&&frames<50000){T.frame(t+=16);frames++;}
  const ok=vis&&Z.stateHash()===hashA&&Z.G.tick===sv.ticks&&Z.WM.num===sv.wave&&Z.G.paused;
  allOk=allOk&&ok;
  console.log(name.padEnd(34),'| save: tick',before.tick,'onda',before.wave,'cmds',before.cmds,'~'+Math.round(JSON.stringify(sv).length/1024)+'KB | carregou em',frames,'quadros | torres',Z.towers.length,'kills',Z.G.kills,'|',ok?'IDÊNTICO':'DIVERGIU');
}
scenario('autosave por comando (onda manual)',true);
scenario('autosave no meio do passo (onda auto)',false);
process.exit(allOk?0:1);
