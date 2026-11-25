const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const leadStatuses={new:'Нові',in_progress:'У роботі',notified:'Повідомлено про запуск',closed:'Закрито'};
export function leadActions(lead,role,userId){
 if(!['admin','dispatcher'].includes(role))return [];
 const own=lead.processing_owner===userId;
 if(lead.processing_owner&&!own&&role!=='admin')return [];
 if(!own)return ['take'];
 if(lead.processing_status==='in_progress')return ['note','notify','close'];
 if(lead.processing_status==='notified')return ['take','close'];
 return ['take'];
}
export async function loadLeadPage(db,{status='new',cursor=null,limit=50}={}){
 if((status!=='all'&&!Object.hasOwn(leadStatuses,status))||!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_page');
 if(cursor&&(!uuid.test(cursor.id)||!Number.isFinite(new Date(cursor.created_at).getTime())))throw Error('invalid_cursor');
 const {data,error}=await db.rpc('irbi_prelaunch_inbox',{p_status:status,p_after_created_at:cursor?.created_at||null,p_after_id:cursor?.id||null,p_limit:limit});
 if(error)throw error;
 if(!data||!Array.isArray(data.items)||typeof data.has_more!=='boolean'||!data.counts||typeof data.counts!=='object'||Array.isArray(data.counts)||Object.values(data.counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('invalid_snapshot');
 if(data.items.some(i=>!uuid.test(i.id)||!Object.hasOwn(leadStatuses,i.processing_status)))throw Error('invalid_snapshot');
 if(data.has_more&&(!data.items.length||!data.next_cursor||!uuid.test(data.next_cursor.id)||!Number.isFinite(new Date(data.next_cursor.created_at).getTime())||(cursor&&data.next_cursor.id===cursor.id&&data.next_cursor.created_at===cursor.created_at)))throw Error('invalid_cursor');
 return data;
}
