-- Managed pre-departure changes. Never charge, refund or erase financial records.
CREATE TABLE public.booking_change_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES public.bookings(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('reschedule','cancel','decline','reassign')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 400),
 fingerprint text NOT NULL,
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,request_id)
);
CREATE INDEX booking_change_events_booking_created_idx ON public.booking_change_events(booking_id,created_at DESC);
ALTER TABLE public.booking_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_change_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_change_events TO authenticated;
CREATE POLICY booking_change_events_staff_read ON public.booking_change_events FOR SELECT TO authenticated
 USING ((SELECT private.irbi_is_staff()));

CREATE FUNCTION private.irbi_booking_version_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
 RETURN NEW;
END $$;
DROP TRIGGER bookings_set_updated_at ON public.bookings;
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION private.irbi_booking_version_stamp();
REVOKE ALL ON FUNCTION private.irbi_booking_version_stamp() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.irbi_change_booking(
 p_request uuid,p_booking uuid,p_action text,p_reason text,p_expected_updated_at timestamptz,
 p_scheduled_at timestamptz DEFAULT NULL,p_duration_minutes integer DEFAULT NULL,p_cleaner uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor_id uuid:=auth.uid(); actor_role text; b public.bookings; changed public.bookings;
 saved public.booking_change_events; signature text; answer jsonb; note text;
 prior_note text:=current_setting('irbi.status_note',true);
 prior_action text:=current_setting('irbi.managed_booking_change',true);
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor_id;
 IF actor_id IS NULL OR actor_role IS NULL OR actor_role NOT IN ('admin','dispatcher','cleaner') THEN RAISE EXCEPTION 'staff_required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN ('reschedule','cancel','decline','reassign') OR p_request IS NULL OR p_booking IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'invalid_change';END IF;
 IF actor_role='cleaner' AND p_action<>'decline' THEN RAISE EXCEPTION 'staff_required' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 400 THEN RAISE EXCEPTION 'reason_required';END IF;
 IF p_action<>'reschedule' AND (p_scheduled_at IS NOT NULL OR p_duration_minutes IS NOT NULL) THEN RAISE EXCEPTION 'invalid_change';END IF;
 IF p_action<>'reassign' AND p_cleaner IS NOT NULL THEN RAISE EXCEPTION 'invalid_change';END IF;
 signature:=encode(sha256(convert_to(jsonb_build_object('booking',p_booking,'action',p_action,'reason',btrim(p_reason),'expected',p_expected_updated_at,'scheduled',p_scheduled_at,'duration',p_duration_minutes,'cleaner',p_cleaner)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_id::text||':'||p_request::text,0));
 SELECT * INTO saved FROM public.booking_change_events WHERE actor=actor_id AND request_id=p_request;
 IF FOUND THEN
  IF saved.fingerprint<>signature THEN RAISE EXCEPTION 'change_request_changed';END IF;
  RETURN saved.result;
 END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found';END IF;
 IF actor_role='cleaner' AND b.assigned_cleaner_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'not_assigned' USING ERRCODE='42501';END IF;
 IF b.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'booking_changed';END IF;
 IF b.status NOT IN ('pending','confirmed','assigned','accepted') OR b.departed_at IS NOT NULL OR b.started_at IS NOT NULL THEN RAISE EXCEPTION 'change_locked';END IF;
 IF p_action IN ('decline','reassign') AND (b.status NOT IN ('assigned','accepted') OR b.assigned_cleaner_id IS NULL) THEN RAISE EXCEPTION 'assignment_required';END IF;
 IF p_action='decline' AND actor_role<>'cleaner' THEN RAISE EXCEPTION 'assigned_cleaner_only' USING ERRCODE='42501';END IF;
 IF p_action='reschedule' THEN
  IF b.status='pending' THEN RAISE EXCEPTION 'confirm_request_first';END IF;
  IF p_scheduled_at IS NULL OR NOT isfinite(p_scheduled_at) OR p_scheduled_at<=now() OR p_scheduled_at>now()+interval '90 days' THEN RAISE EXCEPTION 'invalid_schedule';END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 1440 THEN RAISE EXCEPTION 'invalid_duration';END IF;
  IF p_scheduled_at=b.scheduled_at AND p_duration_minutes=b.duration_minutes THEN RAISE EXCEPTION 'change_not_needed';END IF;
 END IF;
 IF p_action='reassign' THEN
  IF p_cleaner IS NULL OR p_cleaner IS NOT DISTINCT FROM b.assigned_cleaner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_cleaner AND role='cleaner') THEN RAISE EXCEPTION 'invalid_cleaner';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.payment_records WHERE booking_id=b.id AND status IN ('processing','paid','partially_refunded','refunded')) THEN RAISE EXCEPTION 'payment_reconciliation_required';END IF;
 IF EXISTS(SELECT 1 FROM public.cleaner_earnings WHERE booking_id=b.id AND status<>'void') THEN RAISE EXCEPTION 'payroll_reconciliation_required';END IF;
 IF p_action='cancel' AND (
  EXISTS(SELECT 1 FROM public.booking_expenses WHERE booking_id=b.id)
  OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE booking_id=b.id)
 ) THEN RAISE EXCEPTION 'cost_reconciliation_required';END IF;
 IF EXISTS(SELECT 1 FROM public.booking_checklist_items WHERE booking_id=b.id AND resolution<>'pending') THEN RAISE EXCEPTION 'checklist_already_started';END IF;
 note:=(CASE p_action WHEN 'reschedule' THEN 'Перенесення: ' WHEN 'cancel' THEN 'Скасування: ' WHEN 'decline' THEN 'Відмова клінера: ' ELSE 'Зміна клінера: ' END)||CASE WHEN p_action='cancel' THEN btrim(p_reason) ELSE 'Зміну зафіксовано.' END;
 PERFORM set_config('irbi.status_note',note,true);
 PERFORM set_config('irbi.managed_booking_change',p_action,true);
 UPDATE public.bookings SET
  status=CASE WHEN p_action='cancel' THEN 'cancelled' WHEN p_action='decline' THEN 'confirmed' WHEN p_action='reassign' OR (p_action='reschedule' AND assigned_cleaner_id IS NOT NULL) THEN 'assigned' ELSE status END,
  assigned_cleaner_id=CASE WHEN p_action IN ('cancel','decline') THEN NULL WHEN p_action='reassign' THEN p_cleaner ELSE assigned_cleaner_id END,
  scheduled_at=CASE WHEN p_action='reschedule' THEN p_scheduled_at ELSE scheduled_at END,
  duration_minutes=CASE WHEN p_action='reschedule' THEN p_duration_minutes ELSE duration_minutes END,
  accepted_at=NULL,
  cancellation_reason=CASE WHEN p_action='cancel' THEN btrim(p_reason) ELSE cancellation_reason END
 WHERE id=b.id RETURNING * INTO changed;
 -- The status trigger logs transitions; same-status edits need one explicit entry.
 IF b.status=changed.status THEN
  INSERT INTO public.booking_status_history(booking_id,status,changed_by,note) VALUES(b.id,changed.status,actor_id,note);
 END IF;
 INSERT INTO public.irbi_notifications(user_id,booking_id,event_type,title,body)
 VALUES(b.customer_id,b.id,'booking_change',
  CASE p_action WHEN 'reschedule' THEN 'Час прибирання змінено' WHEN 'cancel' THEN 'Замовлення скасовано' WHEN 'decline' THEN 'Потрібне перепризначення клінера' ELSE 'Клінера змінено' END,
  CASE p_action WHEN 'reschedule' THEN 'Перегляньте погоджені дату й тривалість у кабінеті IRBI.' WHEN 'cancel' THEN 'Перегляньте актуальний стан замовлення в кабінеті IRBI. За питаннями зверніться до координатора.' ELSE 'Координатор оновлює призначення виконавця. Перегляньте актуальний стан у кабінеті IRBI.' END);
 PERFORM set_config('irbi.status_note',coalesce(prior_note,''),true);
 PERFORM set_config('irbi.managed_booking_change',coalesce(prior_action,''),true);
 answer:=jsonb_build_object('booking_id',changed.id,'status',changed.status,'scheduled_at',changed.scheduled_at,'updated_at',changed.updated_at);
 INSERT INTO public.booking_change_events(booking_id,actor,request_id,action,reason,fingerprint,before_state,after_state,result)
 VALUES(b.id,actor_id,p_request,p_action,btrim(p_reason),signature,
  jsonb_build_object('status',b.status,'scheduled_at',b.scheduled_at,'duration_minutes',b.duration_minutes,'cleaner',b.assigned_cleaner_id),
  jsonb_build_object('status',changed.status,'scheduled_at',changed.scheduled_at,'duration_minutes',changed.duration_minutes,'cleaner',changed.assigned_cleaner_id),answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.irbi_change_booking(uuid,uuid,text,text,timestamptz,timestamptz,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irbi_change_booking(uuid,uuid,text,text,timestamptz,timestamptz,integer,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.irbi_emit_booking_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare label text; detail text;
begin
 if coalesce(current_setting('irbi.managed_booking_change',true),'') in ('reschedule','cancel','decline','reassign') then return null;end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return null; end if;
 label:=case new.status
 when 'pending' then 'Заявку отримано'
 when 'confirmed' then 'Заявку підтверджено'
 when 'assigned' then 'Виконавця призначено'
 when 'accepted' then 'Клінер прийняв замовлення'
 when 'en_route' then 'Клінер виїхав'
 when 'arrived' then 'Клінер на місці'
 when 'in_progress' then 'Прибирання розпочато'
 when 'completed' then 'Прибирання завершено'
 when 'cancelled' then 'Заявку скасовано'
 else 'Оновлення замовлення' end;
 detail:=case when new.status='pending'
 then 'Заявка очікує підтвердження часу та ціни командою IRBI.'
 when new.status='confirmed' then 'Погоджені параметри можна переглянути у вашому кабінеті.'
 else 'Перегляньте актуальний статус заявки у кабінеті IRBI.' end;
 insert into public.irbi_notifications(user_id,booking_id,event_type,title,body)
 values (new.customer_id,new.id,'booking_status',label,detail);
 return null;
end $function$
;

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
 if p_next_status='cancelled' then raise exception 'use_managed_booking_change';end if;
 if b.status='pending' then raise exception 'confirm_request_first';end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.assign_booking_cleaner(p_booking_id uuid, p_cleaner_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.bookings;
begin
 if auth.uid() is null or not private.irbi_is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 if b.status<>'confirmed' or b.assigned_cleaner_id is not null then raise exception 'Booking is already in execution or closed' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles where id=p_cleaner_id and role='cleaner') then raise exception 'Cleaner profile required' using errcode='22023'; end if;
 -- Serializes concurrent assignments to the same cleaner.
 perform 1 from public.profiles where id=p_cleaner_id for update;
 if b.duration_minutes is null then raise exception 'Set planned duration before assigning cleaner' using errcode='22023'; end if;
 if exists(select 1 from public.bookings other where other.assigned_cleaner_id=p_cleaner_id
  and other.id<>b.id and other.status not in ('cancelled','completed')
  and (other.duration_minutes is null or
   tstzrange(other.scheduled_at,other.scheduled_at+make_interval(mins=>other.duration_minutes),'[)')
   && tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>b.duration_minutes),'[)')))
 then raise exception 'Cleaner has conflicting or incomplete bookings' using errcode='22023'; end if;
 if exists(select 1 from public.cleaner_availability a where a.cleaner_id=p_cleaner_id and a.availability_type='unavailable'
  and tstzrange(a.starts_at,a.ends_at,'[)') &&
   tstzrange(b.scheduled_at,b.scheduled_at+make_interval(mins=>b.duration_minutes),'[)'))
 then raise exception 'Cleaner is unavailable at this time' using errcode='22023'; end if;
 update public.bookings set assigned_cleaner_id=p_cleaner_id,status='assigned' where id=b.id returning * into b;
 return b;
end $function$
;

CREATE OR REPLACE FUNCTION public.irbi_admin_payroll_action(p_booking uuid, p_cleaner uuid, p_entry_type text, p_amount numeric, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := (select auth.uid()); existing public.cleaner_earnings%rowtype;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='admin') then
  raise exception 'Лише адміністратор може керувати оплатою';
 end if;
 if p_entry_type not in ('cleaning','coordination','travel','mentoring','adjustment') then
  raise exception 'Некоректний тип нарахування';
 end if;
 if p_action not in ('draft','approve','paid','void') then raise exception 'Некоректна дія'; end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 then raise exception 'Некоректна сума'; end if;
 perform 1 from public.bookings where id=p_booking for update;
 if not exists(select 1 from public.bookings where id=p_booking and assigned_cleaner_id=p_cleaner) then
  raise exception 'Клінер не призначений на це замовлення';
 end if;
 select * into existing from public.cleaner_earnings
 where booking_id=p_booking and cleaner_id=p_cleaner and entry_type=p_entry_type for update;
 if found and existing.status='paid' then raise exception 'Оплачене нарахування не можна змінити'; end if;
 if found and existing.status='approved' and p_action='draft' then raise exception 'Затверджене нарахування не можна повернути в чернетку'; end if;
 if p_action='paid' and (not found or existing.status<>'approved' or existing.amount is distinct from p_amount) then
  raise exception 'Спершу затвердіть нарахування з цією сумою';
 end if;
 if p_action='approve' and p_amount=0 then raise exception 'Нульова сума не може бути затверджена'; end if;
 insert into public.cleaner_earnings(booking_id,cleaner_id,entry_type,amount,status,basis_note,approved_by,paid_at)
 values(p_booking,p_cleaner,p_entry_type,p_amount,
 case when p_action='approve' then 'approved' when p_action='paid' then 'paid' when p_action='void' then 'void' else 'draft' end,
 nullif(trim(p_note),''),
 case when p_action in ('approve','paid') then actor else null end,
 case when p_action='paid' then now() else null end)
 on conflict(booking_id,cleaner_id,entry_type) do update set
 amount=excluded.amount,status=excluded.status,basis_note=excluded.basis_note,
 approved_by=excluded.approved_by,paid_at=excluded.paid_at;
 insert into public.payroll_audit(booking_id,cleaner_id,entry_type,prior_status,new_status,prior_amount,new_amount,actor,note)
 values (p_booking,p_cleaner,p_entry_type,
 case when existing.id is not null then existing.status else null end,
 case when p_action='approve' then 'approved' when p_action='paid' then 'paid' when p_action='void' then 'void' else 'draft' end,
 existing.amount,p_amount,actor,nullif(trim(p_note),''));
end $function$
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
  if role_name not in ('dispatcher','admin') or b.status<>'confirmed' or b.assigned_cleaner_id is not null then raise exception 'assignment_forbidden'; end if;
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
