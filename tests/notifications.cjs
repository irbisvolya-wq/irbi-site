const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const elements={};class Node{constructor(){this.children=[];this.style={};this.textContent='';this.hidden=false;this.classList={add:()=>this.hidden=true,remove:()=>this.hidden=false};}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(){}}
 const $=s=>elements[s]??=new Node();const pending=[];let user={id:'customer-a'},write=async()=>({error:null}),writes=0;
 const db={auth:{getUser:async()=>({data:{user}})},from:table=>{
  if(table==='profiles')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'customer'}})})})};
  return {select:()=>({eq:()=>({order:()=>({limit:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))})})}),update:()=>{writes++;const query={eq:()=>query,is:()=>query,select:()=>write()};return query;}};
 }};
 const ctx=vm.createContext({createClient:()=>db,document:{querySelector:$,createElement:()=>new Node()},Date,CSS:{escape:s=>s}});
 let source=fs.readFileSync('notifications.js','utf8').replace(/^import[^\n]+\n/,'');source=source.slice(0,source.indexOf('$("#refreshNotifications")'));
 vm.runInContext(source,ctx);
 return {$,pending,run:()=>ctx.refresh(),logout:()=>user=null,setWrite:fn=>write=fn,writes:()=>writes,button:()=>$('#notificationRows').children[0].children.find(n=>n.textContent==='Прочитано')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const notification={id:'n1',title:'Запит',body:'Отримано',created_at:'2026-11-19',read_at:null};
async function loaded(){const f=fixture(),p=f.run();await tick();f.pending[0].resolve({data:[notification]});await p;return f;}
test('logout clears notifications and stale response cannot restore them',async()=>{
 const f=fixture(),old=f.run();await tick();f.logout();await f.run();f.pending[0].resolve({data:[notification]});await old;
 assert.equal(f.$('#customerInbox').hidden,true);assert.equal(f.$('#notificationRows').children.length,0);assert.equal(f.$('#unreadCount').textContent,'');
});
test('network failure restores read button and explains uncertain result',async()=>{
 const f=await loaded();f.setWrite(async()=>{throw Error('offline');});const b=f.button();await b.onclick();assert.equal(b.disabled,false);assert.match(f.$('#notificationStatus').textContent,/перевірте статус/);
});
test('duplicate read clicks issue one update and recover after database error',async()=>{
 const f=await loaded();let resolve;f.setWrite(()=>new Promise(r=>resolve=r));const b=f.button(),p=b.onclick();await b.onclick();assert.equal(f.writes(),1);resolve({error:{message:'error'}});await p;assert.equal(b.disabled,false);
});
test('already-read notification refreshes list rather than reporting false failure',async()=>{
 const f=await loaded();f.setWrite(async()=>({data:[],error:null}));const p=f.button().onclick();await tick();f.pending[1].resolve({data:[{...notification,read_at:'2026-11-19'}]});await p;assert.equal(f.button(),undefined);assert.equal(f.$('#unreadCount').textContent,'');
});
