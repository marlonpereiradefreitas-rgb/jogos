const fs=require('fs'),vm=require('vm');
module.exports=function load(file){
  const errors=[];
  global.__calls=0;global.__by={};const mkCtx=()=>new Proxy(function(){}, {get:(t,k)=>{if(typeof k==='symbol')return undefined;if(k==='createLinearGradient'||k==='createRadialGradient')return()=>{global.__calls++;global.__by[k]=(global.__by[k]||0)+1;return{addColorStop(){}}};if(k==='measureText')return()=>({width:10});return()=>{global.__calls++;global.__by[k]=(global.__by[k]||0)+1;};}, set:()=>true});
  const els={};
  const mkEl=(id)=>{const cls=new Set();const o={id,style:{},dataset:{},children:[],value:'50',textContent:'',innerHTML:'',checked:false,
    classList:{add:(...a)=>a.forEach(x=>cls.add(x)),remove:(...a)=>a.forEach(x=>cls.delete(x)),toggle:(c,f)=>{const on=f===undefined?!cls.has(c):f;on?cls.add(c):cls.delete(c);return on},contains:c=>cls.has(c)},
    addEventListener(t,f){(this._l=this._l||{})[t]=f},appendChild(c){this.children.push(c)},querySelector:()=>mkEl('q'),querySelectorAll:()=>[],getContext:()=>mkCtx(),animate(){},
    getBoundingClientRect:()=>({left:0,top:0,width:960,height:640}),toDataURL:()=>'data:',offsetWidth:100,offsetHeight:100,clientWidth:960,clientHeight:640,width:960,height:640,closest:()=>null};return o;};
  const document={getElementById:id=>els[id]||(els[id]=mkEl(id)),createElement:()=>mkEl('c'),querySelectorAll:()=>[],querySelector:()=>mkEl('q'),body:mkEl('body'),readyState:'complete',addEventListener(){},hidden:false};
  let raf=null;
  const win={document,addEventListener(){},requestAnimationFrame:f=>{raf=f;return 1},localStorage:{getItem:k=>(global.__store&&k in global.__store)?global.__store[k]:null,setItem(k,v){(global.__store=global.__store||{})[k]=String(v)},removeItem(k){if(global.__store)delete global.__store[k]}},AudioContext:undefined,innerWidth:1280,innerHeight:720};
  const ctx=vm.createContext({__G:global,window:win,document,localStorage:win.localStorage,requestAnimationFrame:win.requestAnimationFrame,performance:{now:()=>Date.now()},console,setTimeout,clearTimeout,Math,JSON,Object,Array,Number,String,Set,Map,Image:function(){},confirm:()=>true});
  win.window=win;
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  return {ZTD:win.ZTD,els,errors,frame:(t)=>{const f=raf;raf=null;f(t);},getRaf:()=>raf};
};
