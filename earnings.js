import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n)+' ₴';
const statuses={draft:'Очікує погодження',approved:'Погоджено, до виплати',paid:'Виплачено',void:'Скасовано'};
const types={cleaning:'Прибирання',transport:'Дорога',bonus:'Бонус',adjustment:'Коригування'};
async function load(){
 $('#content').hidden=true;$('#status').textContent='Завантажуємо…';
 const {data:{user},error:ae}=await db.auth.getUser();
 if(ae||!user){$('#status').textContent='Спочатку увійдіть у кабінет IRBI.';return;}
 const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();
 if(pe||profile?.role!=='cleaner'){$('#status').textContent='Розділ доступний клінерам.';return;}
 const entries=[];
 for(let start=0;;start+=500){
  const {data,error}=await db.from('cleaner_earnings').select('id,booking_id,entry_type,amount,currency,status,basis_note,paid_at,created_at').eq('cleaner_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+499);
  if(error||!Array.isArray(data))throw new Error('earnings_unavailable');
  entries.push(...data);if(data.length<500)break;
 }
 let approved=0,paid=0,pending=0;$('#rows').replaceChildren();
 for(const e of entries){
  if(e.status==='draft')pending++;
  if(e.amount!==null&&e.currency==='UAH'){if(e.status==='approved')approved+=Number(e.amount);if(e.status==='paid')paid+=Number(e.amount);}
  const tr=document.createElement('tr');
  for(const value of [e.booking_id.slice(0,8),types[e.entry_type]||e.entry_type,e.amount===null?'Не погоджено':money(Number(e.amount)),statuses[e.status]||e.status,e.paid_at?new Date(e.paid_at).toLocaleString('uk-UA'):'—',e.basis_note||'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('#rows').append(tr);
 }
 $('#approved').textContent=money(approved);$('#paid').textContent=money(paid);$('#pending').textContent=pending;
 $('#content').hidden=false;$('#status').textContent=entries.length?'Дані за весь час. Чернетки не входять до суми до виплати.':'Нарахувань поки немає.';
}
$('#refresh').onclick=async()=>{const b=$('#refresh');if(b.disabled)return;b.disabled=true;try{await load();}catch{$('#status').textContent='Не вдалося завантажити нарахування. Повторіть спробу.';}finally{b.disabled=false;}};
load().catch(()=>$('#status').textContent='Не вдалося завантажити нарахування. Повторіть спробу.');
