const staffRoles=new Set(['admin','dispatcher']);
const activeStatuses=['assigned','accepted','en_route','arrived','in_progress'];
const services={regular:'Підтримувальне',general:'Генеральне',move:'Заселення / виселення',repair:'Після ремонту'};
const categories={damage:'Пошкодження',access:'Проблема доступу',quality:'Якість',safety:'Безпека',delay:'Затримка',other:'Інше'};
async function allPages(query){
 const rows=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await query().range(offset,offset+499);
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('attention_unavailable');
  rows.push(...data);
  if(data.length<500)return rows;
 }
}
export function buildAttentionTasks(bookings,issues,now=new Date()){
 const stamp=new Date(now).getTime();
 if(!Number.isFinite(stamp))throw new Error('invalid_time');
 const tasks=[];
 for(const b of bookings){
  const start=new Date(b.scheduled_at).getTime();
  const end=b.scheduled_end_at?new Date(b.scheduled_end_at).getTime():NaN;
  let kind,reason,priority;
  if(b.status==='pending'){
   kind='pending';priority=start<stamp?1:3;
   reason=start<stamp?'Бажаний час уже минув. Погодьте нову дату з клієнтом.':'Погодьте з клієнтом час, тривалість і вартість.';
  }else if(b.status==='confirmed'&&!b.assigned_cleaner_id){
   kind='unassigned';priority=start<stamp?1:2;
   reason=start<stamp?'Погоджений час уже минув, клінера не призначено. Зв’яжіться з клієнтом.':'Погоджено з клієнтом. Потрібно призначити клінера.';
  }else if(activeStatuses.includes(b.status)&&((b.status!=='in_progress'&&start<stamp)||(b.status==='in_progress'&&end<stamp))){
   kind='overdue';priority=1;
   reason=b.status==='in_progress'?'Плановий час завершення минув. Уточніть перебіг роботи.':'Плановий час початку минув, роботу ще не розпочато. Уточніть статус.';
  }else continue;
  tasks.push({id:'booking:'+b.id,bookingId:b.id,kind,priority,title:services[b.service_type]||'Прибирання',reason,when:b.scheduled_at,status:b.status});
 }
 for(const issue of issues){
  if(!['open','in_review','resolved'].includes(issue.status))continue;
  tasks.push({id:'issue:'+issue.id,bookingId:issue.booking_id,kind:'issues',priority:issue.status==='resolved'?4:issue.category==='safety'?0:1,
   title:categories[issue.category]||'Проблема за замовленням',reason:issue.status==='open'?'Нове звернення. Перегляньте й візьміть у роботу.':issue.status==='in_review'?'Звернення у роботі. Перевірте, чи потрібне рішення.':'Рішення зафіксовано. Перевірте виконання перед закриттям.',when:issue.created_at,status:issue.status});
 }
 tasks.sort((a,b)=>a.priority-b.priority||(new Date(a.when)-new Date(b.when))||a.id.localeCompare(b.id));
 return tasks;
}
export async function loadAttentionQueue(db,role,now=new Date()){
 if(!staffRoles.has(role))throw new Error('staff_required');
 const [bookings,issues]=await Promise.all([
  allPages(()=>db.from('bookings').select('id,service_type,status,scheduled_at,scheduled_end_at,assigned_cleaner_id').in('status',['pending','confirmed',...activeStatuses]).order('scheduled_at',{ascending:true}).order('id',{ascending:true})),
  allPages(()=>db.from('booking_issues').select('id,booking_id,category,status,created_at').in('status',['open','in_review','resolved']).order('created_at',{ascending:true}).order('id',{ascending:true}))
 ]);
 const tasks=buildAttentionTasks(bookings,issues,now);
 const counts=Object.fromEntries(['pending','unassigned','overdue','issues'].map(k=>[k,tasks.filter(t=>t.kind===k).length]));
 return {tasks,counts};
}
