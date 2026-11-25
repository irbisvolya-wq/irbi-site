import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const {buildAttentionTasks,loadAttentionQueue}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('attention-data.js','utf8')).toString('base64'));
const now=new Date('2026-11-25T12:00:00Z');
const booking=(id,status,extra={})=>({id,status,service_type:'regular',scheduled_at:'2026-11-26T12:00:00Z',...extra});
test('queue identifies new requests, unstaffed orders and delayed work without flagging future work',()=>{
 const tasks=buildAttentionTasks([
  booking('new','pending'),booking('unassigned','confirmed'),booking('staffed','confirmed',{assigned_cleaner_id:'c'}),
  booking('late','accepted',{scheduled_at:'2026-11-25T11:00:00Z'}),booking('future','assigned'),
  booking('overrun','in_progress',{scheduled_end_at:'2026-11-25T11:00:00Z'}),
  booking('ongoing','in_progress',{scheduled_end_at:'2026-11-25T13:00:00Z'}),booking('done','completed'),booking('cancelled','cancelled')
 ],[],now);
 assert.deepEqual(tasks.map(t=>t.bookingId).sort(),['late','new','overrun','unassigned']);
 assert.equal(tasks.find(t=>t.bookingId==='late').kind,'overdue');assert.equal(tasks.find(t=>t.bookingId==='new').kind,'pending');
});
test('past preferred and confirmed times receive clear follow-up messages',()=>{
 const rows=buildAttentionTasks([booking('p','pending',{scheduled_at:'2026-11-20T11:00:00Z'}),booking('c','confirmed',{scheduled_at:'2026-11-20T11:00:00Z'})],[],now);
 assert.match(rows[0].reason,/минув/);assert.match(rows[1].reason,/минув/);assert.equal(rows[0].priority,1);
});
test('safety issues appear first; resolved issues remain visible until closed',()=>{
 const tasks=buildAttentionTasks([booking('p','pending')],[
  {id:'s',booking_id:'b',category:'safety',status:'open',created_at:now.toISOString()},
  {id:'r',booking_id:'b',category:'quality',status:'resolved',created_at:now.toISOString()},
  {id:'c',booking_id:'b',category:'quality',status:'closed',created_at:now.toISOString()}
 ],now);assert.equal(tasks[0].id,'issue:s');assert.equal(tasks.at(-1).id,'issue:r');assert.equal(tasks.length,3);
});
function fixture(bookings,issues,failAt=null){
 const calls=[];return {calls,db:{from(table){const q={select(){return q;},in(...v){calls.push({table,filter:v});return q;},order(){return q;},async range(a,b){calls.push({table,range:[a,b]});if(failAt?.table===table&&failAt.offset===a)return {error:Error('offline')};return {data:(table==='bookings'?bookings:issues).slice(a,b+1)};}};return q;}}};
}
test('loads every page from both orders and issues and counts all tasks',async()=>{
 const f=fixture(Array.from({length:1201},(_,i)=>booking(String(i),'pending')),Array.from({length:501},(_,i)=>({id:String(i),booking_id:'b',status:'open',category:'quality',created_at:now.toISOString()})));
 const r=await loadAttentionQueue(f.db,'dispatcher',now);assert.equal(r.counts.pending,1201);assert.equal(r.counts.issues,501);
 assert.deepEqual(f.calls.filter(c=>c.table==='bookings'&&c.range).map(c=>c.range),[[0,499],[500,999],[1000,1499]]);
 assert.deepEqual(f.calls.filter(c=>c.table==='booking_issues'&&c.range).map(c=>c.range),[[0,499],[500,999]]);
});
test('a later page failure rejects the snapshot instead of showing partial counts',async()=>{
 const f=fixture(Array.from({length:501},(_,i)=>booking(String(i),'pending')),[],{table:'bookings',offset:500});await assert.rejects(loadAttentionQueue(f.db,'admin',now),/offline/);
});
test('customers, cleaners and missing profiles cannot request the staff queue',async()=>{
 for(const role of ['customer','cleaner',null,undefined,'unknown']){const f=fixture([],[]);await assert.rejects(loadAttentionQueue(f.db,role,now),/staff_required/);assert.equal(f.calls.length,0);}
});
test('empty queues are valid only after both sources load successfully',async()=>{const f=fixture([],[]);const r=await loadAttentionQueue(f.db,'admin',now);assert.deepEqual(r.counts,{pending:0,unassigned:0,overdue:0,issues:0});});
test('invalid timestamps reject classification',()=>assert.throws(()=>buildAttentionTasks([],[],'invalid'),/invalid_time/));
