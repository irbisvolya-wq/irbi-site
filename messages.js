import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const db=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1");
const $=s=>document.querySelector(s);
const info=t=>$("#status").textContent=t;
let orders=[];
let refreshVersion=0;
const drafts=new Map();
function option(id,label){const el=document.createElement("option");el.value=id;el.textContent=label;return el;}
async function load(){
 const {data:{user},error:ae}=await db.auth.getUser();
 if(ae||!user){info("Увійдіть до робочого кабінету IRBI.");return;}
 const {data:profile,error:pe}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(pe||!["admin","dispatcher"].includes(profile?.role)){info("Доступ лише для координатора й адміністратора.");return;}
 $("#content").classList.remove("hide");
 const {data,error}=await db.from("bookings").select("id,status,scheduled_at").order("created_at",{ascending:false}).limit(100);
 if(error){info(error.message);return;}
 orders=data||[];
 $("#booking").replaceChildren(...orders.map(b=>option(b.id,b.id.slice(0,8)+" · "+b.status+" · "+new Date(b.scheduled_at).toLocaleDateString("uk-UA"))));
 $("#replyForm").querySelector("button").disabled=!orders.length;
 info(orders.length?"Оберіть заявку для відповіді.":"Заявок поки немає.");
 await refresh();
}
async function refresh(){
 const version=++refreshVersion;
 const id=$("#booking").value;if(!id){$("#messages").replaceChildren();return;}
 const b=orders.find(o=>o.id===id);
 $("#orderDetails").textContent="Заявка "+id.slice(0,8)+" · "+(b?.status||"");
 const {data,error}=await db.from("irbi_booking_messages").select("sender_id,audience,body,created_at").eq("booking_id",id).order("created_at",{ascending:false}).limit(100);
 if(version!==refreshVersion)return;
 if(error){info("Не вдалося завантажити листування: "+error.message);return;}
 $("#messages").replaceChildren();
 if(!data?.length){$("#messages").textContent="Повідомлень за цією заявкою немає.";return;}
 for(const m of data.reverse()){const p=document.createElement("div");p.className="chat";p.textContent=(m.audience==="staff"?"Клієнт":"IRBI")+" · "+new Date(m.created_at).toLocaleString("uk-UA")+"\n"+m.body;$("#messages").append(p);}
}
$("#reply").addEventListener("input",()=>drafts.set($("#booking").value,$("#reply").value));
$("#booking").addEventListener("change",()=>{
 $("#reply").value=drafts.get($("#booking").value)||"";
 $("#messages").textContent="Завантажуємо листування…";
 info("");
 refresh().catch(e=>info(e.message));
});
$("#reload").addEventListener("click",()=>refresh().catch(e=>info(e.message)));
$("#replyForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const id=$("#booking").value,body=$("#reply").value.trim();if(!id||!body)return;
 const button=e.currentTarget.querySelector("button");
 const booking=$("#booking"),reply=$("#reply");
 button.disabled=booking.disabled=reply.disabled=true;
 try{
  const {error}=await db.rpc("irbi_send_booking_message",{p_booking:id,p_body:body});
  if(error)throw error;
  drafts.delete(id);
  reply.value="";
  info("Відповідь збережено, клієнту створено сповіщення.");
  await refresh();
 }catch(error){
  info("Помилка: "+error.message);
 }finally{
  button.disabled=booking.disabled=reply.disabled=false;
 }
});
load().catch(e=>info(e.message));
