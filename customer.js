import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
const labels={pending:"Очікує підтвердження",confirmed:"Підтверджено",assigned:"Призначено клінера",accepted:"Клінер прийняв",en_route:"Клінер у дорозі",arrived:"Клінер на місці",in_progress:"Виконується",completed:"Завершено",cancelled:"Скасовано"};
const services={regular:"Підтримувальне",general:"Генеральне",move:"Заселення / виселення",repair:"Після ремонту"};
const date=v=>v?new Date(v).toLocaleString("uk-UA",{dateStyle:"medium",timeStyle:"short"}):"—";
const money=v=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:2}).format(Number(v||0))+" ₴";
const note=(text)=>{$("#customerHistoryMessage").textContent=text;};
const field=(parent,label,value)=>{
 const p=document.createElement("p");
 const b=document.createElement("strong");b.textContent=label+": ";
 p.append(b,document.createTextNode(String(value??"—")));parent.append(p);
};
let signedIn=false;
async function loadCustomer(){
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user){signedIn=false;hide();return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role,full_name,phone").eq("id",user.id).maybeSingle();
 if(pe||profile?.role!=="customer"){signedIn=false;hide();return;}
 signedIn=true;
 $("#customerProfilePanel").classList.remove("hidden");
 $("#customerHistoryPanel").classList.remove("hidden");
 $("#customerProfileName").value=profile.full_name||"";
 $("#customerProfilePhone").value=profile.phone||"";
 await loadHistory(user.id);
}
function hide(){
 $("#customerProfilePanel").classList.add("hidden");
 $("#customerHistoryPanel").classList.add("hidden");
 $("#customerHistory").replaceChildren();
}
async function loadHistory(userId){
 note("Завантаження заявок…");
 const {data,error}=await db.from("bookings")
 .select("id,service_type,status,scheduled_at,rooms,bathrooms,area_m2,property_type,address,apartment,entrance,floor,access_notes,contact_phone,total,frequency,cleaning_features,created_at,cancellation_reason")
 .eq("customer_id",userId).order("created_at",{ascending:false}).limit(100);
 if(error){note("Не вдалося завантажити історію: "+error.message);return;}
 const root=$("#customerHistory");root.replaceChildren();
 if(!data?.length){note("Заявок поки немає.");return;}
 note("Показано до 100 останніх заявок.");
 for(const b of data){
  const article=document.createElement("article");article.id="order-"+b.id;article.style.cssText="border:1px solid #d6e5dc;border-radius:12px;padding:14px;margin:12px 0";
  const details=document.createElement("details");
  const summary=document.createElement("summary");summary.style.cursor="pointer";
  summary.textContent=(services[b.service_type]||b.service_type||"Прибирання")+" · "+date(b.scheduled_at)+" · "+(labels[b.status]||b.status)+" · "+money(b.total);
  details.append(summary);
  const body=document.createElement("div");body.className="notice";
  field(body,"Номер",b.id.slice(0,8));
  field(body,"Статус",labels[b.status]||b.status);
  field(body,"Дата заявки",date(b.created_at));
  field(body,"Бажаний час",date(b.scheduled_at));
  field(body,"Адреса",[b.address,b.apartment?"кв. "+b.apartment:"",b.entrance?"під’їзд "+b.entrance:"",b.floor?"поверх "+b.floor:""].filter(Boolean).join(", "));
  field(body,"Телефон",b.contact_phone);
  field(body,"Кімнати / санвузли",(b.rooms??"—")+" / "+(b.bathrooms??"—"));
  field(body,"Площа",b.area_m2?b.area_m2+" м²":"—");
  field(body,"Примітки",b.access_notes||"—");
  field(body,"Періодичність",b.frequency==="once"?"Один раз":b.frequency||"—");
  const addons=b.cleaning_features?.requested_addons||{};
  const addonLabels={balcony:"Балкон",fridge:"Холодильник",oven:"Духовка",cabinets:"Шафи"};
  const chosen=Object.entries(addons).filter(([key,value])=>value===true&&addonLabels[key]).map(([key])=>addonLabels[key]);
  field(body,"Додаткові роботи",chosen.join(", ")||"—");
  if(b.cancellation_reason)field(body,"Причина скасування",b.cancellation_reason);
  const actions=document.createElement("div");actions.className="portal-actions";
  const again=document.createElement("a");again.className="btn btn-secondary";again.href="/booking.html?repeat="+encodeURIComponent(b.id);again.textContent="Повторити заявку";actions.append(again);
  if(b.status==="pending"){
   const cancel=document.createElement("button");cancel.type="button";cancel.className="btn btn-secondary";cancel.textContent="Скасувати запит";
   cancel.onclick=async()=>{
    if(!confirm("Скасувати заявку "+b.id.slice(0,8)+"?"))return;
    cancel.disabled=true;note("Скасовуємо заявку…");
    const {error}=await db.rpc("irbi_customer_cancel_request",{p_booking:b.id});
    if(error){note("Скасування не виконано: "+error.message);cancel.disabled=false;return;}
    window.location.reload();
   };
   actions.append(cancel);
  }
  body.append(actions);
  const chat=document.createElement("section");chat.style.cssText="margin-top:16px;border-top:1px solid #bed7c8;padding-top:12px";
  const chatHeading=document.createElement("h4");chatHeading.textContent="Повідомлення по заявці";chat.append(chatHeading);
  const chatStatus=document.createElement("p");chatStatus.setAttribute("role","status");
  const history=document.createElement("div");chat.append(chatStatus,history);
  const form=document.createElement("form"),input=document.createElement("textarea"),send=document.createElement("button");
  input.rows=3;input.maxLength=2000;input.required=true;input.placeholder="Ваше запитання команді IRBI";input.style.cssText="width:100%;max-width:100%;padding:10px";
  send.type="submit";send.className="btn btn-primary";send.textContent="Надіслати повідомлення";form.append(input,send);
  let chatRefreshVersion=0;
  async function refreshChat(){
   const version=++chatRefreshVersion;
   const {data,error}=await db.from("irbi_booking_messages").select("sender_id,audience,body,created_at").eq("booking_id",b.id).order("created_at",{ascending:false}).limit(100);
   if(version!==chatRefreshVersion)return;
   if(error){chatStatus.textContent=error.message;return;}
   history.replaceChildren();chatStatus.textContent=data?.length?"":"Повідомлень ще немає.";
   for(const m of (data||[]).reverse()){const p=document.createElement("p");p.style.cssText="padding:9px;border-radius:8px;background:#eaf4ed;margin:8px 0";p.textContent=(m.audience==="staff"?"Ви":"Команда IRBI")+" · "+date(m.created_at)+" — "+m.body;history.append(p);}
  }
  details.addEventListener("toggle",()=>{if(details.open)refreshChat();});
  form.addEventListener("submit",async e=>{
   e.preventDefault();if(!input.value.trim())return;send.disabled=true;
   const {error}=await db.rpc("irbi_send_booking_message",{p_booking:b.id,p_body:input.value.trim()});
   send.disabled=false;
   if(error){chatStatus.textContent="Помилка: "+error.message;return;}
   input.value="";await refreshChat();
  });
  chat.append(form);body.append(chat);
  details.append(body);article.append(details);root.append(article);
 }
}
$("#customerProfileForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!signedIn)return;
 const name=$("#customerProfileName").value.trim(),phone=$("#customerProfilePhone").value.trim();
 const button=e.currentTarget.querySelector('button[type="submit"]');
 button.disabled=true;
 const {error}=await db.rpc("irbi_customer_update_profile",{p_name:name,p_phone:phone});
 button.disabled=false;
 $("#customerProfileMessage").textContent=error?"Не вдалося зберегти: "+error.message:"Контактні дані оновлено.";
});
db.auth.onAuthStateChange(()=>setTimeout(()=>loadCustomer().catch(e=>note(e.message)),0));
loadCustomer().catch(e=>note(e.message));
