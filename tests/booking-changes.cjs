const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('booking-changes.js','utf8').replace(/export /g,'');
const base={id:'12345678-1234-1234-1234-123456789012',status:'assigned',assigned_cleaner_id:'cleaner',scheduled_at:new Date(Date.now()+86400000).toISOString(),duration_minutes:120,updated_at:'2026-11-25T12:00:00Z'};
function fixture(rpc=async()=>({error:null}),refresh=async()=>{}){
 const nodes=[],calls=[];
 class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.value='';this.className='';this.disabled=false;nodes.push(this);}append(...ns){for(const n of ns){n.parent=this;this.children.push(n);}}setAttribute(){}reportValidity(){return true;}querySelector(selector){const cls=selector.slice(1);return nodes.find(n=>n.className.split(' ').includes(cls)&&n.parent&&!n.removed)||null;}remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 let seq=0;const ctx=vm.createContext({document:{createElement:tag=>new Node(tag)},crypto:{randomUUID:()=>`receipt-${++seq}`},Date,Intl,Number,Object,Set,JSON,console});vm.runInContext(source,ctx);const block=new Node('section');
 const mount=(booking=base,role='dispatcher',userId='staff')=>ctx.mountBookingChanges({db:{rpc:async(...args)=>{calls.push(args);return rpc(...args);}},booking,role,userId,cleaners:[{id:'cleaner',full_name:'First'},{id:'other',full_name:'Other'}],block,refresh});
 const open=(label='Скасувати замовлення')=>{nodes.find(n=>n.tag==='button'&&n.textContent===label).onclick();const form=nodes.filter(n=>n.tag==='form').at(-1);const reason=nodes.filter(n=>n.tag==='textarea').at(-1);reason.value='Reason recorded';return {form,reason,submit:()=>form.onsubmit({preventDefault(){}}),info:form.children.at(-1)};};
 return {ctx,nodes,calls,mount,open};
}
test('only assigned cleaner may decline; customers and closed or departed work have no actions',()=>{
 const f=fixture(),available=(b,r,u)=>Array.from(f.ctx.availableBookingChanges(b,r,u));
 assert.deepEqual(available(base,'cleaner','cleaner'),['decline']);assert.deepEqual(available(base,'cleaner','other'),[]);assert.deepEqual(available(base,'customer','customer'),[]);
 for(const status of ['en_route','in_progress','completed','cancelled'])assert.deepEqual(available({...base,status},'admin','a'),[]);
 assert.deepEqual(available({...base,departed_at:'now'},'admin','a'),[]);
});
test('pending requests offer cancellation and confirmed requests offer rescheduling',()=>{
 const f=fixture();assert.deepEqual(Array.from(f.ctx.availableBookingChanges({...base,status:'pending'},'dispatcher','s')),['cancel']);
 assert.deepEqual(Array.from(f.ctx.availableBookingChanges({...base,status:'confirmed',assigned_cleaner_id:null},'admin','s')),['reschedule','cancel']);
});
test('uncertain retry reuses exactly the same receipt and payload',async()=>{
 let count=0;const f=fixture(async()=>{if(++count===1)throw Error('offline');return {error:null};});f.mount();const ui=f.open();await ui.submit();assert.match(ui.info.textContent,/не підтверджено/);await ui.submit();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.match(ui.info.textContent,/збережено/);
});
test('changed payload after uncertain response is blocked until reconciliation',async()=>{
 const f=fixture(async()=>{throw Error('offline');});f.mount();const ui=f.open();await ui.submit();ui.reason.value='Different reason';await ui.submit();assert.equal(f.calls.length,1);assert.match(ui.info.textContent,/не звірено/);
});
test('repeated submit while saving sends one request and restores controls',async()=>{
 let done;const f=fixture(()=>new Promise(r=>done=r));f.mount();const ui=f.open(),p=ui.submit();await ui.submit();assert.equal(f.calls.length,1);assert.equal(ui.reason.disabled,true);done({error:null});await p;assert.equal(ui.reason.disabled,false);
});
test('known schedule conflict allows corrected parameters with a new receipt',async()=>{
 const f=fixture(async()=>({error:{code:'23P01'}}));f.mount();const ui=f.open();await ui.submit();assert.match(ui.info.textContent,/вже є замовлення/);ui.reason.value='Corrected reason';await ui.submit();assert.equal(f.calls.length,2);assert.notEqual(f.calls[0][1].p_request,f.calls[1][1].p_request);
});
test('saved change is not reported as failed when refreshing the cabinet rejects',async()=>{
 const f=fixture(async()=>({error:null}),async()=>{throw Error('offline');});f.mount();const ui=f.open();await ui.submit();assert.match(ui.info.textContent,/Зміну збережено/);assert.equal(ui.reason.disabled,false);
});
test('rescheduling carries expected row version and explicit duration',async()=>{
 const f=fixture();f.mount();const ui=f.open('Перенести час');await ui.submit();const args=f.calls[0][1];assert.equal(args.p_action,'reschedule');assert.equal(args.p_duration_minutes,120);assert.equal(args.p_expected_updated_at,base.updated_at);assert.equal(args.p_cleaner,null);
});
test('reassignment excludes the current cleaner from selectable choices',async()=>{
 const f=fixture();f.mount();const ui=f.open('Змінити клінера');const options=f.nodes.filter(n=>n.tag==='option');assert.deepEqual(options.map(n=>n.value),['','other']);const select=f.nodes.find(n=>n.tag==='select');select.value='other';await ui.submit();assert.equal(f.calls[0][1].p_cleaner,'other');assert.equal(f.calls[0][1].p_scheduled_at,null);
});
