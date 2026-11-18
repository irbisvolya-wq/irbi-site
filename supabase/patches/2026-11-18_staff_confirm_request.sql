-- Confirm an agreed request before assigning a cleaner.
CREATE OR REPLACE FUNCTION public.irbi_staff_confirm_request(
 p_booking uuid,p_scheduled_at timestamptz,p_duration_minutes integer,
 p_total numeric,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare b public.bookings; actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role in ('dispatcher','admin'))
 then raise exception 'staff_required' using errcode='42501';end if;
 if p_scheduled_at is null or not isfinite(p_scheduled_at) or p_scheduled_at<=now()
 then raise exception 'future_schedule_required' using errcode='22023';end if;
 if p_duration_minutes is null or p_duration_minutes not between 15 and 1440
 then raise exception 'invalid_duration' using errcode='22023';end if;
 if p_total is null or p_total<0 or p_total>1000000 or p_total<>round(p_total,2)
 then raise exception 'invalid_total' using errcode='22023';end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'booking_not_found';end if;
 if b.status not in ('pending','confirmed') or b.assigned_cleaner_id is not null
 then raise exception 'booking_locked';end if;
 if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at
 then raise exception 'booking_changed';end if;
 update public.bookings set scheduled_at=p_scheduled_at,duration_minutes=p_duration_minutes,
 subtotal=p_total+discount,total=p_total,status='confirmed' where id=p_booking;
end
$function$;
REVOKE ALL ON FUNCTION public.irbi_staff_confirm_request(uuid,timestamptz,integer,numeric,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irbi_staff_confirm_request(uuid,timestamptz,integer,numeric,timestamptz) TO authenticated;
