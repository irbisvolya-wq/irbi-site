import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
let role="",items=[],userId="";
const fmt=x=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:2}).format(Number(x||0));
function msg(s){$("#message").textContent=s;}
function option(v,label){const o=document.createElement("option");o.value=v;o.textContent=label;return o;}
async function load(){
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user){msg("Увійдіть до кабінету IRBI, щоб продовжити.");return;}
 userId=user.id;
 const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(pe||!["admin","dispatcher","cleaner"].includes(profile?.role)){msg("Доступ лише для працівників IRBI.");return;}
 role=profile.role;
 $("#content").classList.remove("hide");
 $("#adminOnly").classList.toggle("hide",role!=="admin");
 $("#priceEditor").classList.toggle("hide",role!=="admin");
 $("#reorder").classList.toggle("hide",role==="cleaner");
 $("#balances").classList.toggle("hide",role==="cleaner");
 $("#history").classList.toggle("hide",role==="cleaner");
 if(role!=="admin")$("#type").querySelectorAll("[data-admin]").forEach(el=>el.remove());
 const {data:materials,error:ie}=await db.from("inventory_items").select("id,name,unit,unit_cost,reorder_level,active").eq("active",true).order("name");
 if(ie){msg("Помилка завантаження матеріалів: "+ie.message);return;}
 items=materials||[];
 $("#item").replaceChildren(...items.map(i=>option(i.id,i.name+" ("+i.unit+")")));
 if(role==="admin"){$("#priceItem").replaceChildren(...items.map(i=>option(i.id,i.name+" ("+i.unit+")")));showItemPrice();}
 let bq=db.from("bookings").select("id,scheduled_at,status").order("scheduled_at",{ascending:false}).limit(100);
 if(role==="cleaner")bq=bq.eq("assigned_cleaner_id",userId);
 const {data:orders,error:be}=await bq;
 if(be){msg("Замовлення недоступні: "+be.message);return;}
 $("#booking").replaceChildren(option("","Оберіть замовлення"),...(orders||[]).map(o=>option(o.id,o.id.slice(0,8)+" · "+new Date(o.scheduled_at).toLocaleDateString("uk-UA")+" · "+o.status)));
 await refresh();
 msg("Доступ підтверджено. Дані актуальні на момент завантаження.");
}
async function refresh(){
 if(role==="cleaner")return;
 const [bal,mov,low]=await Promise.all([
 db.from("irbi_inventory_balance").select("name,unit,balance,reorder_level").order("name"),
 db.from("inventory_movements").select("id,created_at,item_id,movement_type,quantity,total_cost,booking_id").order("created_at",{ascending:false}).limit(100),
 db.from("irbi_inventory_reorder").select("name,unit,balance,reorder_quantity").order("name")
 ]);
 if(bal.error||mov.error||low.error){msg("Помилка завантаження складських даних.");return;}
 $("#reorderRows").replaceChildren();
 for(const x of low.data||[]){const tr=document.createElement("tr");[x.name,fmt(x.balance)+" "+x.unit,fmt(x.reorder_quantity)+" "+x.unit].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});$("#reorderRows").append(tr);}
 if(!(low.data||[]).length){const tr=document.createElement("tr");const td=document.createElement("td");td.colSpan=3;td.textContent="Немає матеріалів нижче мінімального залишку.";tr.append(td);$("#reorderRows").append(tr);}
 $("#balanceRows").replaceChildren();
 for(const x of bal.data||[]){const tr=document.createElement("tr");[x.name,fmt(x.balance)+" "+x.unit,fmt(x.reorder_level)+" "+x.unit].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});if(Number(x.balance)<Number(x.reorder_level))tr.style.background="#fff1eb";$("#balanceRows").append(tr);}
 $("#movementRows").replaceChildren();
 for(const x of mov.data||[]){const tr=document.createElement("tr");const item=items.find(i=>i.id===x.item_id);[new Date(x.created_at).toLocaleString("uk-UA"),item?.name||x.item_id,x.movement_type,fmt(x.quantity),fmt(x.total_cost),x.booking_id?.slice(0,8)||"—"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});$("#movementRows").append(tr);}
}
$("#movement").addEventListener("submit",async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector("button");const type=$("#type").value,booking=$("#booking").value,quantity=Number($("#qty").value);
 if(!items.length||!Number.isFinite(quantity)||quantity<=0||type==="use"&&!booking){msg("Оберіть матеріал, замовлення і додатну кількість.");return;}
 button.disabled=true;
 const {error}=await db.from("inventory_movements").insert({item_id:$("#item").value,booking_id:booking||null,movement_type:type,quantity,note:$("#note").value.trim()||null,recorded_by:userId});
 button.disabled=false;
 if(error){msg("Не вдалося зберегти: "+error.message);return;}
 $("#qty").value="";$("#note").value="";msg("Рух матеріалу збережено.");await refresh();
});
$("#newItem").addEventListener("submit",async e=>{
 e.preventDefault();if(role!=="admin")return;
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;
 const {error}=await db.from("inventory_items").insert({name:$("#name").value.trim(),category:$("#category").value,unit:$("#unit").value,unit_cost:Number($("#cost").value),reorder_level:Number($("#minimum").value)});
 btn.disabled=false;if(error){msg("Помилка: "+error.message);return;}
 msg("Матеріал додано.");$("#newItem").reset();await reloadMaterials();await refresh();
});

function showItemPrice(){
 const item=items.find(x=>x.id===$("#priceItem").value);
 if(!item)return;
 $("#newPrice").value=item.unit_cost;
 $("#newMinimum").value=item.reorder_level;
}
$("#priceItem").addEventListener("change",showItemPrice);
async function reloadMaterials(){
 const {data,error}=await db.from("inventory_items").select("id,name,unit,unit_cost,reorder_level,active").eq("active",true).order("name");
 if(error){msg("Помилка завантаження довідника: "+error.message);return;}
 items=data||[];
 $("#item").replaceChildren(...items.map(i=>option(i.id,i.name+" ("+i.unit+")")));
 if(role==="admin"){$("#priceItem").replaceChildren(...items.map(i=>option(i.id,i.name+" ("+i.unit+")")));showItemPrice();}
}
$("#editPrice").addEventListener("submit",async e=>{
 e.preventDefault();if(role!=="admin")return;
 const itemId=$("#priceItem").value,cost=Number($("#newPrice").value),min=Number($("#newMinimum").value);
 if(!itemId||!Number.isFinite(cost)||cost<0||!Number.isFinite(min)||min<0){msg("Перевірте ціну та мінімальний залишок.");return;}
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;
 const {error}=await db.from("inventory_items").update({unit_cost:cost,reorder_level:min}).eq("id",itemId);
 btn.disabled=false;
 if(error){msg("Не вдалося змінити параметри: "+error.message);return;}
 await reloadMaterials();await refresh();msg("Ціну та мінімальний залишок оновлено.");
});
load().catch(e=>msg("Помилка: "+e.message));