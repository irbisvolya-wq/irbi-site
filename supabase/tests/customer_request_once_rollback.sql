BEGIN;
DO $test$
DECLARE actor uuid; token uuid:=gen_random_uuid(); request jsonb; first_id uuid; second_id uuid; failure text; initial_count bigint;
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE role='customer' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Missing customer fixture';END IF;
 request:=jsonb_build_object('p_service','regular','p_rooms',1,'p_scheduled_at',now()+interval '2 days',
 'p_address','IRBI rollback-only idempotency test','p_property_type','apartment','p_bathrooms',1,
 'p_area_m2',35,'p_phone','+380000000000','p_apartment','','p_entrance','','p_floor','','p_access_notes','','p_frequency','once','p_addons','{}'::jsonb);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO initial_count FROM public.bookings WHERE customer_id=actor;
 first_id:=public.irbi_customer_request_once(token,request);
 second_id:=public.irbi_customer_request_once(token,request);
 IF first_id IS DISTINCT FROM second_id THEN RAISE EXCEPTION 'Retry created a new booking';END IF;
 IF (SELECT count(*) FROM public.bookings WHERE customer_id=actor)<>initial_count+1 THEN RAISE EXCEPTION 'Unexpected booking count';END IF;
 BEGIN
  PERFORM public.irbi_customer_request_once(token,request||jsonb_build_object('p_rooms',2));
 EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'request_changed' THEN RAISE EXCEPTION 'Changed retry was not rejected: %',failure;END IF;
 failure:=null;
 BEGIN
  PERFORM public.irbi_customer_request_once(gen_random_uuid(),request-'p_service');
 EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'invalid_request' THEN RAISE EXCEPTION 'Missing fields accepted: %',failure;END IF;
 IF has_table_privilege('authenticated','private.irbi_request_receipts','SELECT') THEN RAISE EXCEPTION 'Receipts readable by client';END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 failure:=null;
 BEGIN PERFORM public.irbi_customer_request_once(token,request);EXCEPTION WHEN OTHERS THEN failure:=sqlerrm;END;
 IF failure IS DISTINCT FROM 'customer_required' THEN RAISE EXCEPTION 'Unauthenticated retry accepted: %',failure;END IF;
END $test$;
ROLLBACK;
