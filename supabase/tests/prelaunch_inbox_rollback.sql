BEGIN;
DO $test$
DECLARE
 customer_id uuid:=gen_random_uuid();cleaner_id uuid:=gen_random_uuid();staff1 uuid:=gen_random_uuid();staff2 uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();
 ids uuid[];lead_id uuid;first_id uuid;second_id uuid;stamp timestamptz;old_stamp timestamptz;fixture_time timestamptz;page jsonb;reply jsonb;again jsonb;receipt uuid:=gen_random_uuid();err text;
BEGIN
 INSERT INTO auth.users(id,raw_user_meta_data) VALUES(customer_id,'{"full_name":"IRBI rollback lead customer"}'),(cleaner_id,'{"full_name":"IRBI rollback lead cleaner"}'),(staff1,'{"full_name":"IRBI rollback lead dispatcher one"}'),(staff2,'{"full_name":"IRBI rollback lead dispatcher two"}'),(admin_id,'{"full_name":"IRBI rollback lead admin"}');
 UPDATE public.profiles SET role='cleaner' WHERE id=cleaner_id;
 UPDATE public.profiles SET role='dispatcher' WHERE id IN(staff1,staff2);
 UPDATE public.profiles SET role='admin' WHERE id=admin_id;
 SELECT coalesce(min(created_at),now())-interval '1 year' INTO fixture_time FROM public.prelaunch_leads;
 ids:=ARRAY[
 public.irbi_accept_prelaunch('rollback-lead-a:'||gen_random_uuid(),gen_random_uuid(),'Rollback First','qa-first@example.invalid','regular',2::smallint,null,false,true),
 public.irbi_accept_prelaunch('rollback-lead-b:'||gen_random_uuid(),gen_random_uuid(),'Rollback Second','qa-second@example.invalid','regular',2::smallint,null,false,true),
 public.irbi_accept_prelaunch('rollback-lead-c:'||gen_random_uuid(),gen_random_uuid(),'Rollback Third','qa-third@example.invalid','regular',2::smallint,null,false,true)];
 UPDATE public.prelaunch_leads SET created_at=fixture_time WHERE id=ANY(ids);
 SELECT id INTO first_id FROM public.prelaunch_leads WHERE id=ANY(ids) ORDER BY id LIMIT 1;
 SELECT id INTO second_id FROM public.prelaunch_leads WHERE id=ANY(ids) ORDER BY id OFFSET 1 LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',customer_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 err:=null;BEGIN PERFORM public.irbi_prelaunch_inbox();EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'staff_required' THEN RAISE EXCEPTION 'Customer sees lead contacts';END IF;
 err:=null;BEGIN PERFORM 1 FROM public.prelaunch_leads;EXCEPTION WHEN insufficient_privilege THEN err:='denied';END;
 IF err IS DISTINCT FROM 'denied' THEN RAISE EXCEPTION 'Client has direct staging access';END IF;
 PERFORM set_config('request.jwt.claim.sub',cleaner_id::text,true);
 err:=null;BEGIN PERFORM public.irbi_prelaunch_inbox();EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'staff_required' THEN RAISE EXCEPTION 'Cleaner sees lead contacts';END IF;
 PERFORM set_config('request.jwt.claim.sub',staff1::text,true);
 err:=null;BEGIN PERFORM 1 FROM public.prelaunch_leads;EXCEPTION WHEN insufficient_privilege THEN err:='denied';END;
 IF err IS DISTINCT FROM 'denied' THEN RAISE EXCEPTION 'Staff bypasses bounded staging API';END IF;
 page:=public.irbi_prelaunch_inbox('new',null,null,1);
 IF (page->'items'->0->>'id')::uuid<>first_id OR page->>'has_more'<>'true' THEN RAISE EXCEPTION 'First keyset page incorrect';END IF;
 page:=public.irbi_prelaunch_inbox('new',(page->'next_cursor'->>'created_at')::timestamptz,(page->'next_cursor'->>'id')::uuid,1);
 IF (page->'items'->0->>'id')::uuid<>second_id THEN RAISE EXCEPTION 'Timestamp tie skipped or repeated a lead';END IF;
 lead_id:=first_id;
 page:=public.irbi_prelaunch_inbox('new',null,null,1);stamp:=(page->'items'->0->>'processing_updated_at')::timestamptz;old_stamp:=stamp;
 reply:=public.irbi_process_prelaunch(receipt,lead_id,'take','Start processing',stamp);
 again:=public.irbi_process_prelaunch(receipt,lead_id,'take','Start processing',old_stamp);
 IF again IS DISTINCT FROM reply THEN RAISE EXCEPTION 'Uncertain retry not idempotent';END IF;
 IF (SELECT count(*) FROM public.prelaunch_processing_events WHERE prelaunch_processing_events.lead_id=first_id)<>1 THEN RAISE EXCEPTION 'Duplicate processing event';END IF;
 err:=null;BEGIN PERFORM public.irbi_process_prelaunch(receipt,lead_id,'take','Different note',old_stamp);EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'lead_request_changed' THEN RAISE EXCEPTION 'Changed receipt payload accepted';END IF;
 err:=null;BEGIN PERFORM public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'note','Stale browser',old_stamp);EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'lead_changed' THEN RAISE EXCEPTION 'Stale browser overwrote lead';END IF;
 stamp:=(reply->>'updated_at')::timestamptz;
 PERFORM set_config('request.jwt.claim.sub',staff2::text,true);
 err:=null;BEGIN PERFORM public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'take','Take from colleague',stamp);EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'lead_owned' THEN RAISE EXCEPTION 'Dispatcher overwrote colleague assignment';END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 reply:=public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'take','Admin taking responsibility',stamp);stamp:=(reply->>'updated_at')::timestamptz;
 reply:=public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'note','Internal note retained in audit',stamp);stamp:=(reply->>'updated_at')::timestamptz;
 reply:=public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'notify','Launch notification already delivered manually',stamp);stamp:=(reply->>'updated_at')::timestamptz;
 IF reply->>'status'<>'notified' THEN RAISE EXCEPTION 'Manual notice recording failed';END IF;
 reply:=public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'close','Processing completed',stamp);stamp:=(reply->>'updated_at')::timestamptz;
 reply:=public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'take','Reopening with reason',stamp);
 IF reply->>'status'<>'in_progress' THEN RAISE EXCEPTION 'Reopen failed';END IF;
 page:=public.irbi_prelaunch_inbox('in_progress',null,null,100);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(page->'items')i WHERE i->>'id'=lead_id::text AND i->>'processing_owner'=admin_id::text AND i->>'sync_status'='pending' AND i->>'marketing_consent'='false') THEN RAISE EXCEPTION 'Processing overwrote CRM status or consent';END IF;
 PERFORM set_config('request.jwt.claim.sub',customer_id::text,true);
 IF EXISTS(SELECT 1 FROM public.prelaunch_processing_events WHERE prelaunch_processing_events.lead_id=first_id) THEN RAISE EXCEPTION 'Customer reads staff notes';END IF;
 err:=null;BEGIN PERFORM public.irbi_process_prelaunch(gen_random_uuid(),lead_id,'close','Customer must be denied',(reply->>'updated_at')::timestamptz);EXCEPTION WHEN OTHERS THEN err:=sqlerrm;END;
 IF err IS DISTINCT FROM 'staff_required' THEN RAISE EXCEPTION 'Customer changes processing state';END IF;
 RESET ROLE;
END $test$;
SELECT 'PASS: staging remains private, bounded inbox, keyset ties, ownership, concurrency, idempotency, audit and manual lifecycle' AS result;
ROLLBACK;
