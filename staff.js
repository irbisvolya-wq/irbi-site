import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
let users=[],orders=[];
const money=x=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:2}).format(Number(x||0));
const msg=s=>$("#message").textContent=s;
const opt=(value,label)=>{const e=document.createElement("option");e.value=value;e.textContent=label;return e;};
function td(row,s){const e=document.createElement("td");e.textContent=s;row.append(e);return e;}
async function load(){
 const {data:{user},error:ue}=await db.auth.getUser();
 if(ue||!user){msg("Спочатку увійдіть через кабінет IRBI.");return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(pe||profile?.role!=="admin"){msg("Цей розділ доступний лише адміністратору.");return;}
 $("#content").classList.remove("hide");
 const [u,b,e]=await Promise.all([
  db.rpc("irbi_admin_accounts"),
  db.from("bookings").select("id,assigned_cleaner_id,scheduled_at,status").not("assigned_cleaner_id","is",null).order("scheduled_at",{ascending:false}).limit(200),
  db.from("cleaner_earnings").select("booking_id,cleaner_id,entry_type,amount,status").order("created_at",{ascending:false}).limit(100)
 ]);
 if(u.error||b.error||e.error){msg("Помилка завантаження: "+(u.error||b.error||e.error).message);return;}
 users=u.data||[];orders=b.data||[];
 $("#people").replaceChildren();
 for(const p of users){
 const tr=document.createElement("tr");td(tr,(p.full_name||"Без імені")+" · "+p.email);td(tr,p.role);
 const choice=document.createElement("select");
 for(const [v,t] of [["customer","Клієнт"],["cleaner","Клінер"],["dispatcher","Координатор"]])choice.append(opt(v,t));
 choice.value=p.role==="admin"?"customer":p.role;
 const control=document.createElement("td");control.append(choice);tr.append(control);
 const action=document.createElement("td"),btn=document.createElement("button");btn.className="btn btn-secondary";btn.textContent="Змінити";
 btn.disabled=p.role==="admin"||p.id===user.id;
 btn.onclick=async()=>{if(!confirm("Підтвердити зміну ролі користувача?"))return;btn.disabled=true;const {error}=await db.rpc("irbi_admin_set_staff_role",{p_user:p.id,p_role:choice.value});if(error){msg(error.message);btn.disabled=false;return;}await load();};
 action.append(btn);tr.append(action);$("#people").append(tr);
 }
 $("#booking").replaceChildren(...orders.map(b=>opt(b.id,b.id.slice(0,8)+" · "+new Date(b.scheduled_at).toLocaleDateString("uk-UA")+" · "+b.status)));
 $("#earnings").replaceChildren();
 for(const x of e.data||[]){const tr=document.createElement("tr");[x.booking_id.slice(0,8),users.find(p=>p.id===x.cleaner_id)?.full_name||x.cleaner_id.slice(0,8),x.entry_type,money(x.amount)+" ₴",x.status].forEach(y=>td(tr,y));$("#earnings").append(tr);}
 $("#payrollForm").querySelectorAll("button").forEach(x=>x.disabled=!orders.length);
 msg("Кабінет персоналу завантажено.");
}
$("#payrollForm").addEventListener("click",async e=>{
 const button=e.target.closest("button[data-action]");if(!button)return;
 const booking=orders.find(x=>x.id===$("#booking").value);
 const amount=Number($("#amount").value),action=button.dataset.action;
 if(!booking||!Number.isFinite(amount)||amount<0||(action==="approve"&&amount===0)){msg("Виберіть замовлення та коректну суму.");return;}
 if(action==="paid"&&!confirm("Кошти вже фактично виплачені працівнику?"))return;
 button.disabled=true;
 const {error}=await db.rpc("irbi_admin_payroll_action",{p_booking:booking.id,p_cleaner:booking.assigned_cleaner_id,p_entry_type:$("#type").value,p_amount:amount,p_action:action,p_note:$("#note").value.trim()||null});
 if(error){msg(error.message);button.disabled=false;return;}
 await load();
 msg(action==="paid"?"Виплату зафіксовано.":"Нарахування збережено.");
});
load().catch(e=>msg("Помилка: "+e.message));