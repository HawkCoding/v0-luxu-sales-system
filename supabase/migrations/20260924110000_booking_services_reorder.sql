-- Date-ordering a booking's legs without half-applied writes or false 409s.
--
-- lib/packages/persist-service-date-order.ts re-sorts a booking's legs into date order after every
-- save and rewrites booking_services.sort_order. Two problems with how that landed:
--
-- 1. Each changed row was its own UPDATE, sent in parallel with no transaction, so a failure part
--    way through left some legs in the new order and some in the old. set_booking_service_sort_orders
--    applies the whole reorder as one statement: all of it or none of it.
--
-- 2. Every UPDATE bumped updated_at, which is the optimistic-lock token the services PATCH checks.
--    A reorder renumbers every leg after a moved one, so a colleague editing one of those legs --
--    which did not change -- got a "changed by someone else" 409. booking_services now keeps
--    updated_at as it was when sort_order is the only column that changed. Position is re-derived
--    from the dates on every save, so it needs no lock of its own.
--
-- The shared public.set_updated_at() is untouched; only booking_services' trigger changes.
-- Idempotent: CREATE OR REPLACE and DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.set_booking_services_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'sort_order' - 'updated_at') = (to_jsonb(OLD) - 'sort_order' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_services_updated_at ON public.booking_services;
CREATE TRIGGER set_booking_services_updated_at
  BEFORE UPDATE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_services_updated_at();

-- p_orders: [{ "id": "<booking_services.id>", "sort_order": 0 }, ...]. Rows not on p_booking_id are
-- ignored. SECURITY INVOKER, so the caller's RLS applies exactly as it did to the per-row updates.
CREATE OR REPLACE FUNCTION public.set_booking_service_sort_orders(p_booking_id uuid, p_orders jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.booking_services bs
     SET sort_order = o.sort_order
    FROM jsonb_to_recordset(p_orders) AS o(id uuid, sort_order integer)
   WHERE bs.booking_id = p_booking_id
     AND bs.id = o.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_booking_service_sort_orders(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_booking_service_sort_orders(uuid, jsonb) TO authenticated, service_role;
