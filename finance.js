import {unitEconomics} from "/finance-math.js?v=20261119-1";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=selector=>document.querySelector(selector);
const money=v=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:2}).format(Number(v||0));
let currentUser=null;
const today=new Date();
const isoLocalDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
$("#month").value=isoLocalDate(today).slice(0,7);
$("#operatingDate").value=isoLocalDate(today);
function message(text){$("#message").textContent=text;}
function cell(tr,value){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}
async function render(){
 currentUser=null;$("#content").classList.add("hide");
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
 await renderMonthly();
 $("#expenseForm").querySelector("button").disabled=!orders.length;
}
async function renderMonthly(){
 const period=$("#month").value;
 if(!/^\d{4}-\d{2}$/.test(period))return;
 const {data,error}=await db.from("irbi_monthly_finance").select("*").eq("month_start",period+"-01").maybeSingle();
 if(error){message("Місячний звіт недоступний: "+error.message);return;}
 if(!data){
  for(const id of ["monthJobs","monthSales","monthCash","monthDirect","monthFixed","monthResult","unitRevenue","unitDirect","unitContribution","unitOverhead","unitResult","unitMargin"])$("#"+id).textContent="Немає даних";
  $("#monthWarning").textContent="Звіт доступний за поточний місяць і 23 попередні.";
  await renderExpenseJournal().catch(()=>{$("#journalStatus").textContent="Не вдалося завантажити журнал. Оновіть сторінку.";});return;
 }
 const d=data;
 const unit=unitEconomics(data);
 for(const [id,key] of [["unitRevenue","averageRevenue"],["unitDirect","directPerJob"],["unitContribution","contributionPerJob"],["unitOverhead","overheadPerJob"],["unitResult","resultPerJob"],["unitMargin","margin"]]){
  const value=unit?.[key];$("#"+id).textContent=value==null?"Немає даних":money(value)+(key==="margin"?" %":" ₴")+(Number(d.incomplete_labor_jobs)>0?" · попередньо":"");
 }
 await renderExpenseJournal().catch(()=>{$("#journalStatus").textContent="Не вдалося завантажити журнал. Оновіть сторінку.";});
 $("#monthJobs").textContent=Number(d.jobs_completed||0);
 $("#monthSales").textContent=money(d.sales_value);
 $("#monthCash").textContent=money(d.cash_received);
 const direct=Number(d.material_cost||0)+Number(d.labor_cost||0)+Number(d.direct_other_cost||0);
 $("#monthDirect").textContent=money(direct);
 $("#monthFixed").textContent=money(d.operating_cost);
 $("#monthResult").textContent=money(d.operating_result);
 $("#monthWarning").textContent=Number(d.incomplete_labor_jobs||0)>0
 ?"Увага: "+d.incomplete_labor_jobs+" завершених замовлень мають незавершені нарахування. Результат попередній."
 :"Підсумок не враховує невнесені витрати та платежі.";
}
$("#month").addEventListener("change",()=>renderMonthly().catch(e=>message(e.message)));
$("#operatingForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!currentUser||e.currentTarget.querySelector("button").disabled)return;
 const btn=e.currentTarget.querySelector("button");
 const amount=Number($("#operatingAmount").value),description=$("#operatingDescription").value.trim();
 if(!Number.isFinite(amount)||amount<=0||description.length<3){message("Перевірте суму й опис витрати.");return;}
 btn.disabled=true;
 try{
 const {error}=await db.from("operating_expenses").insert({
 expense_date:$("#operatingDate").value,category:$("#operatingCategory").value,
 amount,description,recorded_by:currentUser.id
 });
 if(error){message("Не вдалося записати витрату: "+error.message);return;}
 $("#operatingAmount").value="";$("#operatingDescription").value="";
 await renderMonthly();message("Витрату бізнесу записано. Підсумки оновлено.");
 }catch{message("З’єднання перервано. Перед повторним внесенням перевірте журнал, щоб не записати витрату двічі.");}finally{btn.disabled=false;}
});
$("#expenseForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!currentUser||e.currentTarget.querySelector("button").disabled)return;
 const button=e.currentTarget.querySelector("button");
 const amount=Number($("#amount").value),description=$("#description").value.trim();
 if(!Number.isFinite(amount)||amount<=0||description.length<3){message("Перевірте суму та пояснення.");return;}
 button.disabled=true;
 try{
 const {error}=await db.from("booking_expenses").insert({booking_id:$("#booking").value,category:$("#category").value,amount,description,recorded_by:currentUser.id});
 if(error){button.disabled=false;message("Не вдалося додати витрату: "+error.message);return;}
 $("#amount").value="";$("#description").value="";
 await render();
 }catch{message("З’єднання перервано. Перевірте журнал перед повторним внесенням витрати.");}finally{button.disabled=false;}
});
const expenseCategories={rent:"Оренда",marketing:"Реклама",software:"Програмні сервіси",communications:"Зв’язок",administration:"Адміністративні",tax:"Податки",other:"Інше",transport:"Транспорт",equipment:"Використання обладнання"};
async function renderExpenseJournal(){
 const status=$("#journalStatus");status.textContent="Завантаження журналу…";
 const results=await Promise.all([
  db.from("operating_expenses").select("expense_date,category,amount,description").order("expense_date",{ascending:false}).limit(100),
  db.from("booking_expenses").select("booking_id,created_at,category,amount,description").order("created_at",{ascending:false}).limit(100)
 ]);
 for(const [index,result] of results.entries()){
  const root=$(index===0?"#operatingRows":"#directExpenseRows");root.replaceChildren();
  if(result.error){const tr=document.createElement("tr");cell(tr,"Журнал недоступний. Оновіть сторінку.");root.append(tr);continue;}
  for(const entry of result.data||[]){const tr=document.createElement("tr");
   const when=index===0?entry.expense_date:new Date(entry.created_at).toLocaleString("uk-UA");
   [when,...(index===1?[entry.booking_id.slice(0,8)]:[]),expenseCategories[entry.category]||entry.category,money(entry.amount),entry.description].forEach(v=>cell(tr,v));root.append(tr);
  }
  if(!result.data?.length){const tr=document.createElement("tr");cell(tr,"Витрат ще не внесено.");root.append(tr);}
 }
 status.textContent=results.some(r=>r.error)?"Частину журналу не вдалося завантажити.":"У кожному журналі показано до 100 останніх записів за весь час. Місячні підсумки вище рахуються окремо за обраний місяць.";
}
$("#refreshFinance").addEventListener("click",async event=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;try{await render();}catch{message("Не вдалося оновити звіт. Перевірте з’єднання.");}finally{button.disabled=false;}});
render().catch(e=>message("Помилка: "+e.message));