const labels={reschedule:'Перенести час',cancel:'Скасувати замовлення',decline:'Відмовитися від призначення',reassign:'Змінити клінера'};
const errors={staff_required:'Дія доступна лише уповноваженому працівнику.',assigned_cleaner_only:'Відмовитися може лише призначений клінер.',not_assigned:'Це замовлення вам більше не призначено.',booking_changed:'Замовлення вже змінилося. Оновіть сторінку й перевірте стан.',change_locked:'Виїзд або виконання вже розпочато, чи замовлення закрите. Зверніться до координатора.',reason_required:'Вкажіть причину від 5 до 400 символів.',invalid_schedule:'Оберіть майбутній час у межах 90 днів.',invalid_duration:'Тривалість має бути від 15 до 1440 хвилин.',invalid_cleaner:'Оберіть іншого чинного клінера.',assignment_required:'Спочатку перевірте поточне призначення.',confirm_request_first:'Спочатку погодьте заявку з клієнтом.',cleaner_unavailable:'Клінер позначив цей час недоступним. Оберіть інший час.',payment_reconciliation_required:'Є оплати або повернення. Спочатку потрібна звірка адміністратором.',payroll_reconciliation_required:'Є нарахування клінеру. Спочатку потрібна звірка адміністратором.',cost_reconciliation_required:'Є матеріали або прямі витрати. Спочатку потрібна звірка адміністратором.',checklist_already_started:'Чек-лист уже почали заповнювати. Зверніться до координатора.',change_request_changed:'Цю спробу вже збережено з іншими даними. Оновіть замовлення.',change_not_needed:'Дата й тривалість не змінилися.',booking_not_found:'Замовлення не знайдено або недоступне.'};
const busyBookings=new Set();
export function availableBookingChanges(b,role,userId){
 if(!['pending','confirmed','assigned','accepted'].includes(b.status)||b.departed_at||b.started_at)return [];
 if(role==='cleaner')return b.assigned_cleaner_id===userId&&['assigned','accepted'].includes(b.status)?['decline']:[];
 if(!['admin','dispatcher'].includes(role))return [];
 return [...(b.status!=='pending'?['reschedule']:[]),...(['assigned','accepted'].includes(b.status)?['reassign']:[]),'cancel'];
}
const localDate=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
export function mountBookingChanges({db,booking,role,userId,cleaners=[],block,refresh}){
 const actions=availableBookingChanges(booking,role,userId);
 if(actions.length){const bar=node('div');bar.className='portal-actions';
  for(const action of actions){const button=node('button',labels[action]);button.type='button';button.className='btn btn-secondary';button.onclick=()=>showForm(action);bar.append(button);}block.append(bar);
 }
 if(['admin','dispatcher'].includes(role)){
  const button=node('button','Історія перенесень і призначень');button.type='button';button.className='btn btn-secondary';button.style.marginTop='12px';block.append(button);
  button.onclick=async()=>{const old=block.querySelector('.booking-change-history');if(old){old.remove();return;}button.disabled=true;const section=node('section');section.className='booking-change-history notice';section.style.overflowWrap='anywhere';section.append(node('h4','Останні 20 змін'));block.append(section);
   try{const {data,error}=await db.from('booking_change_events').select('action,reason,before_state,after_state,created_at').eq('booking_id',booking.id).order('created_at',{ascending:false}).limit(20);if(error)throw error;
    if(!data?.length)section.append(node('p','Зафіксованих змін поки немає.'));
    for(const item of data||[]){const row=node('div');row.append(node('strong',(labels[item.action]||item.action)+' · '+new Date(item.created_at).toLocaleString('uk-UA')),node('p',item.reason));if(item.action==='reschedule')row.append(node('p','Час: '+new Date(item.before_state.scheduled_at).toLocaleString('uk-UA')+' → '+new Date(item.after_state.scheduled_at).toLocaleString('uk-UA')));section.append(row);}
   }catch{section.append(node('p','Не вдалося завантажити історію. Закрийте й відкрийте її, щоб повторити спробу.'));}finally{button.disabled=false;}
  };
 }
 function showForm(action){
  if(busyBookings.has(booking.id))return;
  const old=block.querySelector('.booking-change-form');if(old)old.remove();
  const form=node('form');form.className='booking-change-form notice';form.append(node('h4',labels[action]));
  form.append(node('p',action==='decline'?'Замовлення повернеться координатору для нового призначення. Причина доступна лише координатору й адміністратору.':action==='cancel'?'Дія доступна до виїзду клінера. Причину скасування побачить клієнт. Оплати та компенсації автоматично не виконуються.':'Перевірте зміни з клієнтом. Після зміни часу або виконавця клінер має прийняти призначення заново.'));
  const inputs={};
  const field=(title,input)=>{const label=node('label',title);label.append(input);form.append(label);};
  if(action==='reschedule'){
   const date=node('input');date.type='datetime-local';date.required=true;date.value=localDate(booking.scheduled_at);date.min=localDate(Date.now()+60000);date.max=localDate(Date.now()+90*86400000);inputs.date=date;field('Нова дата й час ('+Intl.DateTimeFormat().resolvedOptions().timeZone+')',date);
   const duration=node('input');duration.type='number';duration.required=true;duration.min='15';duration.max='1440';duration.step='1';duration.value=String(booking.duration_minutes||120);inputs.duration=duration;field('Тривалість, хвилин',duration);
  }
  if(action==='reassign'){
   const select=node('select');select.required=true;const empty=node('option','Оберіть іншого клінера');empty.value='';select.append(empty);
   for(const c of cleaners.filter(c=>c.id!==booking.assigned_cleaner_id)){const option=node('option',c.full_name||c.id.slice(0,8));option.value=c.id;select.append(option);}inputs.cleaner=select;field('Новий виконавець',select);
  }
  const reason=node('textarea');reason.required=true;reason.minLength=5;reason.maxLength=400;reason.rows=3;reason.style.cssText='display:block;width:100%;padding:10px;margin:8px 0;font:inherit';field('Причина зміни',reason);
  const confirm=node('input');confirm.type='checkbox';confirm.required=true;confirm.style.width='auto';field(action==='reschedule'?'Новий час і тривалість погоджено з клієнтом':'Підтверджую цю зміну',confirm);
  const save=node('button','Зберегти зміну');save.type='submit';save.className='btn btn-primary';
  const cancel=node('button','Закрити');cancel.type='button';cancel.className='btn btn-secondary';cancel.onclick=()=>{if(!busyBookings.has(booking.id))form.remove();};
  const info=node('p');info.setAttribute('role','status');info.setAttribute('aria-live','polite');form.append(save,cancel,info);block.append(form);
  let attempt=null;
  form.onsubmit=async event=>{
   event.preventDefault();if(busyBookings.has(booking.id)||!form.reportValidity())return;
   const when=inputs.date?new Date(inputs.date.value):null;
   if(when&&(!Number.isFinite(when.getTime())||when<=new Date()||when.getTime()>Date.now()+90*86400000)){info.textContent=errors.invalid_schedule;return;}
   const payload={p_booking:booking.id,p_action:action,p_reason:reason.value.trim(),p_expected_updated_at:booking.updated_at,p_scheduled_at:when?when.toISOString():null,p_duration_minutes:inputs.duration?Number(inputs.duration.value):null,p_cleaner:inputs.cleaner?.value||null};
   if(attempt&&JSON.stringify(attempt.payload)!==JSON.stringify(payload)){info.textContent='Попередню спробу не звірено. Повторіть із тими самими даними або оновіть замовлення.';return;}
   attempt??={id:crypto.randomUUID(),payload};busyBookings.add(booking.id);save.disabled=cancel.disabled=true;info.textContent='Зберігаємо…';
   const controls=[reason,confirm,...Object.values(inputs)];controls.forEach(n=>n.disabled=true);
   try{
    const {error}=await db.rpc('irbi_change_booking',{p_request:attempt.id,...attempt.payload});if(error)throw error;
    attempt=null;info.textContent='Зміну збережено. Клієнту створено сповіщення в кабінеті.';
    try{await refresh();}catch{info.textContent='Зміну збережено. Оновіть сторінку для перевірки стану; повторно надсилати її не потрібно.';}
   }catch(error){
    const known=error.code==='23P01'?'На цей час у клінера вже є замовлення. Оберіть інший час або виконавця.':errors[error.message];
    if(known){attempt=null;info.textContent=known;}else info.textContent='Збереження не підтверджено. Повторіть із тими самими даними — система перевірить цю спробу. Або оновіть замовлення для звірки.';
   }finally{busyBookings.delete(booking.id);save.disabled=cancel.disabled=false;controls.forEach(n=>n.disabled=false);}
  };
 }
}
