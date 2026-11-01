import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const supabase=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let mode="login";
function toggleMode(register){mode=register?"register":"login";$("#authTitle").textContent=register?"Реєстрація клієнта":"Увійти";$("#submitAuth").textContent=register?"Створити акаунт":"Увійти";$("#nameLabel").classList.toggle("hidden",!register);$("#fullName").required=register;$("#password").autocomplete=register?"new-password":"current-password";$("#authMessage").textContent="";}
$("#showLogin").onclick=()=>toggleMode(false);$("#showRegister").onclick=()=>toggleMode(true);
$("#authForm").onsubmit=async e=>{e.preventDefault();const email=$("#email").value.trim(),password=$("#password").value;$("#submitAuth").disabled=true;$("#authMessage").textContent="Перевіряємо дані…";try{if(mode==="register"){const full_name=$("#fullName").value.trim();if(full_name.length<2)throw new Error("Вкажіть ім’я.");const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:location.origin+"/portal.html"}});if(error)throw error;$("#authMessage").textContent=data.session?"Акаунт створено.":"Перевірте вашу пошту для підтвердження реєстрації.";}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;$("#authMessage").textContent="Вхід успішний.";}}catch(err){$("#authMessage").textContent=err.message||"Помилка входу";}finally{$("#submitAuth").disabled=false;}};
$("#logout").onclick=async()=>{await supabase.auth.signOut();location.replace("/portal.html");};
async function render(){const {data:{user}}=await supabase.auth.getUser();$("#authPanel").classList.toggle("hidden",!!user);$("#dashboard").classList.toggle("hidden",!user);if(!user)return;const {data:profile,error:profileError}=await supabase.from("profiles").select("id,full_name,role").eq("id",user.id).maybeSingle();if(profileError){$("#roleNotice").textContent="Помилка перевірки ролі. Зверніться до підтримки.";return;}const role=["customer","cleaner","dispatcher","admin"].includes(profile?.role)?profile.role:"customer";$("#dashboardTitle").textContent=role==="admin"?"Панель адміністратора":role==="dispatcher"?"Панель координатора":role==="cleaner"?"Кабінет клінера":"Кабінет клієнта";$("#accountInfo").textContent=(profile?.full_name||user.email)+" · "+user.email;$("#roleNotice").textContent=role==="admin"||role==="dispatcher"?"Перегляд замовлень. Редагування, призначення виконавців та фінансові операції будуть доступні після окремого захищеного впровадження.":role==="cleaner"?"Ваші призначені замовлення. Управління статусами та чек-листами ще впроваджується.":"Ваші замовлення. Онлайн-бронювання ще готується до запуску.";$("#ordersTitle").textContent=role==="cleaner"?"Призначені замовлення":role==="admin"||role==="dispatcher"?"Замовлення компанії":"Мої замовлення";$("#ordersStatus").textContent="Завантаження…";let query=supabase.from("bookings").select("id,scheduled_at,status,total,assigned_cleaner_id").order("created_at",{ascending:false}).limit(50);if(role==="cleaner")query=query.eq("assigned_cleaner_id",user.id);if(role==="customer")query=query.eq("customer_id",user.id);const {data:orders,error}=await query;if(error){$("#ordersStatus").textContent="Немає доступу до даних або помилка завантаження.";return;}$("#ordersBody").replaceChildren();for(const order of orders||[]){const tr=document.createElement("tr");for(const item of [order.id.slice(0,8),order.scheduled_at?new Date(order.scheduled_at).toLocaleString("uk-UA"):"—",order.status,order.total==null?"—":order.total+" ₴"]){const td=document.createElement("td");td.textContent=item;tr.append(td);}$("#ordersBody").append(tr);}$("#ordersStatus").textContent=orders?.length?"":"Поки немає замовлень.";if(role!=="customer") await staffPanel(role,user,orders||[]);}
supabase.auth.onAuthStateChange(()=>{setTimeout(render,0);});render();
const panel=document.createElement("div");panel.className="portal-card";panel.id="staffPanel";$("#dashboard").append(panel);
const statusNext={assigned:["accept","Прийняти"],accepted:["depart","Виїхав"],en_route:["arrive","На місці"],arrived:["start","Почати"],in_progress:["finish","Завершити"]};
async function staffPanel(role,user,orders){
 panel.replaceChildren();panel.classList.remove("hidden");
 const h=document.createElement("h2");h.textContent=role==="cleaner"?"Завдання клінера":"Координація замовлень";panel.append(h);
 let cleaners=[];if(role!=="cleaner"){const r=await supabase.from("profiles").select("id,full_name").eq("role","cleaner");cleaners=r.data||[];}
 if(!orders.length){const p=document.createElement("p");p.textContent="Немає замовлень.";panel.append(p);}
 for(const b of orders){
 const block=document.createElement("div");block.style.cssText="border:1px solid #ddd;padding:15px;margin:10px 0;border-radius:10px";
 const title=document.createElement("h3");title.textContent=b.id.slice(0,8)+" · "+b.status;block.append(title);
 const info=document.createElement("p");info.setAttribute("role","status");block.append(info);
 if(role!=="cleaner"&&["pending","confirmed","assigned"].includes(b.status)){
 const select=document.createElement("select");for(const c of cleaners){const o=document.createElement("option");o.value=c.id;o.textContent=c.full_name||c.id.slice(0,8);select.append(o);}if(b.assigned_cleaner_id)select.value=b.assigned_cleaner_id;
 const assign=document.createElement("button");assign.className="btn btn-secondary";assign.textContent="Призначити";assign.disabled=!cleaners.length;assign.onclick=()=>action(b.id,"assign",select.value,info);block.append(select,assign);
 }
 const next=statusNext[b.status];if(next){const btn=document.createElement("button");btn.className="btn btn-primary";btn.textContent=next[1];btn.onclick=()=>action(b.id,next[0],null,info);block.append(btn);}
 const checklist=document.createElement("button");checklist.className="btn btn-secondary";checklist.textContent="Чек-лист";checklist.style.margin="8px";checklist.onclick=()=>showChecklist(b.id,block,info);block.append(checklist);
 panel.append(block);
 }
}
async function action(id,kind,cleaner,info){info.textContent="Зберігаємо…";const {error}=await supabase.rpc("irbi_staff_action",{p_booking:id,p_action:kind,p_cleaner:cleaner,p_note:null});if(error){info.textContent=error.message;return;}await render();}
async function showChecklist(id,block,info){
 const prev=block.querySelector(".items");if(prev){prev.remove();return;}
 const holder=document.createElement("div");holder.className="items";block.append(holder);
 const {data,error}=await supabase.from("booking_checklist_items").select("id,section,label,is_done,is_required").eq("booking_id",id).order("sort_order");
 if(error){info.textContent=error.message;return;}
 if(!data?.length){holder.textContent="Чек-лист ще не сформовано для цього замовлення.";return;}
 for(const item of data){const row=document.createElement("label");row.style.cssText="display:block;padding:7px";const cb=document.createElement("input");cb.type="checkbox";cb.checked=item.is_done;cb.onchange=async()=>{cb.disabled=true;const {error}=await supabase.rpc("irbi_checklist_action",{p_item:item.id,p_done:cb.checked});if(error){cb.checked=!cb.checked;info.textContent=error.message;}cb.disabled=false;};row.append(cb,document.createTextNode(" "+item.section+" — "+item.label+(item.is_required?" *":"")));holder.append(row);}
}
