-- Reject missing profiles and NULL inputs before privileged operations.
CREATE OR REPLACE FUNCTION public.irbi_checklist_action(p_item uuid, p_done boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid(); r text; b uuid;
begin
 select role into r from public.profiles where id=actor;
 select booking_id into b from public.booking_checklist_items where id=p_item;
 if actor is null or b is null or r is null or r not in ('cleaner','dispatcher','admin') then raise exception 'forbidden'; end if;
 if r='cleaner' and not exists(select 1 from public.bookings where id=b and assigned_cleaner_id=actor and status='in_progress') then raise exception 'forbidden'; end if;
 update public.booking_checklist_items set is_done=p_done,completed_by=case when p_done then actor else null end,completed_at=case when p_done then now() else null end where id=p_item;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.irbi_checklist_resolve(p_item uuid, p_resolution text, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid();r text;b public.bookings%rowtype;
begin
 select role into r from public.profiles where id=actor;
 if actor is null or r is null or r not in ('cleaner','dispatcher','admin') then raise exception 'forbidden'; end if;
 select bk.* into b from public.booking_checklist_items ci join public.bookings bk on bk.id=ci.booking_id where ci.id=p_item for update of bk;
 if not found then raise exception 'checklist_not_found';end if;
 if r='cleaner' and b.assigned_cleaner_id is distinct from actor then raise exception 'not_assigned';end if;
 if b.status<>'in_progress' then raise exception 'booking_not_in_progress';end if;
 if p_resolution is null or p_resolution not in ('done','not_applicable','not_done') then raise exception 'invalid_resolution';end if;
 if p_resolution in ('not_applicable','not_done') and length(trim(coalesce(p_reason,'')))<3 then raise exception 'reason_required';end if;
 update public.booking_checklist_items set resolution=p_resolution,resolution_reason=case when p_resolution='done' then null else left(p_reason,500) end,is_done=(p_resolution='done'),completed_by=actor,completed_at=now() where id=p_item;
 return true;
end $function$;

CREATE OR REPLACE FUNCTION public.irbi_set_shift(p_start timestamp with time zone, p_end timestamp with time zone, p_type text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid();r text;result uuid;
begin
 select role into r from public.profiles where id=actor;
 if actor is null or r is distinct from 'cleaner' then raise exception 'cleaner_only';end if;
 if p_start is null or p_end is null or p_type is null or p_end<=p_start or p_end>p_start+interval '30 days' or p_start<now()-interval '1 day' or p_type not in ('available','unavailable') then raise exception 'invalid_shift';end if;
 if p_type='unavailable' and exists(select 1 from public.bookings b where b.assigned_cleaner_id=actor and b.status not in ('cancelled','completed') and b.scheduled_end_at is not null and tstzrange(b.scheduled_at,b.scheduled_end_at,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'shift_conflicts_with_booking';end if;
 insert into public.cleaner_availability(cleaner_id,starts_at,ends_at,availability_type,note) values(actor,p_start,p_end,p_type,left(coalesce(p_note,''),300)) returning id into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.irbi_staff_action(p_booking uuid, p_action text, p_cleaner uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid(); role_name text; b public.bookings%rowtype; next_status text; stamp text;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 select role into role_name from public.profiles where id=actor;
 if role_name is null or role_name not in ('cleaner','dispatcher','admin') then raise exception 'forbidden'; end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'booking_not_found'; end if;
 if p_action='assign' then
  if role_name not in ('dispatcher','admin') or b.status not in ('pending','confirmed','assigned') then raise exception 'assignment_forbidden'; end if;
  if p_cleaner is null or not exists(select 1 from public.profiles where id=p_cleaner and role='cleaner') then raise exception 'invalid_cleaner'; end if;
  update public.bookings set assigned_cleaner_id=p_cleaner,status='assigned' where id=p_booking;
  next_status:='assigned';
 else
  if role_name='cleaner' and b.assigned_cleaner_id is distinct from actor then raise exception 'not_assigned'; end if;
  next_status:=case when p_action='accept' and b.status='assigned' then 'accepted'
   when p_action='depart' and b.status='accepted' then 'en_route'
   when p_action='arrive' and b.status='en_route' then 'arrived'
   when p_action='start' and b.status='arrived' then 'in_progress'
   when p_action='finish' and b.status='in_progress' then 'completed'
   else null end;
  if next_status is null then raise exception 'invalid_transition'; end if;
  if next_status='completed' and (not exists(select 1 from public.booking_checklist_items where booking_id=p_booking) or exists(select 1 from public.booking_checklist_items where booking_id=p_booking and is_required and resolution in ('pending','not_done'))) then raise exception 'required_checklist_incomplete'; end if;
  stamp:=case next_status when 'accepted' then 'accepted_at' when 'en_route' then 'departed_at' when 'arrived' then 'arrived_at' when 'in_progress' then 'started_at' else 'completed_at' end;
  execute format('update public.bookings set status=$1,%I=now() where id=$2',stamp) using next_status,p_booking;
 end if;
 insert into public.booking_status_history(booking_id,status,changed_by,note) values (p_booking,next_status,actor,left(coalesce(p_note,''),400));
 return next_status;
end $function$;

CREATE OR REPLACE FUNCTION public.irbi_staff_set_features(p_booking uuid, p_features jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid();r text;b public.bookings%rowtype; k text; n integer;
begin
 select role into r from public.profiles where id=actor;
 if actor is null or r is null or r not in ('dispatcher','admin') then raise exception 'forbidden';end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found or b.status not in ('pending','confirmed','assigned') then raise exception 'features_locked';end if;
 if p_features is null or jsonb_typeof(p_features)<>'object' then raise exception 'invalid_features';end if;
 for k in select jsonb_object_keys(p_features) loop
  if k not in ('dishwasher','microwave','oven','fridge','hood','radiator','carpet','soft_furniture','balcony') or jsonb_typeof(p_features->k)<>'boolean' then raise exception 'invalid_feature';end if;
 end loop;
 if exists(select 1 from public.booking_checklist_items where booking_id=p_booking and resolution<>'pending') then raise exception 'checklist_already_started';end if;
 update public.bookings set cleaning_features=p_features where id=p_booking;
 delete from public.booking_checklist_items where booking_id=p_booking;
 if b.assigned_cleaner_id is not null then n:=private.irbi_seed_checklist_for_booking(p_booking);else n:=0;end if;
 return n;
end $function$;
