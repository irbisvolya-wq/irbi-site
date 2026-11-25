CREATE OR REPLACE FUNCTION public.log_booking_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.booking_status_history (booking_id, status, changed_by, note)
    values (new.id, new.status, auth.uid(), nullif(left(current_setting('irbi.status_note',true),400),''));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.irbi_staff_action(p_booking uuid, p_action text, p_cleaner uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid(); role_name text; b public.bookings%rowtype; next_status text; stamp text; prior_note text:=current_setting('irbi.status_note',true);
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 select role into role_name from public.profiles where id=actor;
 if role_name is null or role_name not in ('cleaner','dispatcher','admin') then raise exception 'forbidden'; end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'booking_not_found'; end if;
 perform set_config('irbi.status_note',left(coalesce(p_note,''),400),true);
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
 perform set_config('irbi.status_note',coalesce(prior_note,''),true);
 return next_status;
end $function$
;

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
 update public.bookings set cleaning_features=coalesce(b.cleaning_features,'{}'::jsonb)||p_features where id=p_booking;
 delete from public.booking_checklist_items where booking_id=p_booking;
 if b.assigned_cleaner_id is not null then n:=private.irbi_seed_checklist_for_booking(p_booking);else n:=0;end if;
 return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.irbi_photo_consent(p_booking uuid, p_consent boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid();r text;
begin
 select role into r from public.profiles where id=actor;
 if actor is null or r is null or r not in ('dispatcher','admin') then raise exception 'forbidden';end if;
 if p_consent is null then raise exception 'invalid_consent';end if;
 update public.bookings set photo_consent=p_consent,photo_consent_recorded_at=now(),photo_consent_recorded_by=actor where id=p_booking;
 if not found then raise exception 'booking_not_found';end if;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.irbi_register_photo(p_booking uuid, p_path text, p_purpose text, p_caption text DEFAULT NULL::text, p_issue uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare actor uuid:=auth.uid();r text;b public.bookings%rowtype;photo_id uuid;
begin
 select role into r from public.profiles where id=actor;
 select * into b from public.bookings where id=p_booking;
 if actor is null or b.id is null or not b.photo_consent or r is null or r not in ('cleaner','dispatcher','admin') or (r='cleaner' and b.assigned_cleaner_id is distinct from actor) then raise exception 'forbidden';end if;
 if p_path not like p_booking::text||'/%' or length(p_path)>400 or p_purpose not in ('before','after','issue','other') then raise exception 'invalid_photo';end if;
 if p_issue is not null and not exists(select 1 from public.booking_issues where id=p_issue and booking_id=p_booking) then raise exception 'invalid_issue';end if;
 if not exists(select 1 from storage.objects where bucket_id='irbi-job-photos' and name=p_path) then raise exception 'file_not_uploaded';end if;
 insert into public.booking_photos(booking_id,issue_id,uploaded_by,storage_bucket,object_path,purpose,caption,authorization_note)
 values(p_booking,p_issue,actor,'irbi-job-photos',p_path,p_purpose,left(coalesce(p_caption,''),500),'Recorded consent in bookings.photo_consent')
 returning id into photo_id;
 return photo_id;
end $function$
;
