begin;
do $test$
declare owner_id uuid; staff_id uuid; test_id uuid; stamp timestamptz; actual text; q text; expected text; b public.bookings; checks integer:=0;
begin
 select id into owner_id from public.profiles where role='customer' limit 1;
 select id into staff_id from public.profiles where role='dispatcher' limit 1;
 if owner_id is null or staff_id is null then raise exception 'Missing fixtures';end if;
 insert into public.bookings(customer_id,scheduled_at,address,service_type,subtotal,discount,total)
 values(owner_id,now()+interval '90 days','IRBI rollback-only confirmation verification','regular',1500,100,1400) returning id,updated_at into test_id,stamp;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 actual:=null;begin perform public.irbi_staff_confirm_request(test_id,now()+interval '90 days',120,1600,stamp);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'staff_required' then raise exception 'Customer authorization failed: %',actual;end if;checks:=checks+1;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
 for q,expected in select * from (values
 (format('select public.irbi_staff_confirm_request(%L,now()-interval ''1 day'',120,1600,%L)',test_id,stamp),'future_schedule_required'),
 (format('select public.irbi_staff_confirm_request(%L,''infinity''::timestamptz,120,1600,%L)',test_id,stamp),'future_schedule_required'),
 (format('select public.irbi_staff_confirm_request(%L,now()+interval ''90 days'',0,1600,%L)',test_id,stamp),'invalid_duration'),
 (format('select public.irbi_staff_confirm_request(%L,now()+interval ''90 days'',120,-1,%L)',test_id,stamp),'invalid_total'),
 (format('select public.irbi_staff_confirm_request(%L,now()+interval ''90 days'',120,1600.001,%L)',test_id,stamp),'invalid_total'),
 (format('select public.irbi_staff_confirm_request(%L,now()+interval ''90 days'',120,1600,%L)',test_id,stamp-interval '1 second'),'booking_changed')
 )tests(q,msg) loop
 actual:=null;begin execute q;exception when others then actual:=sqlerrm;end;
 if actual is distinct from expected then raise exception 'Expected %, got %',expected,actual;end if;checks:=checks+1;
 end loop;
 perform public.irbi_staff_confirm_request(test_id,now()+interval '90 days',120,1600,stamp);
 select * into b from public.bookings where id=test_id;
 if b.status<>'confirmed' or b.duration_minutes<>120 or b.total<>1600 or b.subtotal<>1700 or b.discount<>100 or b.scheduled_end_at is distinct from b.scheduled_at+interval '120 minutes'
 then raise exception 'Confirmation values incorrect';end if;checks:=checks+1;
 execute 'reset role';
 update public.bookings set status='cancelled' where id=test_id;
 execute 'set local role authenticated';
 actual:=null;begin perform public.irbi_staff_confirm_request(test_id,now()+interval '90 days',120,1600,stamp);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'booking_locked' then raise exception 'Closed booking edit accepted: %',actual;end if;checks:=checks+1;
 if checks<>9 then raise exception 'Unexpected count %',checks;end if;
end $test$;
rollback;
select 'PASS: 9 confirmation, permission, validation, stale-edit and pricing scenarios; fixtures rolled back' result;