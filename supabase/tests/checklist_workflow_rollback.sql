-- Integration verification. Runs with disposable booking and role changes inside a rolled-back transaction.
begin;
do $test$
declare owner_id uuid; cleaner_id uuid; coordinator_id uuid; test_booking uuid; item_a uuid; item_b uuid; result_row public.bookings; actual text; checks int:=0;
begin
 select id into owner_id from public.profiles where role='customer' order by id limit 1;
 select id into cleaner_id from public.profiles where role='customer' and id<>owner_id order by id limit 1;
 select id into coordinator_id from public.profiles where role='dispatcher' limit 1;
 if owner_id is null or cleaner_id is null or coordinator_id is null then raise exception 'Missing fixtures';end if;
 update public.profiles set role='cleaner' where id=cleaner_id;
 insert into public.bookings(customer_id,status,scheduled_at,duration_minutes,address,service_type)
 values(owner_id,'pending',now()+interval '90 days',60,'IRBI rollback-only workflow verification','regular') returning id into test_booking;
 perform set_config('request.jwt.claim.sub',coordinator_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',coordinator_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if public.irbi_staff_action(test_booking,'assign',cleaner_id,null)<>'assigned' then raise exception 'Assignment failed';end if;
 checks:=checks+1;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 actual:=null;begin perform public.irbi_staff_action(test_booking,'accept',null,null);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'forbidden' then raise exception 'Customer could accept: %',actual;end if;checks:=checks+1;
 perform set_config('request.jwt.claim.sub',cleaner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',cleaner_id,'role','authenticated')::text,true);
 actual:=null;begin perform public.irbi_staff_action(test_booking,'start',null,null);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'invalid_transition' then raise exception 'Skipped status accepted: %',actual;end if;checks:=checks+1;
 perform public.irbi_staff_action(test_booking,'accept',null,null);
 perform public.irbi_staff_action(test_booking,'depart',null,null);
 perform public.irbi_staff_action(test_booking,'arrive',null,null);
 perform public.irbi_staff_action(test_booking,'start',null,null);checks:=checks+4;
 execute 'reset role';
 delete from public.booking_checklist_items where booking_id=test_booking; 

 insert into public.booking_checklist_items(booking_id,section,label,is_required) values(test_booking,'QA','Required A',true) returning id into item_a;
 insert into public.booking_checklist_items(booking_id,section,label,is_required) values(test_booking,'QA','Required B',true) returning id into item_b;
 execute 'set local role authenticated';
 actual:=null;begin perform public.advance_booking_status(test_booking,'completed');exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'Complete required checklist first' then raise exception 'Pending completion accepted: %',actual;end if;checks:=checks+1;
 perform public.irbi_checklist_action(item_a,true);
 if not exists(select 1 from public.booking_checklist_items where id=item_a and is_done and resolution='done') then raise exception 'Boolean checklist did not synchronize';end if;checks:=checks+1;
 perform public.set_booking_checklist_item(item_a,false,'Reopened');
 if not exists(select 1 from public.booking_checklist_items where id=item_a and not is_done and resolution='pending' and completed_by is null) then raise exception 'Reopen did not synchronize';end if;checks:=checks+1;
 perform public.irbi_checklist_resolve(item_a,'done',null);checks:=checks+1;
 actual:=null;begin perform public.irbi_checklist_resolve(item_b,'not_applicable','');exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'reason_required' then raise exception 'Missing reason accepted: %',actual;end if;checks:=checks+1;
 perform public.irbi_checklist_resolve(item_b,'not_done','Rollback test exception');
 actual:=null;begin perform public.irbi_staff_action(test_booking,'finish',null,null);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'required_checklist_incomplete' then raise exception 'Incomplete checklist accepted: %',actual;end if;checks:=checks+1;
 perform public.irbi_checklist_resolve(item_b,'not_applicable','This feature is absent');checks:=checks+1;
 result_row:=public.advance_booking_status(test_booking,'completed');
 if result_row.status<>'completed' or result_row.completed_at is null then raise exception 'Resolved checklist completion failed';end if;checks:=checks+1;
 actual:=null;begin perform public.irbi_checklist_action(item_a,false);exception when others then actual:=sqlerrm;end;
 if actual is distinct from 'Cleaning must be in progress' then raise exception 'Closed checklist edit accepted: %',actual;end if;checks:=checks+1;
 if checks<>16 then raise exception 'Unexpected check count: %',checks;end if;
end $test$;
rollback;
select 'PASS: 16 assignment, cleaner workflow, authorization and checklist scenarios; all fixtures rolled back' result;