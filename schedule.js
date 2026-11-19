// Query the calendar independently of the recent-orders list.
export async function loadScheduleBookings(db,role,userId,from,until){
 const start=from.toISOString(),end=until.toISOString();
 const pageSize=500,bookings=[];
 for(let offset=0;;offset+=pageSize){
  let query=db.from('bookings')
   .select('id,scheduled_at,scheduled_end_at,status,assigned_cleaner_id,duration_minutes')
   .not('status','in','(cancelled,completed)')
   .lt('scheduled_at',end)
   .or('scheduled_end_at.gt.'+start+',and(scheduled_end_at.is.null,scheduled_at.gte.'+start+')')
   .order('scheduled_at',{ascending:true}).order('id',{ascending:true});
  if(role==='cleaner')query=query.eq('assigned_cleaner_id',userId);
  const {data,error}=await query.range(offset,offset+pageSize-1);
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('schedule_data_unavailable');
  bookings.push(...data);
  if(data.length<pageSize)return bookings;
 }
}
