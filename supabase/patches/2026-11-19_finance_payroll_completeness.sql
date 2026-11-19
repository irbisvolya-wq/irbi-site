CREATE OR REPLACE VIEW public.irbi_booking_finance WITH (security_invoker=true) AS
 SELECT b.id AS booking_id,
    b.scheduled_at,
    b.status,
    b.service_type,
    b.total AS booked_revenue,
    COALESCE(pay.paid_amount, 0::numeric) AS paid_revenue,
    COALESCE(mat.material_cost, 0::numeric) AS material_cost,
    COALESCE(wages.labor_cost, 0::numeric) AS labor_cost,
    COALESCE(extra.extra_cost, 0::numeric) AS other_cost,
    b.total - COALESCE(mat.material_cost, 0::numeric) - COALESCE(wages.labor_cost, 0::numeric) - COALESCE(extra.extra_cost, 0::numeric) AS planned_contribution,
        CASE
            WHEN b.total > 0::numeric THEN round(100::numeric * (b.total - COALESCE(mat.material_cost, 0::numeric) - COALESCE(wages.labor_cost, 0::numeric) - COALESCE(extra.extra_cost, 0::numeric)) / b.total, 2)
            ELSE NULL::numeric
        END AS planned_margin_pct,
    (COALESCE(wages.unpriced_entries, 0::bigint) > 0 OR ((b.assigned_cleaner_id IS NOT NULL OR b.status = 'completed') AND NOT EXISTS (SELECT 1 FROM public.cleaner_earnings ce WHERE ce.booking_id=b.id AND ce.entry_type='cleaning' AND ce.status IN ('approved','paid') AND ce.amount IS NOT NULL))) AS missing_labor_amount,
    b.status <> ALL (ARRAY['completed'::text, 'cancelled'::text]) AS not_final
   FROM bookings b
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(
                CASE
                    WHEN m.movement_type = 'use'::text THEN m.total_cost
                    WHEN m.movement_type = 'return'::text THEN - m.total_cost
                    ELSE 0::numeric
                END), 0::numeric) AS material_cost
           FROM inventory_movements m
          WHERE m.booking_id = b.id) mat ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(e.amount) FILTER (WHERE e.status = ANY (ARRAY['approved'::text, 'paid'::text])), 0::numeric) AS labor_cost,
            count(*) FILTER (WHERE e.status = 'draft'::text OR e.amount IS NULL AND e.status <> 'void'::text) AS unpriced_entries
           FROM cleaner_earnings e
          WHERE e.booking_id = b.id AND e.status <> 'void'::text) wages ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(x.amount), 0::numeric) AS extra_cost
           FROM booking_expenses x
          WHERE x.booking_id = b.id) extra ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(p.amount) FILTER (WHERE p.status = 'paid'::text), 0::numeric) AS paid_amount
           FROM payment_records p
          WHERE p.booking_id = b.id) pay ON true
  WHERE (EXISTS ( SELECT 1
           FROM profiles p
          WHERE p.id = (( SELECT auth.uid() AS uid)) AND p.role = 'admin'::text));
