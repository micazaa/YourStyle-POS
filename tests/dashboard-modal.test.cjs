const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('Frontend/Scripts/DashboardModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(){
 const observers=[];let active,closed=0;
 function node(tag='div'){
  const n={tagName:tag.toUpperCase(),childNodes:[],attrs:{},events:{},dataset:{},disabled:false,isConnected:true,
   append(...children){children.forEach(c=>{if(c.parent)c.parent.childNodes.splice(c.parent.childNodes.indexOf(c),1);this.childNodes.push(c);c.parent=this;});},
   setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},
   addEventListener(k,fn){this.events[k]=fn;},getClientRects(){return [1];},closest(){return null;},focus(){active=this;},contains(e){return this===e||this.childNodes.some(c=>c.contains(e));},
   querySelectorAll(selector){return this.query?.(selector)||[];},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
  };return n;
 }
 const heading=node(),title=node('h2');title.textContent='Test summary';heading.query=s=>s==='h2'?[title]:[];
 const content=node(),footer=node('footer'),secondary=node('button'),download=node('button');footer.append(secondary,download);
 const dialog=node('dialog');dialog.id='summary';dialog.append(heading,content,footer);dialog.open=true;
 dialog.close=()=>{closed++;dialog.open=false;dialog.events.close?.();};
 dialog.query=s=>{
  if(s==='[data-dashboard-modal-heading]')return [heading];if(s==='[data-dashboard-modal-footer]')return [footer];
  if(s==='[aria-busy="true"]')return download.getAttribute('aria-busy')==='true'?[download]:[];
  if(s==='[data-dashboard-modal-close],.dashboard-modal-footer .btn-light')return [dialog.headerClose,secondary].filter(Boolean);
  if(s.includes('button:not(:disabled)'))return [dialog.headerClose,secondary,download].filter(n=>n&&!n.disabled);
  return [];
 };
 const append=dialog.append;dialog.append=function(...items){append.apply(this,items);if(items[0]?.className==='dashboard-modal-header')this.headerClose=items[0].childNodes[1];};
 const document={readyState:'complete',querySelectorAll:()=>[dialog],createElement:node,get activeElement(){return active;}};
 const c=vm.createContext({document,window:{matchMedia:()=>({matches:true})},getComputedStyle:()=>({visibility:'visible'}),
  MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}}});
 vm.runInContext(source,c);
 const fire=(type,target,key)=>{const event={target,key,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};dialog.events[type]?.(event);return event;};
 return {c,dialog,heading,content,footer,secondary,download,fire,sync:()=>observers.forEach(fn=>fn()),get active(){return active;},get closed(){return closed;}};
}
test('shared shell mounts once and preserves the original heading, content and action nodes',()=>{
 const f=fixture();const [header,body,footer]=f.dialog.childNodes;
 assert.equal(header.className,'dashboard-modal-header');assert.equal(header.childNodes[0],f.heading);assert.equal(body.className,'dashboard-modal-body');assert(body.childNodes.includes(f.content));assert.equal(footer,f.footer);
 assert.equal(f.dialog.headerClose.getAttribute('aria-label'),'Close test summary');assert.equal(f.dialog.headerClose.autofocus,true);
 f.c.window.DashboardModal.mountAll();assert.equal(f.dialog.childNodes.length,3);
});
test('busy guard blocks Escape, close clicks and form submissions while preserving previously disabled actions',()=>{
 const f=fixture();f.secondary.disabled=true;f.download.setAttribute('aria-busy','true');f.sync();
 assert.equal(f.dialog.getAttribute('aria-busy'),'true');assert.equal(f.dialog.headerClose.disabled,true);
 assert.equal(f.fire('cancel',f.dialog).prevented,true);assert.equal(f.closed,0);
 const target={closest:()=>f.dialog.headerClose};assert.equal(f.fire('click',target).stopped,true);
 assert.equal(f.fire('submit',{method:'dialog'}).stopped,true);assert.equal(f.closed,0);
 f.download.setAttribute('aria-busy','false');f.sync();assert.equal(f.dialog.headerClose.disabled,false);assert.equal(f.secondary.disabled,true);
 f.fire('cancel',f.dialog);assert.equal(f.closed,1);
});
test('focus trap wraps in both directions and direct cleanup can still close a busy modal',()=>{
 const f=fixture();f.download.focus();f.fire('keydown',f.dialog,'Tab');assert.equal(f.active,f.dialog.headerClose);
 const event={key:'Tab',shiftKey:true,preventDefault(){this.prevented=true;}};f.dialog.events.keydown(event);assert.equal(event.prevented,true);assert.equal(f.active,f.download);
 f.download.setAttribute('aria-busy','true');f.sync();f.dialog.close();assert.equal(f.closed,1);
});
