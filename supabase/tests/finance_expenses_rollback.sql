begin;
do $test$
declare admin_fixture uuid; test_booking uuid; cost numeric; missing boolean; num integer;
begin
 select id into admin_fixture from public.profiles where role='customer' limit 1;
 if admin_fixture is null then raise exception 'Missing fixture';end if;
 update public.profiles set role='admin' where id=admin_fixture;
 insert into public.bookings(customer_id,status,scheduled_at,completed_at,address,service_type,subtotal,total)
 values(admin_fixture,'completed',now(),now(),'IRBI rollback-only expense verification','regular',1500,1500) returning id into test_booking;
 perform set_config('request.jwt.claim.sub',admin_fixture::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',admin_fixture,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 insert into public.booking_expenses(booking_id,category,amount,description,recorded_by) values(test_booking,'transport',150,'Rollback-only verification',admin_fixture);
 insert into public.operating_expenses(expense_date,category,amount,description,recorded_by) values(current_date,'software',100,'Rollback-only verification',admin_fixture);
 select other_cost,missing_labor_amount into cost,missing from public.irbi_booking_finance where booking_id=test_booking;
 if cost is distinct from 150 or missing is distinct from true then raise exception 'Expense total or missing payroll flag incorrect';end if;
 select count(*) into num from public.operating_expenses where recorded_by=admin_fixture and description='Rollback-only verification';
 if num<1 then raise exception 'Admin expense read failed';end if;
 execute 'reset role';
 update public.profiles set role='customer' where id=admin_fixture;
 execute 'set local role authenticated';
 if exists(select 1 from public.irbi_booking_finance where booking_id=test_booking) then raise exception 'Customer finance disclosure';end if;
 if exists(select 1 from public.booking_expenses where booking_id=test_booking) then raise exception 'Customer expense disclosure';end if;
 begin
 insert into public.operating_expenses(expense_date,category,amount,description,recorded_by) values(current_date,'other',1,'Must be denied',admin_fixture);
 raise exception 'Unauthorized insert accepted';
 exception when insufficient_privilege then null;
 end;
end $test$;
rollback;
select 'PASS: administrator expense writes, cost aggregation, missing-payroll warning and customer read/write restrictions; fixtures rolled back' result;