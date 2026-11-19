import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s),money=n=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n)+' ₴';
let orders=[],busy=false,attempt=null;
const now=new Date();$('#paidAt').value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
function showBalance(){const b=orders.find(b=>b.booking_id===$('#booking').value);$('#balance').textContent=b?'Вартість: '+money(b.booked_revenue)+' · Отримано: '+money(b.paid_revenue)+' · Залишок: '+money(Number(b.booked_revenue)-Number(b.paid_revenue)):'';}
async function load(){
 $('#content').hidden=true;
 const {data:{user},error:ae}=await db.auth.getUser();if(ae||!user){$('#status').textContent='Увійдіть у кабінет IRBI.';return;}
 const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();
 if(pe||profile?.role!=='admin'){$('#status').textContent='Доступ лише для адміністратора.';return;}
 const list=[];for(let start=0;;start+=500){const {data,error}=await db.from('irbi_booking_finance').select('booking_id,booked_revenue,paid_revenue,scheduled_at').eq('status','completed').order('scheduled_at',{ascending:false}).order('booking_id',{ascending:false}).range(start,start+499);if(error||!Array.isArray(data))throw Error('load');list.push(...data);if(data.length<500)break;}
 orders=list.filter(b=>Number(b.booked_revenue)>Number(b.paid_revenue));
 const old=$('#booking').value;$('#booking').replaceChildren();for(const b of orders){const o=document.createElement('option');o.value=b.booking_id;o.textContent=b.booking_id.slice(0,8)+' · '+new Date(b.scheduled_at).toLocaleDateString('uk-UA');$('#booking').append(o);}if(orders.some(b=>b.booking_id===old))$('#booking').value=old;showBalance();$('#save').disabled=!orders.length;
 const {data,error}=await db.from('payment_records').select('booking_id,amount,status,method,paid_at,recording_note').order('created_at',{ascending:false}).limit(100);if(error)throw error;
 $('#rows').replaceChildren();for(const p of data||[]){const tr=document.createElement('tr');for(const value of [p.booking_id.slice(0,8),money(p.amount),{paid:'Отримано',refunded:'Повернено',partially_refunded:'Частково повернено',processing:'Обробляється',awaiting_payment:'Очікується',not_requested:'Не запитано',failed:'Помилка',void:'Скасовано'}[p.status]||p.status,{cash:'Готівка',bank_transfer:'Переказ',provider:'Онлайн'}[p.method]||'—',p.paid_at?new Date(p.paid_at).toLocaleString('uk-UA'):'—',p.recording_note||'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('#rows').append(tr);}
 $('#content').hidden=false;$('#status').textContent='Дані оновлено. Суми до оплати показано за завершеними замовленнями.';
}
$('#booking').onchange=showBalance;
$('#refresh').onclick=()=>load().catch(()=>$('#status').textContent='Не вдалося оновити дані. Повторіть спробу.');
$('#paymentForm').onsubmit=async e=>{
 e.preventDefault();if(busy||!e.currentTarget.reportValidity())return;
 const date=new Date($('#paidAt').value);if(!Number.isFinite(date.getTime()))return;
 const payload={p_booking:$('#booking').value,p_amount:Number($('#amount').value),p_method:$('#method').value,p_paid_at:date.toISOString(),p_note:$('#note').value.trim()};
 if(attempt&&JSON.stringify(attempt.payload)!==JSON.stringify(payload)){$('#status').textContent='Попередню спробу ще не звірено. Відновіть її дані й повторіть або перевірте журнал перед новим записом.';return;}
 attempt??={id:crypto.randomUUID(),payload};busy=true;$('#save').disabled=true;
 try{const {error}=await db.rpc('irbi_record_manual_payment',{p_request:attempt.id,...attempt.payload});if(error)throw error;attempt=null;$('#amount').value='';$('#note').value='';$('#confirmed').checked=false;try{await load();$('#status').textContent='Отриману оплату записано.';}catch{$('#status').textContent='Оплату записано. Оновіть журнал; повторно вносити її не потрібно.';}}
 catch(error){const known={admin_required:'Доступ лише для адміністратора.',invalid_payment:'Перевірте суму, дату та пояснення.',completed_booking_required:'Потрібне завершене замовлення.',payment_exceeds_balance:'Сума перевищує залишок до оплати. Оновіть дані.',payment_reconciliation_required:'Спочатку звірте онлайн-платежі або повернення.',payment_request_changed:'Цей запис уже внесено з іншими даними. Перевірте журнал.'};if(known[error.message]){attempt=null;$('#status').textContent=known[error.message];}else $('#status').textContent='Збереження не підтверджено. Повторіть із тими самими даними; номер спроби збережено до закриття сторінки.';}
 finally{busy=false;$('#save').disabled=!orders.length;}
};
load().catch(()=>$('#status').textContent='Не вдалося завантажити платежі. Повторіть спробу.');
