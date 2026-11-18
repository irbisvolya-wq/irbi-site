import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
const pricing={regular:[1200,1500,1800,2200],general:[2500,3200,3900,4700],move:[2900,3700,4500,5400],repair:[3000,4000,5000,null]};
const money=x=>new Intl.NumberFormat("uk-UA").format(x)+" ₴";
const message=x=>$("#message").textContent=x;
const addonsList=["balcony","fridge","oven","cabinets"];
const requestParams=new URLSearchParams(location.search);
let submitting=false;
let activeDraftKey;

const draftFields=["service","rooms","propertyType","bathrooms","area","frequency"];
const draftLifetime=30*60*1000;
function draftKey(userId){
 return "irbi.booking.draft:"+userId+":"+requestParams.toString();
}
function restoreDraft(key){
 try{
  const draft=JSON.parse(sessionStorage.getItem(key));
  if(!draft)return false;
  if(!Number.isFinite(draft.updatedAt)||draft.updatedAt>Date.now()||Date.now()-draft.updatedAt>draftLifetime){
   sessionStorage.removeItem(key);
   return false;
  }
  if(!draft.fields||!draft.addons)return false;
  const fields=draft.fields;
  if(!Object.hasOwn(pricing,fields.service)||!/^[1-4]$/.test(fields.rooms)
   ||!["apartment","house","office","other"].includes(fields.propertyType)
   ||!["once","weekly","biweekly","monthly"].includes(fields.frequency)
   ||!/^([1-8])$/.test(fields.bathrooms)
   ||(fields.area!==""&&(!Number.isFinite(Number(fields.area))||Number(fields.area)<10||Number(fields.area)>1500)))return false;
  for(const field of draftFields)$("#"+field).value=fields[field];
  for(const addon of addonsList)$("#"+addon).checked=draft.addons[addon]===true;
  return true;
 }catch{return false;}
}
function saveDraft(key){
 try{
  const fields=Object.fromEntries(draftFields.map(field=>[field,$("#"+field).value]));
  const addons=Object.fromEntries(addonsList.map(addon=>[addon,$("#"+addon).checked]));
  sessionStorage.setItem(key,JSON.stringify({updatedAt:Date.now(),fields,addons}));
 }catch{}
}
function clearDraft(key){
 try{sessionStorage.removeItem(key);}catch{}
}

function applyCalculatorSelection(){
 const service=requestParams.get("service"),rooms=requestParams.get("rooms");
 if(!Object.hasOwn(pricing,service)||!/^[1-4]$/.test(rooms))return;
 $("#service").value=service;
 $("#rooms").value=rooms;
 for(const addon of addonsList)$("#"+addon).checked=requestParams.get(addon)==="1"&&(addon!=="balcony"||service!=="move");
}
function quote(){
 const service=$("#service").value,rooms=Number($("#rooms").value);
 const base=pricing[service]?.[rooms-1];
 if(base==null){$("#quote").textContent="Індивідуально";$("#send").disabled=true;$("#quoteNote").textContent="Для такого обсягу потрібно окремо узгодити вартість. Залиште контакт на головній сторінці.";return;}
 const addons=addonsList.reduce((acc,key)=>({...acc,[key]:$("#"+key).checked}),{});
 const price=base+(addons.balcony&&service!=="move"?300:0)+(addons.fridge?250:0)+(addons.oven?300:0)+(addons.cabinets?300:0);
 $("#quote").textContent=money(price);$("#quoteNote").textContent="Орієнтовно. Підтвердження потрібне перед виконанням.";
 $("#send").disabled=submitting;
}
["service","rooms",...addonsList].forEach(s=>$("#"+s).addEventListener("change",quote));
$("#requestForm").addEventListener("input",event=>{
 if(activeDraftKey&&[...draftFields,...addonsList].includes(event.target.id))saveDraft(activeDraftKey);
});
$("#requestForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(submitting||$("#send").disabled||!$("#agreement").checked)return;
 const dt=new Date($("#scheduled").value);
 if(!Number.isFinite(dt.getTime())){message("Оберіть коректну дату.");return;}
 if(dt.getTime()<Date.now()+12*3600*1000){message("Оберіть дату щонайменше за 12 годин.");return;}
 submitting=true;
 $("#send").disabled=true;
 message("Зберігаємо ваш запит…");
 const addons={};for(const key of addonsList)addons[key]=$("#"+key).checked;
 const args={p_service:$("#service").value,p_rooms:Number($("#rooms").value),p_scheduled_at:dt.toISOString(),p_address:$("#address").value.trim(),p_property_type:$("#propertyType").value,p_bathrooms:Number($("#bathrooms").value),p_area_m2:Number($("#area").value),p_phone:$("#phone").value.trim(),p_apartment:$("#apartment").value.trim(),p_entrance:$("#entrance").value.trim(),p_floor:$("#floor").value.trim(),p_access_notes:$("#notes").value.trim(),p_frequency:$("#frequency").value,p_addons:addons};
 try{
  const {data,error}=await db.rpc("irbi_customer_request",args);
  if(error)throw error;
  clearDraft(activeDraftKey);
  activeDraftKey=null;
  $("#content").classList.add("hide");$("#success").classList.remove("hide");
  $("#receipt").textContent="Номер запиту: "+String(data).slice(0,8);
  message("Запит збережено в IRBI.");
 }catch(err){
  message("Запит не збережено: "+(err.message||"Помилка з’єднання"));
  submitting=false;
  quote();
 }
});
async function init(){
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user){
  const loginHref="/portal.html?"+new URLSearchParams({next:location.pathname+location.search});
  $('main > p > a[href="/portal.html"]').href=loginHref;
  message("Щоб залишити запит, увійдіть або зареєструйтеся в IRBI.");
  const a=document.createElement("a");
  a.href=loginHref;
  a.textContent="Увійти або зареєструватися";
  a.className="btn btn-primary";
  $("#message").after(a);
  return;
 }
 const {data:profile,error:pe}=await db.from("profiles").select("role,phone").eq("id",user.id).maybeSingle();
 if(pe||profile?.role!=="customer"){message("Запити на прибирання оформлюються з клієнтського кабінету.");return;}
 $("#phone").value=profile?.phone||"";
 applyCalculatorSelection();
 const repeatId=requestParams.get("repeat");
 let requestMessage="Заповніть дані для запиту.";
 if(repeatId){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repeatId)){message("Некоректний номер повторюваної заявки.");return;}
  const {data:previous,error:repeatError}=await db.from("bookings")
   .select("service_type,rooms,property_type,bathrooms,area_m2,address,apartment,entrance,floor,access_notes,contact_phone,frequency,cleaning_features")
   .eq("id",repeatId).eq("customer_id",user.id).maybeSingle();
  if(repeatError||!previous){requestMessage="Попередню заявку не знайдено. Можна оформити нову вручну.";}
  else {
   const fields={service:previous.service_type,rooms:previous.rooms,propertyType:previous.property_type,bathrooms:previous.bathrooms,area:previous.area_m2,address:previous.address,apartment:previous.apartment,entrance:previous.entrance,floor:previous.floor,notes:previous.access_notes,phone:previous.contact_phone,frequency:previous.frequency};
   for(const [key,value] of Object.entries(fields)){if(value!==null&&value!==undefined&&$("#"+key))$("#"+key).value=String(value);}
   for(const key of addonsList)$("#"+key).checked=previous.cleaning_features?.requested_addons?.[key]===true;
   requestMessage="Дані попередньої заявки перенесено. Оберіть нові дату й час.";
  }
 }
 activeDraftKey=draftKey(user.id);
 if(restoreDraft(activeDraftKey))requestMessage="Відновлено параметри прибирання. Перевірте адресу й оберіть дату та час.";
 $("#content").classList.remove("hide");message(requestMessage);
 const tomorrow=new Date(Date.now()+12*3600*1000+60000);const local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000);
 $("#scheduled").min=local.toISOString().slice(0,16);quote();
}
init().catch(e=>message(e.message));