const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const handlers={},elements={};
 for(const id of ['booking','messages','orderDetails','status','reply','replyForm','reload'])elements['#'+id]={value:'',textContent:'',disabled:false,replaceChildren(){this.textContent='';},append(){},addEventListener(type,fn){handlers[id+':'+type]=fn;}};
 const button={disabled:false};elements['#replyForm'].querySelector=()=>button;
 elements['#booking'].value='order-a';elements['#reply'].value='Вітаємо';
 let rpcCount=0;const pending=[];
 const db={rpc:async()=>{rpcCount++;return {error:null};},from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))})})})})};
 const context=vm.createContext({createClient:()=>db,document:{querySelector:s=>elements[s],createElement:()=>({})},console});
 const source=fs.readFileSync('messages.js','utf8').replace(/^import[^\n]+\n/,'').replace(/load\(\)\.catch\(e=>info\(e.message\)\);\s*$/,'');
 vm.runInContext(source,context);
 return {elements,pending,handlers,button,refresh:()=>context.refresh(),rpcCount:()=>rpcCount,submit:()=>handlers['replyForm:submit']({preventDefault(){},currentTarget:elements['#replyForm']})};
}
test('clears previous conversation on reload and displays query failure in chat',async()=>{
 const f=fixture();f.elements['#messages'].textContent='old chat';const p=f.refresh();
 assert.match(f.elements['#messages'].textContent,/Завантажуємо/);
 f.pending[0].resolve({error:{message:'offline'}});assert.equal(await p,false);
 assert.match(f.elements['#messages'].textContent,/Не вдалося/);
});
test('saved reply remains successful when chat refresh fails and duplicate submit is ignored',async()=>{
 const f=fixture(),p=f.submit();await Promise.resolve();await f.submit();assert.equal(f.rpcCount(),1);
 f.pending[0].reject(new Error('network'));await p;
 assert.match(f.elements['#status'].textContent,/Відповідь збережено/);
 assert.equal(f.elements['#reply'].value,'');assert.equal(f.button.disabled,false);
});
test('out of order response cannot replace current conversation',async()=>{
 const f=fixture(),a=f.refresh();f.elements['#booking'].value='order-b';const b=f.refresh();
 f.pending[1].resolve({data:[],error:null});await b;
 f.pending[0].resolve({error:{message:'old failure'}});await a;
 assert.equal(f.elements['#messages'].textContent,'Повідомлень за цією заявкою немає.');
});
test('no selected order clears conversation and order heading',async()=>{
 const f=fixture();f.elements['#booking'].value='';f.elements['#orderDetails'].textContent='old';
 assert.equal(await f.refresh(),true);assert.equal(f.elements['#orderDetails'].textContent,'');assert.equal(f.pending.length,0);
});
