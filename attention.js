import {loadAttentionQueue} from '/attention-data.js?v=20261125-1';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.95.0';
const db=createClient('https://xcfbzlyososeetbnrvhf.supabase.co','sb_publishable_FeIEDPRGGRrp42q6mT3ACA_JvHSrhS1');
const $=s=>document.querySelector(s);
const kinds={pending:'Нова заявка',unassigned:'Без клінера',overdue:'Потрібно уточнити час',issues:'Інцидент'};
let version=0,tasks=[];
function clear(){
 tasks=[];$('#tasks').replaceChildren();$('#content').classList.add('hidden');$('#updated').textContent='';
 for(const k of Object.keys(kinds))$('#'+k+'Count').textContent='—';
}
function element(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function draw(){
 const root=$('#tasks');root.replaceChildren();
 const selected=tasks.filter(t=>$('#filter').value==='all'||t.kind===$('#filter').value);
 if(!selected.length){const p=element('p',tasks.length?'У цій категорії завдань немає.':'Завдань у цій черзі немає.');p.className='empty';root.append(p);return;}
 for(const task of selected){
  const article=document.createElement('article');article.className='task'+(task.priority===0?' urgent':task.priority===1?' attention':'');
  article.append(element('h2',kinds[task.kind]+' · '+task.title));
  article.append(element('p','Замовлення '+task.bookingId.slice(0,8)));
  article.append(element('p',task.reason));
  article.append(element('p',(task.kind==='issues'?'Дата звернення: ':'Заплановано: ')+new Date(task.when).toLocaleString('uk-UA')));
  const link=element('a',task.kind==='issues'?'Переглянути інциденти':'Відкрити замовлення');link.className='btn btn-primary';
  link.href='/portal.html?'+new URLSearchParams({order:task.bookingId,...(task.kind==='issues'?{view:'issues'}:{})});article.append(link);root.append(article);
 }
}
async function refresh(){
 const request=++version;clear();$('#recovery').classList.add('hidden');$('#status').textContent='Оновлюємо робочу чергу…';
 try{
  const {data:{user},error}=await db.auth.getUser();if(request!==version)return;
  if(error||!user){$('#status').textContent='Увійдіть через кабінет IRBI, щоб переглянути чергу.';return;}
  const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();if(request!==version)return;
  if(pe)throw pe;
  if(!['admin','dispatcher'].includes(profile?.role)){$('#status').textContent='Ця черга доступна лише координатору й адміністратору.';return;}
  const snapshot=await loadAttentionQueue(db,profile.role);if(request!==version)return;
  tasks=snapshot.tasks;
  for(const [k,count] of Object.entries(snapshot.counts))$('#'+k+'Count').textContent=count;
  draw();$('#content').classList.remove('hidden');$('#status').textContent='Робочу чергу завантажено.';
  $('#updated').textContent='Оновлено: '+new Date().toLocaleString('uk-UA');
 }catch{
  if(request!==version)return;
  clear();$('#status').textContent='Не вдалося завантажити повну чергу. Кількість завдань невідома. Спробуйте ще раз.';$('#recovery').classList.remove('hidden');
 }
}
$('#filter').addEventListener('change',draw);
$('#refresh').addEventListener('click',refresh);$('#retry').addEventListener('click',refresh);
db.auth.onAuthStateChange(()=>{++version;clear();$('#status').textContent='Перевіряємо доступ…';setTimeout(refresh,0);});
setInterval(()=>{if(!document.hidden)refresh();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
