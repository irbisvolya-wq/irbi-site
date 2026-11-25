import {loadLeadPage,leadActions,leadStatuses} from '/leads-data.js?v=20261125-1';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.95.0';
const db=createClient('https://xcfbzlyososeetbnrvhf.supabase.co','sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1');
const $=s=>document.querySelector(s);
const actionLabels={take:'Взяти в роботу',note:'Додати нотатку',notify:'Зафіксувати повідомлення про запуск',close:'Закрити звернення'};
const services={regular:'Підтримувальне',general:'Генеральне',move:'Заселення / виселення',repair:'Після ремонту'};
const known={lead_changed:'Звернення вже змінилося. Оновіть список.',lead_owned:'Звернення обробляє інший працівник. Перепризначити його може адміністратор.',staff_required:'Потрібен доступ координатора або адміністратора.',note_required:'Вкажіть нотатку від 3 до 1000 символів.',lead_request_changed:'Цю спробу вже збережено з іншими даними. Оновіть список.',invalid_transition:'Ця дія вже недоступна. Оновіть звернення.',take_first:'Спочатку візьміть звернення в роботу.',lead_not_found:'Звернення не знайдено.'};
let version=0,items=[],cursor=null,hasMore=false,currentUser=null,role='',saving=false,loading=false,reloadQueued=false;
function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function clear(){items=[];cursor=null;hasMore=false;currentUser=null;role='';$('#leads').replaceChildren();$('#content').classList.add('hidden');$('#more').classList.add('hidden');$('#updated').textContent='';$('#paging').textContent='';for(const k of Object.keys(leadStatuses))$('#'+k+'Count').textContent='—';}
function controls(){for(const id of ['refresh','more','filter','retry'])$('#'+id).disabled=saving||loading;}
async function load(more=false){
 if(saving||loading)return false;
 loading=true;controls();const request=++version;const selected=$('#filter').value;const userBefore=currentUser?.id;
 if(!more)clear();$('#retry').classList.add('hidden');$('#status').textContent=more?'Завантажуємо наступну сторінку…':'Завантажуємо звернення…';
 try{
  const {data:{user},error}=await db.auth.getUser();if(request!==version)return false;
  if(error||!user){clear();$('#status').textContent='Увійдіть через кабінет IRBI.';return false;}
  const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(request!==version)return false;
  if(pe)throw pe;
  if(!['admin','dispatcher'].includes(profile?.role)){clear();$('#status').textContent='Попередні контакти доступні лише координатору й адміністратору.';return false;}
  if(more&&userBefore!==user.id){clear();throw Error('session_changed');}
  currentUser=user;role=profile.role;
  const snapshot=await loadLeadPage(db,{status:selected,cursor:more?cursor:null});if(request!==version)return false;
  items=[...new Map([...(more?items:[]),...snapshot.items].map(l=>[l.id,l])).values()];cursor=snapshot.next_cursor;hasMore=snapshot.has_more;
  for(const k of Object.keys(leadStatuses))$('#'+k+'Count').textContent=snapshot.counts[k]??0;
  draw();$('#content').classList.remove('hidden');$('#more').classList.toggle('hidden',!hasMore);$('#paging').textContent='Показано звернень: '+items.length+(hasMore?'. Є наступна сторінка.':'.');$('#updated').textContent='Оновлено: '+new Date().toLocaleString('uk-UA');$('#status').textContent='Список завантажено. Статус CRM відображається окремо від обробки звернення.';return true;
 }catch{
  if(request!==version)return false;
  if(!more)clear();$('#status').textContent=more?'Не вдалося завантажити наступну сторінку. Показано лише раніше отримані звернення. Повторіть завантаження.':'Не вдалося завантажити звернення. Кількість невідома. Повторіть спробу.';$('#retry').classList.remove('hidden');return false;
 }finally{loading=false;controls();if(reloadQueued&&!saving){reloadQueued=false;setTimeout(()=>load(),0);}}
}
function draw(){
 const root=$('#leads');root.replaceChildren();
 if(!items.length){root.append(node('p','У вибраному статусі звернень немає.'));return;}
 for(const lead of items){
  const card=node('article');card.className='lead';card.append(node('h2',lead.full_name),node('p','Контакт: '+lead.contact),node('p','Статус: '+leadStatuses[lead.processing_status]),node('p','Відповідальний: '+(lead.processing_owner?(lead.owner_name||'Працівник '+lead.processing_owner.slice(0,8)):'Не призначено')),node('p','Створено: '+new Date(lead.created_at).toLocaleString('uk-UA')));
  card.append(node('p','Послуга: '+(services[lead.service_code]||'Не вказано')+(lead.rooms?' · кімнат: '+lead.rooms:'')));
  card.append(node('p','Згода на обробку даних: '+(lead.privacy_notice_accepted?'Так':'Ні')+' · Рекламна згода: '+(lead.marketing_consent?'Так':'Ні')));
  card.append(node('p','Синхронізація з CRM: '+({pending:'Очікує підтвердження',synced:'Позначено синхронізованим',failed:'Помилка синхронізації'}[lead.sync_status]||'Невідомо')));
  if(lead.processing_note)card.append(node('p','Остання нотатка: '+lead.processing_note));
  const actions=node('div');actions.className='actions';
  for(const action of leadActions(lead,role,currentUser.id)){const button=node('button',action==='take'&&lead.processing_status!=='new'?'Взяти / повернути в роботу':actionLabels[action]);button.type='button';button.className='btn btn-secondary';button.onclick=()=>showForm(lead,action,card);actions.append(button);}
  const history=node('button','Історія обробки');history.type='button';history.className='btn btn-secondary';history.onclick=()=>showHistory(lead,card,history);actions.append(history);card.append(actions);root.append(card);
 }
}
async function showHistory(lead,card,button){
 const old=card.querySelector('.history');if(old){old.remove();return;}const request=version;const section=node('section');section.className='history';section.append(node('h3','Останні 20 записів'));card.append(section);button.disabled=true;
 try{const {data,error}=await db.from('prelaunch_processing_events').select('action,note,created_at').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(20);if(request!==version)return;if(error)throw error;
  if(!data?.length)section.append(node('p','Історія поки порожня.'));
  for(const event of data||[])section.append(node('p',(actionLabels[event.action]||event.action)+' · '+new Date(event.created_at).toLocaleString('uk-UA')+' — '+event.note));
 }catch{if(request===version)section.append(node('p','Історія недоступна. Закрийте й відкрийте її, щоб повторити спробу.'));}finally{button.disabled=false;}
}
function showForm(lead,action,card){
 if(saving)return;card.querySelector('form')?.remove();const form=node('form');form.append(node('h3',actionLabels[action]));
 if(action==='notify')form.append(node('p','Ця дія лише фіксує вже доставлене вручну повідомлення про запуск. Сайт нічого не надсилає.'));
 const label=node('label','Нотатка або результат обробки');const note=node('textarea');note.required=true;note.minLength=3;note.maxLength=1000;note.rows=3;label.append(note);form.append(label);
 if(action==='notify'){const label=node('label','Фактично повідомили людині про запуск');const check=node('input');check.type='checkbox';check.required=true;label.append(check);form.append(label);}
 const submit=node('button','Зберегти');submit.type='submit';submit.className='btn btn-primary';const close=node('button','Закрити форму');close.type='button';close.className='btn btn-secondary';close.onclick=()=>{if(!saving)form.remove();};const info=node('p');info.setAttribute('role','status');form.append(submit,close,info);card.append(form);let attempt=null;
 form.onsubmit=async event=>{
  event.preventDefault();if(saving||!form.reportValidity())return;
  const payload={p_lead:lead.id,p_action:action,p_note:note.value.trim(),p_expected_updated_at:lead.processing_updated_at};
  if(attempt&&JSON.stringify(attempt.payload)!==JSON.stringify(payload)){info.textContent='Попередню спробу не звірено. Повторіть із тими самими даними або оновіть список.';return;}
  attempt??={id:crypto.randomUUID(),payload};const request=version;saving=true;controls();submit.disabled=close.disabled=note.disabled=true;info.textContent='Зберігаємо…';
  try{const {error}=await db.rpc('irbi_process_prelaunch',{p_request:attempt.id,...attempt.payload});if(error)throw error;if(request!==version)return;attempt=null;
   saving=false;const refreshed=await load();$('#status').textContent=refreshed?'Обробку звернення збережено. Список оновлено.':'Обробку збережено. Оновіть список; повторно надсилати цю зміну не потрібно.';
  }catch(error){const message=known[error.message];if(message){attempt=null;info.textContent=message;}else info.textContent='Збереження не підтверджено. Повторіть із тими самими даними або оновіть список для звірки.';}
  finally{saving=false;submit.disabled=close.disabled=note.disabled=false;controls();if(reloadQueued&&!loading){reloadQueued=false;setTimeout(()=>load(),0);}}
 };
}
$('#filter').addEventListener('change',()=>load());$('#refresh').addEventListener('click',()=>load());$('#more').addEventListener('click',()=>{if(hasMore)load(true);});$('#retry').addEventListener('click',()=>load());
db.auth.onAuthStateChange(()=>{++version;clear();$('#status').textContent='Перевіряємо доступ…';if(!saving&&!loading)setTimeout(()=>load(),0);else reloadQueued=true;});
load();
