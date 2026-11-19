import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
let refreshVersion=0;
function clearInbox(){
 $("#customerInbox").classList.add("hidden");
 $("#notificationRows").replaceChildren();
 $("#unreadCount").textContent="";
 $("#notificationStatus").textContent="";
}
function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
async function refresh(){
 const version=++refreshVersion;
 clearInbox();
 try{
 const {data:{user},error:authError}=await db.auth.getUser();
 if(version!==refreshVersion)return;
 if(authError||!user){$("#customerInbox").classList.add("hidden");return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(version!==refreshVersion)return;
 if(pe||profile?.role!=="customer"){$("#customerInbox").classList.add("hidden");return;}
 $("#customerInbox").classList.remove("hidden");
 $("#notificationStatus").textContent="Завантажуємо сповіщення…";
 const {data,error}=await db.from("irbi_notifications").select("id,booking_id,title,body,event_type,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);
 if(version!==refreshVersion)return;
 if(error){$("#notificationStatus").textContent="Не вдалося завантажити: "+error.message;return;}
 $("#notificationRows").replaceChildren();
 const unread=(data||[]).filter(x=>!x.read_at).length;
 $("#unreadCount").textContent=unread?"("+unread+" нових)":"";
 $("#notificationStatus").textContent=data?.length?"Показано останні "+data.length+" сповіщень.":"Нових сповіщень немає.";
 for(const n of data||[]){
  const article=node("article");article.style.cssText="border:1px solid #dce7e1;border-radius:9px;padding:12px;margin:10px 0";
  if(!n.read_at)article.style.borderLeft="4px solid #287656";
  const heading=node("strong",n.title+" · "+new Date(n.created_at).toLocaleString("uk-UA"));article.append(heading);
  article.append(node("p",n.body));
  if(n.booking_id){const link=node("a","Відкрити заявку та переписку");link.href="#order-"+n.booking_id;link.onclick=()=>document.querySelector("#order-"+CSS.escape(n.booking_id))?.querySelector("details")?.setAttribute("open","");article.append(link);}
  if(!n.read_at){const btn=node("button","Прочитано");btn.type="button";btn.className="btn btn-secondary";btn.onclick=async()=>{
   if(btn.disabled||version!==refreshVersion)return;
   btn.disabled=true;
   try{
    const {error:err}=await db.from("irbi_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id).eq("user_id",user.id).is("read_at",null).select("id");
    if(version!==refreshVersion)return;
    if(err){$("#notificationStatus").textContent="Не вдалося оновити статус. Повторіть спробу.";return;}
    await refresh();
   }catch{
    if(version===refreshVersion)$("#notificationStatus").textContent="Не вдалося підтвердити зміну. Оновіть сповіщення й перевірте статус.";
   }finally{btn.disabled=false;}
  };article.append(btn);}
  $("#notificationRows").append(article);
 }
 }catch{if(version===refreshVersion)$("#notificationStatus").textContent="Не вдалося завантажити сповіщення. Повторіть спробу.";}
}
$("#refreshNotifications").addEventListener("click",()=>refresh().catch(e=>$("#notificationStatus").textContent=e.message));
db.auth.onAuthStateChange(()=>{++refreshVersion;clearInbox();setTimeout(()=>refresh(),0);});
refresh().catch(e=>$("#notificationStatus").textContent=e.message);
