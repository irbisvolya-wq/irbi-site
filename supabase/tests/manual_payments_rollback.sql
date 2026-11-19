BEGIN;
DO $test$
DECLARE admin_id uuid; customer_id uuid; booking_id uuid; token uuid:=gen_random_uuid(); receipt uuid; retry uuid; stamp timestamptz:=now(); failure text;
BEGIN

 SELECT id INTO customer_id FROM public.profiles WHERE role='customer' LIMIT 1;
 IF customer_id IS NULL THEN RAISE EXCEPTION 'Missing customer fixture';END IF;
 admin_id:=customer_id;
 UPDATE public.profiles SET role='admin' WHERE id=admin_id; -- rollback-only, invisible to other sessions
 INSERT INTO public.bookings(customer_id,status,scheduled_at,address,service_type,subtotal,discount,total) VALUES(customer_id,'completed',now()-interval '1 day','IRBI rollback-only manual payment test','regular',1200,0,1200) RETURNING id INTO booking_id;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 receipt:=public.irbi_record_manual_payment(token,booking_id,500,'cash',stamp,'Test received cash');
 retry:=public.irbi_record_manual_payment(token,booking_id,500,'cash',stamp,'Test received cash');
 IF receipt IS DISTINCT FROM retry THEN RAISE EXCEPTION 'Duplicate payment';END IF;
 IF (SELECT count(*) FROM public.payment_records WHERE id=receipt)<>1 THEN RAISE EXCEPTION 'Missing receipt';END IF;
 BEGIN PERFORM public.irbi_record_manual_payment(token,booking_id,600,'cash',stamp,'Test received cash');EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'payment_request_changed' THEN RAISE EXCEPTION 'Changed receipt accepted: %',failure;END IF;
 failure:=null;
 BEGIN PERFORM public.irbi_record_manual_payment(gen_random_uuid(),booking_id,701,'bank_transfer',stamp,'Test excess');EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'payment_exceeds_balance' THEN RAISE EXCEPTION 'Overpayment accepted: %',failure;END IF;
 PERFORM public.irbi_record_manual_payment(gen_random_uuid(),booking_id,700,'bank_transfer',stamp,'Test remaining payment');
 EXECUTE 'RESET ROLE';
 UPDATE public.profiles SET role='customer' WHERE id=customer_id;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',customer_id,'role','authenticated')::text,true);
 failure:=null;
 BEGIN PERFORM public.irbi_record_manual_payment(gen_random_uuid(),booking_id,1,'cash',stamp,'Unauthorized');EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'admin_required' THEN RAISE EXCEPTION 'Customer wrote payment: %',failure;END IF;
END $test$;
ROLLBACK;
