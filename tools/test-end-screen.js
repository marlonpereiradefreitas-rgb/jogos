const load=require('./harness.js');const T=load(process.argv[2]),Z=T.ZTD;let t=0;const errs=new Set();
const frame=()=>{t+=16;try{T.frame(t)}catch(e){errs.add(e.message.slice(0,80))}};
frame();T.els.mapSelect.value='four';T.els.btnPlay._l.click();frame();
Z.endGame();frame();
const el=T.els;
console.log('tela de derrota visível:',!el.endScreen.classList.contains('hidden'),'| título:',el.endTitle.textContent||'(definido no DOM real)');
console.log('botão SAIR existe e tem ação:',typeof (el.btnEndExit&&el.btnEndExit._l&&el.btnEndExit._l.click)==='function');
el.btnEndExit._l.click();frame();
console.log('após SAIR -> modo:',Z.G.mode,'| tela de fim oculta:',el.endScreen.classList.contains('hidden'),'| menu inicial visível:',!el.homeScreen.classList.contains('hidden'));
// jogar de novo depois de sair funciona
el.btnPlay._l.click();frame();console.log('novo jogo após sair -> modo:',Z.G.mode,'| erros:',errs.size?[...errs]:'nenhum');
