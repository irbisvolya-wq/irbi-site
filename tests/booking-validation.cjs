const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('booking.js','utf8').split('\n').slice(2).join('\n').replace(/init\(\)\.catch\(e=>message\(e.message\)\);\s*$/,'');
function setup(error=null){
 const nodes={},calls=[];
 const $=id=>nodes[id]??={value:'',checked:false,disabled:false,textContent:'',listeners:{},classList:{add(){},remove(){}},addEventListener(name,fn){this.listeners[name]=fn;}};
 const ctx=vm.createContext({document:{querySelector:$},location:{search:''},URLSearchParams,Intl,Date,Number,Object,Set,String,JSON,sessionStorage:{removeItem(){}},db:{rpc:async(name,args)=>{calls.push({name,args});return {data:'receipt',error};}}});
 vm.runInContext(source,ctx);
 for(const [id,value] of Object.entries({service:'regular',rooms:'2',scheduled:new Date(Date.now()+13*3600000).toISOString(),area:'50',bathrooms:'1',propertyType:'apartment',frequency:'once',address:'Test street 12',phone:'+380123456789'}))$('#'+id).value=value;
 $('#agreement').checked=true;
 return {ctx,$,calls,submit:()=>$('#requestForm').listeners.submit({preventDefault(){}})};
}
(async()=>{
 let count=0;
 for(const hours of [11,91*24]){
  const s=setup();s.$('#scheduled').value=new Date(Date.now()+hours*3600000).toISOString();await s.submit();assert.equal(s.calls.length,0);assert.match(s.$('#message').textContent,hours===11?/12 годин/:/90 днів/);count++;
 }
 const invalid=setup();invalid.$('#scheduled').value='invalid';await invalid.submit();assert.equal(invalid.calls.length,0);count++;
 const valid=setup();await valid.submit();assert.equal(valid.calls.length,1);assert.match(valid.$('#message').textContent,/збережено/);count++;
 const move=setup();move.$('#balcony').checked=true;move.$('#service').value='move';vm.runInContext('quote()',move.ctx);assert.equal(move.$('#balcony').checked,false);assert.equal(move.$('#balcony').disabled,true);await move.submit();assert.equal(move.calls[0].args.p_request.p_addons.balcony,false);move.$('#service').value='regular';vm.runInContext('quote()',move.ctx);assert.equal(move.$('#balcony').disabled,false);count++;
 for(const [error,expected] of [[{message:'Некоректна площа'},/Некоректна площа/],[{message:'customer_required'},/Увійдіть/],[{message:'private database detail'},/Не вдалося підтвердити/]]){
  const s=setup(error);await s.submit();assert.match(s.$('#message').textContent,expected);assert.equal(s.$('#send').disabled,false);count++;
 }
 console.log(`PASS: ${count} booking validation, pricing and error scenarios`);
})().catch(e=>{console.error(e);process.exitCode=1;});
