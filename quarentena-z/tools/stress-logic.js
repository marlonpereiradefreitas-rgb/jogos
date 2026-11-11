const load=require('./harness.js');
const T=load(process.argv[2]),Z=T.ZTD;let t=0;
T.frame(0);T.els.mapSelect.value='four';T.els.btnPlay._l.click();Z.G.money=1e12;
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=26;if(gx>800){gx=30;gy+=26;if(gy>610)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
const ks=['gunner','sniper','mortar','flame','tesla','ice','poison','antitank','archer','boomerang','engineer','radar','shotgun','drone','demolition','railgun','medstation','acid'];
for(let i=0;i<40;i++){const p=free();const tw=Z.placeTower(ks[i%18],p[0],p[1]);if(tw)for(let l=0;l<5;l++){Z.G.money=1e12;Z.upgradeTower(tw,0,i%3)}}
Z.G.life=1e9;Z.WM.num=38;
for(let i=0;i<14;i++)Z.WM.send();          // inunda a tela de zumbis
let maxZ=0,sum=0,n=0,worst=0;
for(let f=0;f<1500;f++){Z.G.money=1e12;for(const z of Z.zombies){if(z.hp<1e8){z.hp=1e9;z.maxhp=1e9;}z.dist=Math.min(z.dist,1500);}const a=process.hrtime.bigint();Z.update(1/60);const ms=Number(process.hrtime.bigint()-a)/1e6;
  sum+=ms;n++;worst=Math.max(worst,ms);maxZ=Math.max(maxZ,Z.zombies.length);
  if(f%40===0)Z.WM.send();}
console.log('pico de zumbis:',maxZ,'| torres:',Z.towers.length,'| média/step:',(sum/n).toFixed(2),'ms | pior step:',worst.toFixed(1),'ms | partículas:',(Z.FX&&Z.FX.parts?Z.FX.parts.length:'?'));
