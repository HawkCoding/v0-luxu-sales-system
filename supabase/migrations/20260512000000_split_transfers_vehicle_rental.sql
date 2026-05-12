ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS location_detail text;

CREATE TABLE IF NOT EXISTS public.vehicle_rental_route_details (
  route_id uuid PRIMARY KEY REFERENCES public.routes(id) ON DELETE CASCADE,
  included_km_per_day numeric(12, 2),
  extra_km_price numeric(12, 2),
  security_deposit numeric(12, 2),
  one_way_fee numeric(12, 2),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS set_vehicle_rental_route_details_updated_at ON public.vehicle_rental_route_details;
CREATE TRIGGER set_vehicle_rental_route_details_updated_at
  BEFORE UPDATE ON public.vehicle_rental_route_details
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_vehicle_rental_route_details_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  route_supplier_kind text;
BEGIN
  SELECT suppliers.kind::text
  INTO route_supplier_kind
  FROM public.routes
  JOIN public.suppliers ON suppliers.id = routes.supplier_id
  WHERE routes.id = NEW.route_id;

  IF route_supplier_kind IS DISTINCT FROM 'vehicle_rental' THEN
    RAISE EXCEPTION 'Vehicle rental route details can only be attached to vehicle_rental supplier routes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vehicle_rental_route_details_kind ON public.vehicle_rental_route_details;
CREATE TRIGGER enforce_vehicle_rental_route_details_kind
  BEFORE INSERT OR UPDATE ON public.vehicle_rental_route_details
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vehicle_rental_route_details_kind();

GRANT ALL ON TABLE public.vehicle_rental_route_details TO anon;
GRANT ALL ON TABLE public.vehicle_rental_route_details TO authenticated;
GRANT ALL ON TABLE public.vehicle_rental_route_details TO service_role;

ALTER TABLE public.vehicle_rental_route_details ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_rental_route_details'
      AND policyname = 'ref_select'
  ) THEN
    CREATE POLICY ref_select ON public.vehicle_rental_route_details
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_rental_route_details'
      AND policyname = 'ref_insert'
  ) THEN
    CREATE POLICY ref_insert ON public.vehicle_rental_route_details
      FOR INSERT TO authenticated
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_rental_route_details'
      AND policyname = 'ref_update'
  ) THEN
    CREATE POLICY ref_update ON public.vehicle_rental_route_details
      FOR UPDATE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]))
      WITH CHECK (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_rental_route_details'
      AND policyname = 'ref_delete'
  ) THEN
    CREATE POLICY ref_delete ON public.vehicle_rental_route_details
      FOR DELETE TO authenticated
      USING (public.auth_has_role(ARRAY['admin'::public.user_role, 'manager'::public.user_role]));
  END IF;
END $$;

WITH rental_only_suppliers AS (
  SELECT suppliers.id
  FROM public.suppliers
  WHERE suppliers.kind::text = 'transfers'
    AND EXISTS (
      SELECT 1
      FROM public.routes
      WHERE routes.supplier_id = suppliers.id
        AND routes.transport_service_type = 'rental'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.routes
      WHERE routes.supplier_id = suppliers.id
        AND routes.transport_service_type = 'transfer'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.routes
      WHERE routes.supplier_id = suppliers.id
        AND routes.transport_service_type IS NULL
    )
)
UPDATE public.suppliers
SET kind = 'vehicle_rental'::public.supplier_kind
WHERE id IN (SELECT id FROM rental_only_suppliers);

INSERT INTO public.vehicle_rental_route_details (
  route_id,
  included_km_per_day,
  extra_km_price,
  security_deposit,
  one_way_fee,
  created_at,
  updated_at
)
SELECT
  routes.id,
  routes.included_km_per_day,
  routes.extra_km_price,
  routes.security_deposit,
  routes.one_way_fee,
  now(),
  now()
FROM public.routes
JOIN public.suppliers ON suppliers.id = routes.supplier_id
WHERE suppliers.kind::text = 'vehicle_rental'
ON CONFLICT (route_id) DO UPDATE
SET included_km_per_day = EXCLUDED.included_km_per_day,
    extra_km_price = EXCLUDED.extra_km_price,
    security_deposit = EXCLUDED.security_deposit,
    one_way_fee = EXCLUDED.one_way_fee,
    updated_at = now();

WITH mixed_suppliers AS (
  SELECT suppliers.id
  FROM public.suppliers
  WHERE suppliers.kind::text = 'transfers'
    AND EXISTS (
      SELECT 1
      FROM public.routes
      WHERE routes.supplier_id = suppliers.id
        AND routes.transport_service_type = 'transfer'
    )
),
routes_to_delete AS (
  SELECT routes.id
  FROM public.routes
  JOIN mixed_suppliers ON mixed_suppliers.id = routes.supplier_id
  WHERE routes.transport_service_type = 'rental'
     OR routes.transport_service_type IS NULL
),
deleted_package_leg_routes AS (
  DELETE FROM public.package_leg_routes
  WHERE route_id IN (SELECT id FROM routes_to_delete)
  RETURNING route_id
),
deleted_rate_cards AS (
  DELETE FROM public.rate_cards
  WHERE route_id IN (SELECT id FROM routes_to_delete)
  RETURNING route_id
)
DELETE FROM public.routes
WHERE id IN (SELECT id FROM routes_to_delete);

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_transport_service_type_check,
  DROP COLUMN IF EXISTS transport_service_type,
  DROP COLUMN IF EXISTS included_km_per_day,
  DROP COLUMN IF EXISTS extra_km_price,
  DROP COLUMN IF EXISTS security_deposit,
  DROP COLUMN IF EXISTS one_way_fee;
