const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('finance.js','utf8');
const metrics=['monthJobs','monthSales','monthCash','monthDirect','monthFixed','monthResult','unitRevenue','unitDirect','unitContribution','unitOverhead','unitResult','unitMargin'];
function fixture(){
 const elements=Object.fromEntries([...metrics,'month','monthWarning'].map(id=>['#'+id,{textContent:'old',value:'2026-11'}]));
 const pending=[];
 const context=vm.createContext({monthlyRequest:0,monthlyMetrics:metrics,$:s=>elements[s],money:String,unitEconomics:()=>null,message:()=>{},renderExpenseJournal:async()=>{},db:{from:()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))})})})}});
 vm.runInContext(source.slice(source.indexOf('async function renderMonthly(){'),source.indexOf('$("#month").addEventListener')),context);
 return {elements,pending,run:()=>context.renderMonthly()};
}
function result(jobs){return {data:{jobs_completed:jobs,sales_value:jobs*100,cash_received:100,material_cost:0,labor_cost:0,direct_other_cost:0,operating_cost:0,operating_result:jobs*100},error:null};}
test('clears old month immediately and leaves no stale values on database error',async()=>{
 const f=fixture(),p=f.run();assert.equal(f.elements['#monthJobs'].textContent,'—');
 f.pending[0].resolve({data:null,error:{message:'offline'}});await p;
 for(const id of metrics)assert.equal(f.elements['#'+id].textContent,'—');
 assert.match(f.elements['#monthWarning'].textContent,/недоступний/);
});
test('latest month wins when responses arrive out of order',async()=>{
 const f=fixture(),old=f.run();f.elements['#month'].value='2026-10';const latest=f.run();
 f.pending[1].resolve(result(2));await latest;f.pending[0].resolve(result(9));await old;
 assert.equal(f.elements['#monthJobs'].textContent,2);
});
test('network rejection keeps report cleared and offers recovery',async()=>{
 const f=fixture(),p=f.run();f.pending[0].reject(new Error('network'));await p;
 assert.equal(f.elements['#monthSales'].textContent,'—');assert.match(f.elements['#monthWarning'].textContent,/Оновіть/);
});
test('invalid month cancels pending result',async()=>{
 const f=fixture(),old=f.run();f.elements['#month'].value='2026-13';await f.run();
 f.pending[0].resolve(result(9));await old;assert.equal(f.elements['#monthJobs'].textContent,'—');
 assert.match(f.elements['#monthWarning'].textContent,/Оберіть/);
});
