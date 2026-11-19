export async function loadVisibleOrders(db,role,userId,visibleLimit=50){
 if(!Number.isInteger(visibleLimit)||visibleLimit<1)throw new Error('invalid_limit');
 const rows=[];
 while(rows.length<visibleLimit+1){
  const offset=rows.length;
  const end=Math.min(offset+499,visibleLimit);
  let query=db.from('bookings').select('id,scheduled_at,status,total,assigned_cleaner_id,service_type,rooms,bathrooms,area_m2,property_type,address,apartment,entrance,floor,contact_phone,access_notes,created_at,cleaning_features,photo_consent,duration_minutes,scheduled_end_at,updated_at')
   .order('created_at',{ascending:false}).order('id',{ascending:false});
  if(role==='cleaner')query=query.eq('assigned_cleaner_id',userId);
  if(role==='customer')query=query.eq('customer_id',userId);
  const {data,error}=await query.range(offset,end);
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('orders_unavailable');
  rows.push(...data);
  if(data.length<end-offset+1)break;
 }
 return {orders:rows.slice(0,visibleLimit),hasMore:rows.length>visibleLimit};
}
