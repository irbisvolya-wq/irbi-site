ALTER TABLE public.payment_records ADD COLUMN recorded_by uuid REFERENCES public.profiles(id), ADD COLUMN recording_note text;
CREATE FUNCTION public.irbi_record_manual_payment(p_request uuid,p_booking uuid,p_amount numeric,p_method text,p_paid_at timestamptz,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE actor uuid:=auth.uid(); b public.bookings; existing public.payment_records; received numeric; result_id uuid; receipt_key text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='admin') THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_booking IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>1000000 OR p_amount<>round(p_amount,2)
 OR p_method IS NULL OR p_method NOT IN ('cash','bank_transfer') OR p_paid_at IS NULL OR NOT isfinite(p_paid_at) OR p_paid_at>now()+interval '5 minutes'
 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'invalid_payment';END IF;
 receipt_key:='manual:'||actor::text||':'||p_request::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(receipt_key,0));
 SELECT * INTO existing FROM public.payment_records WHERE idempotency_key=receipt_key;
 IF FOUND THEN
  IF existing.booking_id IS DISTINCT FROM p_booking OR existing.amount IS DISTINCT FROM p_amount OR existing.method IS DISTINCT FROM p_method OR existing.paid_at IS DISTINCT FROM p_paid_at OR existing.recording_note IS DISTINCT FROM btrim(p_note) THEN RAISE EXCEPTION 'payment_request_changed';END IF;
  RETURN existing.id;
 END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking FOR UPDATE;
 IF NOT FOUND OR b.status<>'completed' THEN RAISE EXCEPTION 'completed_booking_required';END IF;
 IF EXISTS(SELECT 1 FROM public.payment_records WHERE booking_id=p_booking AND status IN ('processing','partially_refunded','refunded')) THEN RAISE EXCEPTION 'payment_reconciliation_required';END IF;
 SELECT coalesce(sum(amount),0) INTO received FROM public.payment_records WHERE booking_id=p_booking AND status='paid';
 IF b.total IS NULL OR p_amount>b.total-received THEN RAISE EXCEPTION 'payment_exceeds_balance';END IF;
 INSERT INTO public.payment_records(booking_id,amount,status,method,idempotency_key,paid_at,recorded_by,recording_note)
 VALUES(p_booking,p_amount,'paid',p_method,receipt_key,p_paid_at,actor,btrim(p_note)) RETURNING id INTO result_id;
 RETURN result_id;
END $function$;
REVOKE ALL ON FUNCTION public.irbi_record_manual_payment(uuid,uuid,numeric,text,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irbi_record_manual_payment(uuid,uuid,numeric,text,timestamptz,text) TO authenticated;
