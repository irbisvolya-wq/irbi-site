import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
const pricing={regular:[1200,1500,1800,2200],general:[2500,3200,3900,4700],move:[2900,3700,4500,5400],repair:[3000,4000,5000,null]};
const money=x=>new Intl.NumberFormat("uk-UA").format(x)+" ₴";
const message=x=>$("#message").textContent=x;
function quote(){
 const service=$("#service").value,rooms=Number($("#rooms").value);
 const base=pricing[service]?.[rooms-1];
 if(base==null){$("#quote").textContent="Індивідуально";$("#send").disabled=true;$("#quoteNote").textContent="Для такого обсягу потрібно окремо узгодити вартість. Залиште контакт на головній сторінці.";return;}
 const addons=["balcony","fridge","oven","cabinets"].reduce((acc,key)=>({...acc,[key]:$("#"+key).checked}),{});
 const price=base+(addons.balcony&&service!=="move"?300:0)+(addons.fridge?250:0)+(addons.oven?300:0)+(addons.cabinets?300:0);
 $("#quote").textContent=money(price);$("#quoteNote").textContent="Орієнтовно. Підтвердження потрібне перед виконанням.";
 $("#send").disabled=false;
}
["service","rooms","balcony","fridge","oven","cabinets"].forEach(s=>$("#"+s).addEventListener("change",quote));
$("#requestForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!$("#agreement").checked)return;
 const dt=new Date($("#scheduled").value);
 if(!Number.isFinite(dt.getTime())){message("Оберіть коректну дату.");return;}
 if(dt.getTime()<Date.now()+12*3600*1000){message("Оберіть дату щонайменше за 12 годин.");return;}
 const btn=$("#send");btn.disabled=true;message("Зберігаємо ваш запит…");
 const addons={};for(const key of ["balcony","fridge","oven","cabinets"])addons[key]=$("#"+key).checked;
 const args={p_service:$("#service").value,p_rooms:Number($("#rooms").value),p_scheduled_at:dt.toISOString(),p_address:$("#address").value.trim(),p_property_type:$("#propertyType").value,p_bathrooms:Number($("#bathrooms").value),p_area_m2:Number($("#area").value),p_phone:$("#phone").value.trim(),p_apartment:$("#apartment").value.trim(),p_entrance:$("#entrance").value.trim(),p_floor:$("#floor").value.trim(),p_access_notes:$("#notes").value.trim(),p_frequency:$("#frequency").value,p_addons:addons};
 try{
  const {data,error}=await db.rpc("irbi_customer_request",args);
  if(error)throw error;
  $("#content").classList.add("hide");$("#success").classList.remove("hide");
  $("#receipt").textContent="Номер запиту: "+String(data).slice(0,8);
  message("Запит збережено в IRBI.");
 }catch(err){message("Запит не збережено: "+(err.message||"Помилка з’єднання"));btn.disabled=false;}
});
async function init(){
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user){message("Щоб залишити запит, увійдіть або зареєструйтеся в IRBI.");const a=document.createElement("a");a.href="/portal.html";a.textContent="Увійти або зареєструватися";a.className="btn btn-primary";$("#message").after(a);return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role,phone").eq("id",user.id).maybeSingle();
 if(pe||profile?.role!=="customer"){message("Запити на прибирання оформлюються з клієнтського кабінету.");return;}
 $("#phone").value=profile?.phone||"";
 $("#content").classList.remove("hide");message("Заповніть дані для запиту.");
 const tomorrow=new Date(Date.now()+48*3600*1000);const local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000);
 $("#scheduled").min=local.toISOString().slice(0,16);quote();
}
init().catch(e=>message(e.message));