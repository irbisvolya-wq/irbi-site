const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
function fixture(responses){
 const elements={},handlers={},removed=[],calls=[];
 const values={service:'regular',rooms:'1',scheduled:'2026-12-15T10:00',address:'Test address 1',propertyType:'apartment',bathrooms:'1',area:'35',phone:'+380000000000',apartment:'',entrance:'',floor:'',notes:'',frequency:'once'};
 const $=s=>elements[s]??={value:values[s.slice(1)]||'',checked:s==='#agreement',disabled:false,textContent:'',classList:{add(){},remove(){}},addEventListener(t,f){handlers[s+':'+t]=f;}};
 const db={rpc:async(name,args)=>{calls.push({name,args});const r=responses.shift();if(r instanceof Error)throw r;return r;}};
 let source=fs.readFileSync('booking.js','utf8').replace(/^import[^\n]+\n/,'');source=source.replace(/init\(\)\.catch\(e=>message\(e.message\)\);\s*$/,'');
 const c=vm.createContext({createClient:()=>db,document:{querySelector:$},location:{search:''},URLSearchParams,sessionStorage:{removeItem:key=>removed.push(key)},console});vm.runInContext(source,c);vm.runInContext("requestToken='stable-token';requestTokenKey='receipt-key';activeDraftKey='draft-key';",c);
 return {calls,elements,removed,submit:()=>handlers['#requestForm:submit']({preventDefault(){}})};
}
test('uncertain result retries the same request ID and reports success',async()=>{const f=fixture([new Error('offline'),{data:'12345678-abcd',error:null}]);await f.submit();assert.match(f.elements['#message'].textContent,/Не вдалося підтвердити/);await f.submit();assert.equal(f.calls.length,2);assert.equal(f.calls[0].name,'irbi_customer_request_once');assert.equal(f.calls[0].args.p_request_id,f.calls[1].args.p_request_id);assert.deepEqual(f.calls[0].args.p_request,f.calls[1].args.p_request);assert.ok(f.removed.includes('receipt-key'));assert.match(f.elements['#receipt'].textContent,/12345678/);});
test('changed saved request directs customer to cabinet without clearing token',async()=>{const f=fixture([{error:{message:'request_changed'}}]);await f.submit();assert.match(f.elements['#message'].textContent,/уже збережено/);assert.equal(f.removed.length,0);assert.equal(f.elements['#send'].disabled,false);});
