BEGIN;
DO $test$
<<launch_order_cycle>>
DECLARE customer_id uuid; cleaner_id uuid; admin_id uuid; dispatcher_id uuid; booking_id uuid; item_id uuid; stamp timestamptz; request jsonb; result text; summary record;
BEGIN
 SELECT id INTO dispatcher_id FROM public.profiles WHERE role='dispatcher' LIMIT 1;
 SELECT id INTO customer_id FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;
 SELECT id INTO cleaner_id FROM public.profiles WHERE role='customer' AND id<>customer_id ORDER BY id LIMIT 1;
 SELECT id INTO admin_id FROM public.profiles WHERE role='customer' AND id NOT IN (customer_id,cleaner_id) ORDER BY id LIMIT 1;
 IF dispatcher_id IS NULL OR admin_id IS NULL OR cleaner_id IS NULL THEN RAISE EXCEPTION 'Missing launch fixtures';END IF;
 -- Role changes exist only inside this transaction and are rolled back.
 UPDATE public.profiles SET role='cleaner' WHERE id=cleaner_id;
 UPDATE public.profiles SET role='admin' WHERE id=admin_id;
 PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',customer_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 request:=jsonb_build_object('p_service','regular','p_rooms',1,'p_scheduled_at',now()+interval '80 days','p_address','IRBI rollback-only full order cycle','p_property_type','apartment','p_bathrooms',1,'p_area_m2',35,'p_phone','+380000000000','p_apartment','','p_entrance','','p_floor','','p_access_notes','','p_frequency','once','p_addons','{}'::jsonb);
 booking_id:=public.irbi_customer_request_once(gen_random_uuid(),request);
 IF (SELECT status FROM public.bookings WHERE id=booking_id)<>'pending' THEN RAISE EXCEPTION 'Request not pending';END IF;
 PERFORM set_config('request.jwt.claim.sub',dispatcher_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',dispatcher_id,'role','authenticated')::text,true);
 SELECT updated_at INTO stamp FROM public.bookings WHERE id=booking_id;
 PERFORM public.irbi_staff_confirm_request(booking_id,now()+interval '80 days',120,1200,stamp);
 PERFORM public.irbi_staff_action(booking_id,'assign',cleaner_id,null);
 PERFORM set_config('request.jwt.claim.sub',cleaner_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',cleaner_id,'role','authenticated')::text,true);
 PERFORM public.irbi_staff_action(booking_id,'accept',null,null);
 PERFORM public.irbi_staff_action(booking_id,'depart',null,null);
 PERFORM public.irbi_staff_action(booking_id,'arrive',null,null);
 PERFORM public.irbi_staff_action(booking_id,'start',null,null);
 result:=null;
 BEGIN PERFORM public.irbi_staff_action(booking_id,'finish',null,null);EXCEPTION WHEN OTHERS THEN result:=sqlerrm;END;
 IF result IS NULL THEN RAISE EXCEPTION 'Finished without checklist';END IF;
 FOR item_id IN SELECT id FROM public.booking_checklist_items WHERE booking_checklist_items.booking_id=launch_order_cycle.booking_id LOOP
  PERFORM public.irbi_checklist_resolve(item_id,'done',null);
 END LOOP;
 PERFORM public.irbi_staff_action(booking_id,'finish',null,null);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
 PERFORM public.irbi_record_manual_payment(gen_random_uuid(),booking_id,1200,'cash',now(),'Rollback test cash');
 PERFORM public.irbi_admin_payroll_action(booking_id,cleaner_id,'cleaning',600,'approve','Rollback test earning');
 SELECT * INTO summary FROM public.irbi_booking_finance WHERE irbi_booking_finance.booking_id=launch_order_cycle.booking_id;
 IF summary.paid_revenue<>1200 OR summary.labor_cost<>600 OR summary.planned_contribution<>600 THEN RAISE EXCEPTION 'Finance reconciliation failed';END IF;
 PERFORM public.irbi_admin_payroll_action(booking_id,cleaner_id,'cleaning',600,'paid','Rollback test paid');
 PERFORM set_config('request.jwt.claim.sub',cleaner_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',cleaner_id,'role','authenticated')::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.cleaner_earnings WHERE cleaner_earnings.booking_id=launch_order_cycle.booking_id AND status='paid' AND amount=600) THEN RAISE EXCEPTION 'Cleaner cannot see earnings';END IF;
END $test$;
ROLLBACK;
