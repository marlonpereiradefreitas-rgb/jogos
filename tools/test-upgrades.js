const load=require('./harness.js');
const T=load(process.argv[2]),Z=T.ZTD;let t=0;const errs=new Set();
const step=(n=1)=>{for(let i=0;i<n;i++){t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,80))}}};
step(2);Z.resetGame();
const free=(()=>{let gx=30,gy=30;return()=>{for(let n=0;n<9000;n++){gx+=30;if(gx>800){gx=30;gy+=30;if(gy>610)gy=30}if(!Z.validSpot(gx,gy))return[gx,gy]}}})();
const problems=[],names=new Map();let total=0;
for(const k of Object.keys(Z.TOWERS)){const sig=[];
  for(let path=0;path<3;path++){Z.resetGame();Z.G.money=1e9;const p=free();const tw=Z.placeTower(k,p[0],p[1]);
    for(let l=0;l<5;l++){Z.G.money=1e9;if(!Z.upgradeTower(tw,0,path))problems.push(k+' caminho '+(path+1)+' nível '+(l+1)+' não comprou');else total++;}
    for(const f in tw.s)if(typeof tw.s[f]==='number'&&!isFinite(tw.s[f]))problems.push(k+' '+f+' inválido');
    for(const u of tw.ups){if(names.has(u.name)&&names.get(u.name)!==k)problems.push('nome repetido: '+u.name+' ('+names.get(u.name)+' e '+k+')');names.set(u.name,k);}
    sig.push(JSON.stringify(tw.s,(a,v)=>typeof v==='number'?+v.toFixed(2):v));
    step(2);}
  if(new Set(sig).size<3)problems.push(k+': caminhos com resultado igual');}
console.log('18 torres x 3 caminhos x 5 níveis: compras ok =',total,'/ 270 | problemas:',problems.length?problems.join('; '):'nenhum','| erros de frame:',errs.size||'nenhum');
