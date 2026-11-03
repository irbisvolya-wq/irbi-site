import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=selector=>document.querySelector(selector);
const money=v=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:2}).format(Number(v||0));
let currentUser=null;
function message(text){$("#message").textContent=text;}
function cell(tr,value){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}
async function render(){
 const {data:{user},error:ue}=await db.auth.getUser();
 if(ue||!user){message("Увійдіть через кабінет IRBI.");return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(pe||profile?.role!=="admin"){message("Фінансова інформація доступна лише адміністратору IRBI.");return;}
 currentUser=user;$("#content").classList.remove("hide");
 const {data,error}=await db.from("irbi_booking_finance").select("booking_id,scheduled_at,status,booked_revenue,paid_revenue,material_cost,labor_cost,other_cost,planned_contribution,planned_margin_pct,missing_labor_amount,not_final").order("scheduled_at",{ascending:false}).limit(200);
 if(error){message("Помилка отримання звіту: "+error.message);return;}
 const orders=data||[];
 let revenue=0,paid=0,costs=0,contrib=0;
 $("#rows").replaceChildren();$("#booking").replaceChildren();
 for(const b of orders){
  const o=document.createElement("option");o.value=b.booking_id;o.textContent=b.booking_id.slice(0,8)+" · "+new Date(b.scheduled_at).toLocaleDateString("uk-UA");$("#booking").append(o);
  revenue+=Number(b.booked_revenue||0);paid+=Number(b.paid_revenue||0);
  costs+=Number(b.material_cost||0)+Number(b.labor_cost||0)+Number(b.other_cost||0);
  contrib+=Number(b.planned_contribution||0);
  const tr=document.createElement("tr");
  if(b.not_final||b.missing_labor_amount)tr.className="warn";
  [b.booking_id.slice(0,8),new Date(b.scheduled_at).toLocaleDateString("uk-UA"),b.status+(b.missing_labor_amount?" · зарплата не затверджена":""),money(b.booked_revenue),money(b.paid_revenue),money(b.material_cost),money(b.labor_cost),money(b.other_cost),money(b.planned_contribution),b.planned_margin_pct==null?"—":money(b.planned_margin_pct)+"%"].forEach(v=>cell(tr,v));
  $("#rows").append(tr);
 }
 $("#revenue").textContent=money(revenue);$("#paid").textContent=money(paid);
 $("#costs").textContent=money(costs);$("#contribution").textContent=money(contrib);
 message(orders.length?"Фінансовий звіт завантажено. Підсумки охоплюють лише показані замовлення.":"Замовлень поки немає.");
 $("#expenseForm").querySelector("button").disabled=!orders.length;
}
$("#expenseForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!currentUser)return;
 const button=e.currentTarget.querySelector("button");
 const amount=Number($("#amount").value),description=$("#description").value.trim();
 if(!Number.isFinite(amount)||amount<=0||description.length<3){message("Перевірте суму та пояснення.");return;}
 button.disabled=true;
 const {error}=await db.from("booking_expenses").insert({booking_id:$("#booking").value,category:$("#category").value,amount,description,recorded_by:currentUser.id});
 if(error){button.disabled=false;message("Не вдалося додати витрату: "+error.message);return;}
 $("#amount").value="";$("#description").value="";
 await render();button.disabled=false;
});
render().catch(e=>message("Помилка: "+e.message));