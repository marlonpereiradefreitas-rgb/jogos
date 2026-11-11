const load=require('./harness.js');
const T=load(process.argv[2]),Z=T.ZTD;let t=0;const errs=new Set();
const step=(n=1)=>{for(let i=0;i<n;i++){t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,80))}}};
step(2);
console.log('cards extras criados:',T.els.mapCards.children.length,'| opções no seletor:',T.els.mapSelect.children.length);
const maps=Object.keys(Z.MAPS);
for(const map of maps){
  T.els.mapSelect.value=map;T.els.difficultySelect.value='normal';T.els.btnPlay._l.click();
  // 1) sem torres: os zumbis devem chegar à base
  Z.WM.send();let g=0;while((Z.WM.queue.length||Z.zombies.length)&&Z.G.mode==='play'&&g++<40000)Z.update(.05);
  const lifeLost=100-Z.G.life;
  // 2) espaço para construir
  let free=0;for(let x=20;x<940;x+=20)for(let y=20;y<620;y+=20)if(!Z.validSpot(x,y))free++;
  // 3) 25 ondas com defesa
  T.els.btnPlay._l.click();Z.G.money=1e9;
  const spots=[];for(let x=30;x<800;x+=26)for(let y=30;y<610;y+=26)if(!Z.validSpot(x,y))spots.push([x,y]);
  // escolhe posições perto do caminho
  spots.sort((a,b)=>a[1]-b[1]);let built=0;
  for(const k of ['gunner','radar','drone','mortar','tesla','ice','antitank','railgun']){for(let i=0;i<3;i++){const idx=Math.floor(Math.random()*spots.length);const p=spots[idx];if(!p)continue;const tw=Z.placeTower(k,p[0],p[1]);if(tw){built++;for(let l=0;l<5;l++){Z.G.money=1e9;Z.upgradeTower(tw,0,0)}}}}
  for(let n=1;n<=25&&Z.G.mode==='play';n++){Z.WM.send();let q=0;while((Z.WM.queue.length||Z.zombies.length)&&Z.G.mode==='play'&&q++<40000){Z.G.money=1e9;Z.update(.05)}step(1)}
  console.log(map.padEnd(11),'| base perdeu vida sem defesa:',lifeLost>0?'sim':'NÃO (caminho quebrado!)','| pontos livres:',free,'| torres:',built,'| onda',Z.WM.num,'| modo',Z.G.mode,'| erros:',errs.size||'nenhum');
}
