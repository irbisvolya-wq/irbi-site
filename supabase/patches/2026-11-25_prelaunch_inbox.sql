-- Keep contact staging server-only; expose bounded, role-checked operations.
ALTER TABLE public.prelaunch_leads
 ADD COLUMN processing_status text NOT NULL DEFAULT 'new' CHECK(processing_status IN ('new','in_progress','notified','closed')),
 ADD COLUMN processing_owner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN processing_note text,
 ADD COLUMN processing_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN processing_notified_at timestamptz;
CREATE INDEX prelaunch_processing_queue_idx ON public.prelaunch_leads(processing_status,created_at,id);
CREATE INDEX prelaunch_processing_owner_idx ON public.prelaunch_leads(processing_owner);
REVOKE ALL ON public.prelaunch_leads FROM PUBLIC,anon,authenticated;

CREATE TABLE public.prelaunch_processing_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.prelaunch_leads(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('take','note','notify','close')),
 previous_status text NOT NULL,
 new_status text NOT NULL,
 note text NOT NULL CHECK(length(note) BETWEEN 3 AND 1000),
 fingerprint text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,request_id)
);
CREATE INDEX prelaunch_processing_events_lead_idx ON public.prelaunch_processing_events(lead_id,created_at DESC);
ALTER TABLE public.prelaunch_processing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prelaunch_processing_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.prelaunch_processing_events TO authenticated;
CREATE POLICY prelaunch_processing_events_staff_read ON public.prelaunch_processing_events FOR SELECT TO authenticated
 USING ((SELECT private.irbi_is_staff()));

CREATE FUNCTION public.irbi_prelaunch_inbox(
 p_status text DEFAULT 'all',p_after_created_at timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;counts jsonb;more boolean;cursor jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','dispatcher')) THEN RAISE EXCEPTION 'staff_required' USING ERRCODE='42501';END IF;
 IF p_status IS NULL OR p_status NOT IN ('all','new','in_progress','notified','closed') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 OR (p_after_created_at IS NULL)<>(p_after_id IS NULL) OR (p_after_created_at IS NOT NULL AND NOT isfinite(p_after_created_at)) THEN RAISE EXCEPTION 'invalid_page';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.created_at,page.id),'[]'::jsonb) INTO items FROM (
  SELECT l.id,l.created_at,l.full_name,l.contact,l.service_code,l.rooms,l.marketing_consent,l.privacy_notice_accepted,l.sync_status,
   l.processing_status,l.processing_owner,l.processing_note,l.processing_updated_at,l.processing_notified_at,p.full_name AS owner_name
  FROM public.prelaunch_leads l LEFT JOIN public.profiles p ON p.id=l.processing_owner
  WHERE (p_status='all' OR l.processing_status=p_status)
   AND (p_after_id IS NULL OR (l.created_at,l.id)>(p_after_created_at,p_after_id))
  ORDER BY l.created_at,l.id LIMIT p_limit+1
 )page;
 more:=jsonb_array_length(items)>p_limit;
 IF more THEN items:=items-p_limit;END IF;
 IF more THEN cursor:=jsonb_build_object('created_at',items->(jsonb_array_length(items)-1)->>'created_at','id',items->(jsonb_array_length(items)-1)->>'id');END IF;
 SELECT coalesce(jsonb_object_agg(processing_status,n),'{}'::jsonb) INTO counts FROM (SELECT processing_status,count(*) AS n FROM public.prelaunch_leads GROUP BY processing_status)c;
 RETURN jsonb_build_object('items',items,'counts',counts,'has_more',more,'next_cursor',cursor);
END $$;

CREATE FUNCTION public.irbi_process_prelaunch(p_request uuid,p_lead uuid,p_action text,p_note text,p_expected_updated_at timestamptz)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid:=auth.uid();actor_role text;l public.prelaunch_leads;saved public.prelaunch_processing_events;signature text;target text;answer jsonb;
BEGIN
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor_id;
 IF actor_id IS NULL OR actor_role IS NULL OR actor_role NOT IN ('admin','dispatcher') THEN RAISE EXCEPTION 'staff_required' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_lead IS NULL OR p_expected_updated_at IS NULL OR p_action IS NULL OR p_action NOT IN ('take','note','notify','close') THEN RAISE EXCEPTION 'invalid_action';END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'note_required';END IF;
 signature:=encode(sha256(convert_to(jsonb_build_object('lead',p_lead,'action',p_action,'note',btrim(p_note),'version',p_expected_updated_at)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('lead:'||actor_id::text||':'||p_request::text,0));
 SELECT * INTO saved FROM public.prelaunch_processing_events WHERE actor=actor_id AND request_id=p_request;
 IF FOUND THEN
  IF saved.fingerprint<>signature THEN RAISE EXCEPTION 'lead_request_changed';END IF;
  RETURN saved.result;
 END IF;
 SELECT * INTO l FROM public.prelaunch_leads WHERE id=p_lead FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found';END IF;
 IF l.processing_updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'lead_changed';END IF;
 IF l.processing_owner IS NOT NULL AND l.processing_owner<>actor_id AND actor_role<>'admin' THEN RAISE EXCEPTION 'lead_owned';END IF;
 target:=CASE
  WHEN p_action='take' THEN 'in_progress'
  WHEN p_action='note' AND l.processing_status='in_progress' THEN 'in_progress'
  WHEN p_action='notify' AND l.processing_status='in_progress' THEN 'notified'
  WHEN p_action='close' AND l.processing_status IN ('in_progress','notified') THEN 'closed'
  ELSE NULL END;
 IF target IS NULL THEN RAISE EXCEPTION 'invalid_transition';END IF;
 IF p_action<>'take' AND l.processing_owner IS NULL THEN RAISE EXCEPTION 'take_first';END IF;
 UPDATE public.prelaunch_leads SET processing_status=target,processing_owner=actor_id,processing_note=btrim(p_note),
  processing_updated_at=greatest(clock_timestamp(),l.processing_updated_at+interval '1 microsecond'),
  processing_notified_at=CASE WHEN p_action='notify' THEN clock_timestamp() ELSE processing_notified_at END
 WHERE id=l.id RETURNING jsonb_build_object('id',id,'status',processing_status,'updated_at',processing_updated_at) INTO answer;
 INSERT INTO public.prelaunch_processing_events(lead_id,actor,request_id,action,previous_status,new_status,note,fingerprint,result)
 VALUES(l.id,actor_id,p_request,p_action,l.processing_status,target,btrim(p_note),signature,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.irbi_prelaunch_inbox(text,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.irbi_process_prelaunch(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irbi_prelaunch_inbox(text,timestamptz,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.irbi_process_prelaunch(uuid,uuid,text,text,timestamptz) TO authenticated;
