const load=require('./harness.js');
const T=load(process.argv[2]),Z=T.ZTD;
T.frame(0);T.els.mapSelect.value='four';T.els.btnPlay._l.click();Z.G.money=1e12;
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=26;if(gx>800){gx=30;gy+=26;if(gy>610)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
const ks=['gunner','sniper','mortar','flame','tesla','ice','poison','antitank','archer','boomerang','engineer','radar','shotgun','drone','demolition','railgun','medstation','acid'];
for(let i=0;i<40;i++){const p=free();const tw=Z.placeTower(ks[i%18],p[0],p[1]);if(tw)for(let l=0;l<5;l++){Z.G.money=1e12;Z.upgradeTower(tw,0,i%3)}}
Z.G.life=1e9;Z.WM.num=38;
let t=0;const want=+process.argv[3]||300;
while(Z.zombies.length<want){Z.WM.send();for(let f=0;f<20;f++){for(const z of Z.zombies){z.hp=1e9;z.maxhp=1e9;}Z.update(1/60)}}
for(const z of Z.zombies){z.hp=1e9;z.maxhp=1e9;}
for(let i=0;i<30;i++){t+=16;T.frame(t);}  // aquece
global.__calls=0;global.__by={};
for(let i=0;i<10;i++){t+=16;T.frame(t);}
const by=Object.entries(global.__by).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,v])=>k+':'+Math.round(v/10)).join(' ');
console.log('zumbis:',Z.zombies.length,'| chamadas de desenho por quadro:',Math.round(global.__calls/10),'|',by);
