-- Additive endpoint: legacy callers continue using irbi_customer_request.
CREATE TABLE private.irbi_request_receipts (
 customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(customer_id,request_id)
);
ALTER TABLE private.irbi_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.irbi_request_receipts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.irbi_customer_request_once(p_request_id uuid,p_request jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
 actor uuid:=auth.uid(); receipt private.irbi_request_receipts; fingerprint text; result_id uuid;
 required_keys text[]:=ARRAY['p_service','p_rooms','p_scheduled_at','p_address','p_property_type','p_bathrooms','p_area_m2','p_phone','p_apartment','p_entrance','p_floor','p_access_notes','p_frequency','p_addons'];
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='customer') THEN
  RAISE EXCEPTION 'customer_required' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' THEN
  RAISE EXCEPTION 'invalid_request';
 END IF;
 IF NOT p_request ?& required_keys OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>14
 OR EXISTS(SELECT 1 FROM jsonb_each(p_request) WHERE value='null'::jsonb) THEN RAISE EXCEPTION 'invalid_request';END IF;
 fingerprint:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 -- Serializes identical attempts, including two requests arriving together.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,0));
 SELECT * INTO receipt FROM private.irbi_request_receipts WHERE customer_id=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.request_hash<>fingerprint THEN RAISE EXCEPTION 'request_changed';END IF;
  RETURN receipt.booking_id;
 END IF;
 result_id:=public.irbi_customer_request(
  p_request->>'p_service',(p_request->>'p_rooms')::integer,(p_request->>'p_scheduled_at')::timestamptz,
  p_request->>'p_address',p_request->>'p_property_type',(p_request->>'p_bathrooms')::integer,
  (p_request->>'p_area_m2')::numeric,p_request->>'p_phone',p_request->>'p_apartment',
  p_request->>'p_entrance',p_request->>'p_floor',p_request->>'p_access_notes',p_request->>'p_frequency',p_request->'p_addons');
 INSERT INTO private.irbi_request_receipts(customer_id,request_id,request_hash,booking_id)
 VALUES(actor,p_request_id,fingerprint,result_id);
 RETURN result_id;
END $function$;
REVOKE ALL ON FUNCTION public.irbi_customer_request_once(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irbi_customer_request_once(uuid,jsonb) TO authenticated;
