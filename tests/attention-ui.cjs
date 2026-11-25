const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('attention.js','utf8').replace(/^import[^\n]+\n/gm,'').replace(/\nrefresh\(\);\s*$/,'');
function fixture(role='admin',loader=async()=>({tasks:[],counts:{pending:0,unassigned:0,overdue:0,issues:0}})){
 const nodes={},listeners={},callbacks={};let loads=0;
 const node=()=>({textContent:'',value:'all',children:[],hidden:false,classList:{add(){},remove(){}},replaceChildren(...v){this.children=v;},append(...v){this.children.push(...v);},addEventListener(n,f){this.listeners??={};this.listeners[n]=f;}});
 const $=s=>nodes[s]??=node();
 const db={auth:{async getUser(){return {data:{user:{id:'staff'}}};},onAuthStateChange(fn){callbacks.auth=fn;}},from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:role===null?null:{role}};}};return q;}};
 const ctx=vm.createContext({createClient:()=>db,loadAttentionQueue:async(...args)=>{loads++;return loader(...args);},document:{querySelector:$,createElement:node,addEventListener(n,f){listeners[n]=f;}},Date,URLSearchParams,Object,setInterval(){},setTimeout(){}});vm.runInContext(source,ctx);
 return {$,callbacks,ctx,loads:()=>loads,refresh:()=>ctx.refresh()};
}
test('denied roles never load the operational queue',async()=>{for(const role of ['customer','cleaner',null]){const f=fixture(role);await f.refresh();assert.equal(f.loads(),0);assert.match(f.$('#status').textContent,/лише/);}});
test('queue failure clears counts and offers recovery instead of showing zero tasks',async()=>{const f=fixture('admin',async()=>{throw Error('offline');});await f.refresh();assert.equal(f.$('#pendingCount').textContent,'—');assert.match(f.$('#status').textContent,/невідома/);assert.equal(f.$('#tasks').children.length,0);});
test('sign-out invalidates a pending queue response',async()=>{let resolve;const pending=new Promise(r=>resolve=r),f=fixture('admin',()=>pending);const p=f.refresh();await new Promise(setImmediate);f.callbacks.auth();resolve({tasks:[],counts:{pending:9,unassigned:0,overdue:0,issues:0}});await p;assert.equal(f.$('#pendingCount').textContent,'—');assert.equal(f.$('#tasks').children.length,0);});
test('successful load shows counts and a confirmed empty-state message',async()=>{const f=fixture();await f.refresh();assert.equal(f.$('#pendingCount').textContent,0);assert.match(f.$('#tasks').children[0].textContent,/немає/);});
