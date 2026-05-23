-- Phase 1: routes direction_mode (one_way | round_trip | loop)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_direction_mode') THEN
    CREATE TYPE public.route_direction_mode AS ENUM ('one_way', 'round_trip', 'loop');
  END IF;
END $$;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS direction_mode public.route_direction_mode NOT NULL DEFAULT 'one_way';
