import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";
const supabase=createClient("https://xcfbzlyososeetbnrvhf.supabase.co","sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let mode="login";
function toggleMode(register){mode=register?"register":"login";$("#authTitle").textContent=register?"Реєстрація клієнта":"Увійти";$("#submitAuth").textContent=register?"Створити акаунт":"Увійти";$("#nameLabel").classList.toggle("hidden",!register);$("#fullName").required=register;$("#password").autocomplete=register?"new-password":"current-password";$("#authMessage").textContent="";}
$("#showLogin").onclick=()=>toggleMode(false);$("#showRegister").onclick=()=>toggleMode(true);
$("#authForm").onsubmit=async e=>{e.preventDefault();const email=$("#email").value.trim(),password=$("#password").value;$("#submitAuth").disabled=true;$("#authMessage").textContent="Перевіряємо дані…";try{if(mode==="register"){const full_name=$("#fullName").value.trim();if(full_name.length<2)throw new Error("Вкажіть ім’я.");const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:location.origin+"/portal.html"}});if(error)throw error;$("#authMessage").textContent=data.session?"Акаунт створено.":"Перевірте вашу пошту для підтвердження реєстрації.";}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;$("#authMessage").textContent="Вхід успішний.";}}catch(err){$("#authMessage").textContent=err.message||"Помилка входу";}finally{$("#submitAuth").disabled=false;}};
$("#logout").onclick=async()=>{await supabase.auth.signOut();location.replace("/portal.html");};
async function render(){const {data:{user}}=await supabase.auth.getUser();$("#authPanel").classList.toggle("hidden",!!user);$("#dashboard").classList.toggle("hidden",!user);if(!user)return;const {data:profile,error:profileError}=await supabase.from("profiles").select("id,full_name,role").eq("id",user.id).maybeSingle();if(profileError){$("#roleNotice").textContent="Помилка перевірки ролі. Зверніться до підтримки.";return;}const role=["customer","cleaner","dispatcher","admin"].includes(profile?.role)?profile.role:"customer";const financeLink=document.querySelector("#financeLink");if(financeLink)financeLink.remove();if(role==="admin"){const link=document.createElement("a");link.id="financeLink";link.href="/finance.html";link.className="btn btn-primary";link.textContent="Економіка замовлень";document.querySelector("#dashboard").prepend(link);}$("#dashboardTitle").textContent=role==="admin"?"Панель адміністратора":role==="dispatcher"?"Панель координатора":role==="cleaner"?"Кабінет клінера":"Кабінет клієнта";$("#accountInfo").textContent=(profile?.full_name||user.email)+" · "+user.email;$("#roleNotice").textContent=role==="admin"||role==="dispatcher"?"Перегляд замовлень. Редагування, призначення виконавців та фінансові операції будуть доступні після окремого захищеного впровадження.":role==="cleaner"?"Ваші призначені замовлення. Управління статусами та чек-листами ще впроваджується.":"Ваші замовлення. Онлайн-бронювання ще готується до запуску.";$("#ordersTitle").textContent=role==="cleaner"?"Призначені замовлення":role==="admin"||role==="dispatcher"?"Замовлення компанії":"Мої замовлення";$("#ordersStatus").textContent="Завантаження…";let query=supabase.from("bookings").select("id,scheduled_at,status,total,assigned_cleaner_id,service_type,rooms,bathrooms,area_m2,property_type,address,apartment,entrance,floor,contact_phone,created_at,cleaning_features,photo_consent,duration_minutes,scheduled_end_at").order("created_at",{ascending:false}).limit(50);if(role==="cleaner")query=query.eq("assigned_cleaner_id",user.id);if(role==="customer")query=query.eq("customer_id",user.id);const {data:orders,error}=await query;if(error){$("#ordersStatus").textContent="Немає доступу до даних або помилка завантаження.";return;}$("#ordersBody").replaceChildren();for(const order of orders||[]){const tr=document.createElement("tr");for(const item of [order.id.slice(0,8),order.scheduled_at?new Date(order.scheduled_at).toLocaleString("uk-UA"):"—",order.status,order.total==null?"—":order.total+" ₴"]){const td=document.createElement("td");td.textContent=item;tr.append(td);}$("#ordersBody").append(tr);}$("#ordersStatus").textContent=orders?.length?"":"Поки немає замовлень.";if(role!=="customer") await staffPanel(role,user,orders||[]);}
supabase.auth.onAuthStateChange(()=>{setTimeout(render,0);});render();
const panel=document.createElement("div");panel.className="portal-card";panel.id="staffPanel";$("#dashboard").append(panel);
const statusNext={assigned:["accept","Прийняти"],accepted:["depart","Виїхав"],en_route:["arrive","На місці"],arrived:["start","Почати"],in_progress:["finish","Завершити"]};
async function staffPanel(role,user,orders){
 panel.replaceChildren();panel.classList.remove("hidden");
 const h=document.createElement("h2");h.textContent=role==="cleaner"?"Завдання клінера":"Координація замовлень";panel.append(h);await renderSchedule(role,user,orders,panel);
 let cleaners=[];if(role!=="cleaner"){const r=await supabase.from("profiles").select("id,full_name").eq("role","cleaner");cleaners=r.data||[];}
 if(!orders.length){const p=document.createElement("p");p.textContent="Немає замовлень.";panel.append(p);}
 for(const b of orders){
 const block=document.createElement("div");block.style.cssText="border:1px solid #ddd;padding:15px;margin:10px 0;border-radius:10px";
 const title=document.createElement("h3");title.textContent=b.id.slice(0,8)+" · "+b.status;block.append(title);
 const detail=document.createElement("div");detail.className="notice";const address=role==="cleaner"&&["pending","confirmed"].includes(b.status)?"Після призначення":([b.address,b.apartment?"кв. "+b.apartment:"",b.floor?"поверх "+b.floor:""].filter(Boolean).join(", ")||"Не вказано");
const fields=[["Послуга",b.service_type||"—"],["Дата",b.scheduled_at?new Date(b.scheduled_at).toLocaleString("uk-UA"):"—"],["Адреса",address],["Тип",b.property_type||"—"],["Кімнат",b.rooms??"—"],["Санвузлів",b.bathrooms??"—"],["Площа",b.area_m2?b.area_m2+" м²":"—"],["Вартість",b.total==null?"—":b.total+" ₴"]];for(const [key,value] of fields){const row=document.createElement("p");row.style.margin="4px 0";const strong=document.createElement("strong");strong.textContent=key+": ";row.append(strong,document.createTextNode(String(value)));detail.append(row);}block.append(detail);
const info=document.createElement("p");info.setAttribute("role","status");block.append(info);
 if(role!=="cleaner"&&["pending","confirmed","assigned"].includes(b.status)){
 const select=document.createElement("select");for(const c of cleaners){const o=document.createElement("option");o.value=c.id;o.textContent=c.full_name||c.id.slice(0,8);select.append(o);}if(b.assigned_cleaner_id)select.value=b.assigned_cleaner_id;
 const assign=document.createElement("button");assign.className="btn btn-secondary";assign.textContent="Призначити";assign.disabled=!cleaners.length;assign.onclick=()=>action(b.id,"assign",select.value,info);block.append(select,assign);
 }
 const next=statusNext[b.status];if(next){const btn=document.createElement("button");btn.className="btn btn-primary";btn.textContent=next[1];btn.onclick=()=>action(b.id,next[0],null,info);block.append(btn);}
 if(role!=="cleaner"&&["pending","confirmed","assigned"].includes(b.status)){
 const featureButton=document.createElement("button");featureButton.className="btn btn-secondary";featureButton.textContent="Налаштувати об’єкт";featureButton.style.margin="8px";featureButton.onclick=()=>showFeatures(b,block,info);block.append(featureButton);
 }
 if(role!=="cleaner"){const consent=document.createElement("button");consent.className="btn btn-secondary";consent.style.margin="8px";consent.textContent=b.photo_consent?"Скасувати згоду на фото":"Зафіксувати згоду на фото";consent.onclick=async()=>{if(!confirm(b.photo_consent?"Клієнт відкликав згоду на подальшу фотофіксацію?":"Ви отримали явну згоду клієнта на фотофіксацію об'єкта?"))return;const {error}=await supabase.rpc("irbi_photo_consent",{p_booking:b.id,p_consent:!b.photo_consent});if(error)info.textContent=error.message;else await render();};block.append(consent);}
 const photos=document.createElement("button");photos.className="btn btn-secondary";photos.style.margin="8px";photos.textContent="Фото";photos.onclick=()=>showPhotos(b,block,info);block.append(photos);
 const review=document.createElement("button");review.className="btn btn-secondary";review.style.margin="8px";review.textContent="Інциденти";review.onclick=()=>showIssues(b.id,role,block,info);block.append(review);
 const issueButton=document.createElement("button");issueButton.className="btn btn-secondary";issueButton.textContent="Повідомити про проблему";issueButton.style.margin="8px";issueButton.onclick=()=>showIssue(b.id,block,info);block.append(issueButton);
 const checklist=document.createElement("button");checklist.className="btn btn-secondary";checklist.textContent="Чек-лист";checklist.style.margin="8px";checklist.onclick=()=>showChecklist(b.id,block,info);block.append(checklist);
 panel.append(block);
 }
}
async function action(id,kind,cleaner,info){info.textContent="Зберігаємо…";const {error}=await supabase.rpc("irbi_staff_action",{p_booking:id,p_action:kind,p_cleaner:cleaner,p_note:null});if(error){info.textContent=error.message;return;}await render();}
async function showChecklist(id,block,info){
 const prev=block.querySelector(".items");if(prev){prev.remove();return;}
 const holder=document.createElement("div");holder.className="items";holder.style.marginTop="12px";block.append(holder);
 const {data,error}=await supabase.from("booking_checklist_items").select("id,section,label,is_done,is_required,resolution,resolution_reason").eq("booking_id",id).order("sort_order");
 if(error){info.textContent=error.message;holder.remove();return;}
 if(!data?.length){holder.textContent="Чек-лист ще не сформовано. Виберіть тип послуги та призначте клінера.";return;}
 const completed=data.filter(x=>x.resolution!=="pending").length;
 const summary=document.createElement("p");summary.textContent="Опрацьовано "+completed+" із "+data.length+" пунктів";holder.append(summary);
 for(const item of data){
 const row=document.createElement("div");row.style.cssText="border-bottom:1px solid #eee;padding:9px 0";
 const label=document.createElement("div");label.textContent=(item.is_required?"* ":"")+item.section+" — "+item.label;row.append(label);
 const select=document.createElement("select");select.style.cssText="padding:8px;max-width:100%";
 for(const [value,text] of [["pending","Не опрацьовано"],["done","Виконано"],["not_applicable","Не застосовується"],["not_done","Не виконано"]]){const opt=document.createElement("option");opt.value=value;opt.textContent=text;select.append(opt);}
 select.value=item.resolution||"pending";
 const reason=document.createElement("input");reason.type="text";reason.placeholder="Причина (обов’язково для винятків)";reason.maxLength=500;reason.value=item.resolution_reason||"";reason.style.cssText="padding:8px;width:100%;margin-top:5px";reason.hidden=!["not_applicable","not_done"].includes(select.value);
 select.onchange=()=>{reason.hidden=!["not_applicable","not_done"].includes(select.value);};
 const btn=document.createElement("button");btn.className="btn btn-secondary";btn.textContent="Зберегти пункт";btn.style.margin="5px";btn.onclick=async()=>{
  if(select.value==="pending"){info.textContent="Оберіть результат роботи.";return;}
  btn.disabled=true;const {error}=await supabase.rpc("irbi_checklist_resolve",{p_item:item.id,p_resolution:select.value,p_reason:reason.value.trim()||null});
  if(error){info.textContent="Помилка: "+error.message;}else{info.textContent="Пункт збережено.";holder.remove();await showChecklist(id,block,info);}
  btn.disabled=false;
 };
 row.append(select,reason,btn);holder.append(row);
 }
}

const featureLabels={dishwasher:"Посудомийна машина",microwave:"Мікрохвильова піч",oven:"Духовка",fridge:"Холодильник",hood:"Витяжка",radiator:"Радіатори",carpet:"Килими",soft_furniture:"М’які меблі",balcony:"Балкон / лоджія"};
function showFeatures(booking,block,info){
 const existing=block.querySelector(".features-panel");if(existing){existing.remove();return;}
 const container=document.createElement("div");container.className="features-panel notice";
 const title=document.createElement("h4");title.textContent="Особливості об’єкта";container.append(title);
 const note=document.createElement("p");note.textContent="Позначте лише перевірені дані: невідомі характеристики залишайте без змін. Відсутні елементи не потраплять у новий чек-лист.";container.append(note);
 const fields={};
 for(const [key,label] of Object.entries(featureLabels)){
 const wrap=document.createElement("label");wrap.style.cssText="display:block;margin:6px 0";wrap.textContent=label+": ";
 const select=document.createElement("select");for(const [value,text] of [["unknown","Не визначено"],["true","Є"],["false","Немає"]]){const opt=document.createElement("option");opt.value=value;opt.textContent=text;select.append(opt);}
 const current=booking.cleaning_features?.[key];select.value=current===true?"true":current===false?"false":"unknown";fields[key]=select;wrap.append(select);container.append(wrap);
 }
 const save=document.createElement("button");save.className="btn btn-primary";save.textContent="Зберегти характеристики";save.onclick=async()=>{
 const features={};for(const [key,select] of Object.entries(fields)){if(select.value!=="unknown")features[key]=select.value==="true";}
 save.disabled=true;const {error}=await supabase.rpc("irbi_staff_set_features",{p_booking:booking.id,p_features:features});if(error){info.textContent="Помилка: "+error.message;}else{info.textContent="Характеристики збережено.";await render();}save.disabled=false;
 };container.append(save);block.append(container);
}
function showIssue(bookingId,block,info){
 const existing=block.querySelector(".issue-panel");if(existing){existing.remove();return;}
 const holder=document.createElement("div");holder.className="issue-panel notice";
 const h=document.createElement("h4");h.textContent="Нове повідомлення про проблему";holder.append(h);
 const select=document.createElement("select");
 for(const [v,t] of [["damage","Пошкодження майна"],["access","Немає доступу"],["quality","Питання якості"],["safety","Небезпека"],["delay","Затримка"],["other","Інше"]]){const o=document.createElement("option");o.value=v;o.textContent=t;select.append(o);}holder.append(select);
 const description=document.createElement("textarea");description.rows=3;description.maxLength=2000;description.placeholder="Опишіть, що сталося (мінімум 8 символів)";description.style.cssText="display:block;width:100%;margin:10px 0";holder.append(description);
 const btn=document.createElement("button");btn.className="btn btn-primary";btn.textContent="Передати координатору";btn.onclick=async()=>{
 btn.disabled=true;const {error}=await supabase.rpc("irbi_report_issue",{p_booking:bookingId,p_category:select.value,p_description:description.value.trim()});
 if(error){info.textContent="Помилка: "+error.message;btn.disabled=false;}else{info.textContent="Повідомлення збережено.";holder.remove();}
 };holder.append(btn);block.append(holder);
}

async function showPhotos(b,block,info){
 const old=block.querySelector(".photos-panel");if(old){old.remove();return;}
 const container=document.createElement("div");container.className="photos-panel notice";block.append(container);
 const title=document.createElement("h4");title.textContent="Фото замовлення";container.append(title);
 if(!b.photo_consent){const p=document.createElement("p");p.textContent="Фотозйомка вимкнена: необхідна згода клієнта.";container.append(p);return;}
 const {data:list,error}=await supabase.from("booking_photos").select("id,object_path,caption,purpose").eq("booking_id",b.id).order("created_at",{ascending:false});
 if(error){info.textContent=error.message;return;}
 for(const photo of list||[]){const item=document.createElement("div");item.style.margin="8px";const btn=document.createElement("button");btn.className="btn btn-secondary";btn.textContent="Переглянути: "+photo.purpose;btn.onclick=async()=>{const {data,error}=await supabase.storage.from("irbi-job-photos").createSignedUrl(photo.object_path,60);if(error){info.textContent=error.message;return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");};item.append(btn);container.append(item);}
 const file=document.createElement("input");file.type="file";file.accept="image/jpeg,image/png,image/webp";container.append(file);
 const kind=document.createElement("select");for(const [v,t] of [["before","До"],["after","Після"],["issue","Проблема"],["other","Інше"]]){const o=document.createElement("option");o.value=v;o.textContent=t;kind.append(o);}container.append(kind);
 const caption=document.createElement("input");caption.placeholder="Короткий опис";caption.maxLength=500;container.append(caption);
 const send=document.createElement("button");send.className="btn btn-primary";send.textContent="Завантажити фото";send.onclick=async()=>{
 const image=file.files?.[0];if(!image||image.size>10*1024*1024||!["image/jpeg","image/png","image/webp"].includes(image.type)){info.textContent="Оберіть JPG, PNG або WebP до 10 МБ.";return;}
 send.disabled=true;const ext=image.type==="image/jpeg"?"jpg":image.type==="image/png"?"png":"webp";const path=b.id+"/"+crypto.randomUUID()+"."+ext;
 const upload=await supabase.storage.from("irbi-job-photos").upload(path,image,{contentType:image.type,upsert:false});
 if(upload.error){info.textContent=upload.error.message;send.disabled=false;return;}
 const record=await supabase.rpc("irbi_register_photo",{p_booking:b.id,p_path:path,p_purpose:kind.value,p_caption:caption.value,p_issue:null});
 if(record.error){info.textContent="Фото завантажено, але реєстрація не завершена: "+record.error.message;send.disabled=false;return;}
 container.remove();await showPhotos(b,block,info);send.disabled=false;
 };container.append(send);
}
async function showIssues(bookingId,role,block,info){
 const old=block.querySelector(".review-panel");if(old){old.remove();return;}
 const container=document.createElement("div");container.className="review-panel notice";block.append(container);
 const h=document.createElement("h4");h.textContent="Звернення за замовленням";container.append(h);
 const {data,error}=await supabase.from("booking_issues").select("id,category,description,status,resolution_kind,resolution_note").eq("booking_id",bookingId).order("created_at",{ascending:false});
 if(error){container.textContent="Помилка: "+error.message;return;}
 if(!data?.length){const t=document.createElement("p");t.textContent="Поки немає зареєстрованих проблем.";container.append(t);}
 for(const issue of data||[]){
 const item=document.createElement("div");item.style.cssText="padding:10px;border-bottom:1px solid #ddd";
 const title=document.createElement("strong");title.textContent=issue.category+" · "+issue.status;item.append(title);
 const description=document.createElement("p");description.textContent=issue.description;item.append(description);
 if(issue.resolution_note){const note=document.createElement("p");note.textContent="Рішення: "+issue.resolution_note;item.append(note);}
 if(role==="dispatcher"||role==="admin"){
 const target=issue.status==="open"?"in_review":issue.status==="in_review"?"resolved":issue.status==="resolved"?"closed":null;
 if(target){const type=document.createElement("select");for(const [v,t] of [["reclean","Повторне прибирання"],["partial_refund","Часткове повернення"],["discount","Знижка"],["no_compensation","Без компенсації"],["other","Інше"]]){const o=document.createElement("option");o.value=v;o.textContent=t;type.append(o);}
 const reason=document.createElement("textarea");reason.placeholder="Обґрунтування рішення";reason.rows=2;
 if(target==="resolved")item.append(type,reason);
 const button=document.createElement("button");button.className="btn btn-secondary";button.textContent=target==="in_review"?"Взяти в роботу":target==="resolved"?"Зафіксувати рішення":"Закрити";button.onclick=async()=>{button.disabled=true;const {error}=await supabase.rpc("irbi_review_issue",{p_issue:issue.id,p_status:target,p_resolution:target==="resolved"?type.value:null,p_note:target==="resolved"?reason.value:null});if(error){info.textContent=error.message;button.disabled=false;}else{container.remove();await showIssues(bookingId,role,block,info);}};item.append(button);}
 }
 container.append(item);
 }
}

async function renderSchedule(role,user,orders,root){
 const box=document.createElement("section");box.className="notice";root.append(box);
 const h=document.createElement("h3");h.textContent="Календар та завантаження";box.append(h);
 const date=new Date();const from=new Date(date.getFullYear(),date.getMonth(),date.getDate());const until=new Date(from);until.setDate(until.getDate()+14);
 const staff=role==="cleaner"?[{id:user.id,full_name:"Мій графік"}]:(await supabase.from("profiles").select("id,full_name").eq("role","cleaner")).data||[];
 const {data:shifts,error}=await supabase.from("cleaner_availability").select("cleaner_id,starts_at,ends_at,availability_type,note").gte("ends_at",from.toISOString()).lt("starts_at",until.toISOString());
 if(error){const msg=document.createElement("p");msg.textContent="Графік недоступний: "+error.message;box.append(msg);}
 const events=(orders||[]).filter(o=>o.scheduled_at&&o.status!=="cancelled");
 const table=document.createElement("table");table.className="portal-table";
 const head=document.createElement("thead");const hr=document.createElement("tr");for(const name of ["Дата / час","Клінер","Подія"]){const c=document.createElement("th");c.textContent=name;hr.append(c);}head.append(hr);table.append(head);
 const tbody=document.createElement("tbody");const records=[];
 for(const order of events){records.push({time:order.scheduled_at,person:staff.find(x=>x.id===order.assigned_cleaner_id)?.full_name||"Не призначено",label:"Уборка "+order.id.slice(0,8)+" · "+order.status+(order.duration_minutes?" · "+order.duration_minutes+" хв":"")});}
 for(const shift of shifts||[]){if(role==="cleaner"&&shift.cleaner_id!==user.id)continue;records.push({time:shift.starts_at,person:staff.find(x=>x.id===shift.cleaner_id)?.full_name||"Клінер",label:(shift.availability_type==="unavailable"?"Недоступний":"Доступний")+" до "+new Date(shift.ends_at).toLocaleString("uk-UA")});}
 records.sort((a,b)=>new Date(a.time)-new Date(b.time));
 for(const event of records){const tr=document.createElement("tr");for(const text of [new Date(event.time).toLocaleString("uk-UA"),event.person,event.label]){const td=document.createElement("td");td.textContent=text;tr.append(td);}tbody.append(tr);}table.append(tbody);box.append(table);
 if(!records.length){const p=document.createElement("p");p.textContent="На найближчі 14 днів записів немає.";box.append(p);}
 if(role==="cleaner"){
 const form=document.createElement("form");form.style.marginTop="14px";
 const start=document.createElement("input");start.type="datetime-local";start.required=true;
 const end=document.createElement("input");end.type="datetime-local";end.required=true;
 const kind=document.createElement("select");for(const [v,t] of [["available","Можу працювати"],["unavailable","Недоступний"]]){const op=document.createElement("option");op.value=v;op.textContent=t;kind.append(op);}
 const note=document.createElement("input");note.placeholder="Примітка";note.maxLength=300;
 const submit=document.createElement("button");submit.type="submit";submit.className="btn btn-primary";submit.textContent="Додати до графіка";
 const feedback=document.createElement("p");feedback.setAttribute("role","status");
 for(const [label,input] of [["З",start],["До",end],["Стан",kind],["Примітка",note]]){const wrap=document.createElement("label");wrap.style.cssText="display:block;margin:8px 0";wrap.textContent=label+": ";wrap.append(input);form.append(wrap);}
 form.append(submit,feedback);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;const a=new Date(start.value),b=new Date(end.value);if(!(b>a)){feedback.textContent="Перевірте інтервал.";submit.disabled=false;return;}const {error}=await supabase.rpc("irbi_set_shift",{p_start:a.toISOString(),p_end:b.toISOString(),p_type:kind.value,p_note:note.value});if(error){feedback.textContent=error.message;submit.disabled=false;return;}await render();};box.append(form);
 }
}
