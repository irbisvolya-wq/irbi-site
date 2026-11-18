-- Keep legacy boolean checklist APIs consistent with resolution-based completion.
CREATE OR REPLACE FUNCTION public.advance_booking_status(p_booking_id uuid, p_next_status text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.bookings; staff boolean; at_time timestamptz:=clock_timestamp(); expected text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 staff:=private.irbi_is_staff();
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or (not staff and b.assigned_cleaner_id is distinct from auth.uid()) then
  raise exception 'Booking unavailable' using errcode='42501'; end if;
 if not staff and not exists(select 1 from public.profiles where id=auth.uid() and role='cleaner')
 then raise exception 'Cleaner access required' using errcode='42501'; end if;
 if b.status=p_next_status then return b; end if;
 expected:=case b.status when 'pending' then 'confirmed' when 'assigned' then 'accepted'
 when 'accepted' then 'en_route' when 'en_route' then 'arrived'
 when 'arrived' then 'in_progress' when 'in_progress' then 'completed' else null end;
 if not coalesce(((p_next_status=expected and (b.status<>'pending' or staff))
  or (staff and p_next_status='cancelled' and b.status not in ('completed','cancelled'))),false) then
  raise exception 'Invalid status transition' using errcode='22023'; end if;
 if p_next_status='completed' and (not exists(select 1 from public.booking_checklist_items where booking_id=b.id) or exists(select 1 from public.booking_checklist_items where booking_id=b.id and is_required and resolution not in ('done','not_applicable')))
 then raise exception 'Complete required checklist first' using errcode='22023'; end if;
 update public.bookings set status=p_next_status,
 accepted_at=case when p_next_status='accepted' then at_time else accepted_at end,
 departed_at=case when p_next_status='en_route' then at_time else departed_at end,
 arrived_at=case when p_next_status='arrived' then at_time else arrived_at end,
 started_at=case when p_next_status='in_progress' then at_time else started_at end,
 completed_at=case when p_next_status='completed' then at_time else completed_at end
 where id=b.id returning * into b;
 return b;
end $function$;

CREATE OR REPLACE FUNCTION public.set_booking_checklist_item(p_item_id uuid, p_done boolean, p_note text DEFAULT NULL::text)
 RETURNS booking_checklist_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item public.booking_checklist_items; b public.bookings;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_done is null then raise exception 'Completion value required' using errcode='22023'; end if;
 select * into item from public.booking_checklist_items where id=p_item_id for update;
 if not found then raise exception 'Checklist item unavailable' using errcode='42501'; end if;
 select * into b from public.bookings where id=item.booking_id for update;
 if not private.irbi_is_staff() and not (b.assigned_cleaner_id is not distinct from auth.uid()
 and exists(select 1 from public.profiles where id=auth.uid() and role='cleaner'))
 then raise exception 'Checklist item unavailable' using errcode='42501'; end if;
 if b.status<>'in_progress' then raise exception 'Cleaning must be in progress' using errcode='22023'; end if;
 update public.booking_checklist_items set is_done=p_done,resolution=case when p_done then 'done' else 'pending' end,resolution_reason=null,
 completed_by=case when p_done then auth.uid() else null end,
 completed_at=case when p_done then clock_timestamp() else null end,note=p_note
 where id=item.id returning * into item;
 return item;
end $function$;

CREATE OR REPLACE FUNCTION public.irbi_checklist_action(p_item uuid,p_done boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
 perform public.set_booking_checklist_item(p_item,p_done,null);
 return true;
end
$function$;

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
 update public.booking_checklist_items set resolution=p_resolution,resolution_reason=case when p_resolution='done' then null else left(p_reason,500) end,is_done=(p_resolution='done'),completed_by=case when p_resolution='done' then actor else null end,completed_at=case when p_resolution='done' then now() else null end where id=p_item;
 return true;
end $function$;
