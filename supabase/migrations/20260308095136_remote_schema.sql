


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."booking_purpose" AS ENUM (
    'quote',
    'availability',
    'reservation'
);


ALTER TYPE "public"."booking_purpose" OWNER TO "postgres";


CREATE TYPE "public"."correspondence_status" AS ENUM (
    'sent',
    'failed',
    'scheduled'
);


ALTER TYPE "public"."correspondence_status" OWNER TO "postgres";


CREATE TYPE "public"."document_kind" AS ENUM (
    'quote_pdf',
    'invoice_pdf',
    'voucher_pdf',
    'summary_pdf',
    'other'
);


ALTER TYPE "public"."document_kind" OWNER TO "postgres";


CREATE TYPE "public"."document_status" AS ENUM (
    'required',
    'received',
    'generated'
);


ALTER TYPE "public"."document_status" OWNER TO "postgres";


CREATE TYPE "public"."hotel_phase" AS ENUM (
    'pre',
    'post',
    'none'
);


ALTER TYPE "public"."hotel_phase" OWNER TO "postgres";


CREATE TYPE "public"."pipeline_stage" AS ENUM (
    'enquiry',
    'quoted',
    'quote_sent',
    'accepted',
    'deposit_requested',
    'deposit_paid',
    'final_paid',
    'voucher_sent',
    'closed',
    'lost'
);


ALTER TYPE "public"."pipeline_stage" OWNER TO "postgres";


CREATE TYPE "public"."quote_status" AS ENUM (
    'draft',
    'pricing_incomplete',
    'ready',
    'sent',
    'accepted'
);


ALTER TYPE "public"."quote_status" OWNER TO "postgres";


CREATE TYPE "public"."source_kind" AS ENUM (
    'web_form',
    'paste_import'
);


ALTER TYPE "public"."source_kind" OWNER TO "postgres";


CREATE TYPE "public"."supplier_kind" AS ENUM (
    'train_operator',
    'hotel_property',
    'transfers'
);


ALTER TYPE "public"."supplier_kind" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'consultant',
    'readonly'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_has_role"("required_roles" "public"."user_role"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND clearance_level = ANY(required_roles)
  );
$$;


ALTER FUNCTION "public"."auth_has_role"("required_roles" "public"."user_role"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, clearance_level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'consultant'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor" "text" NOT NULL,
    "actor_user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "before_json" "jsonb",
    "after_json" "jsonb",
    "meta_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."booking_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."booking_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_suites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "suite_number" integer NOT NULL,
    "suite_type_id" "uuid",
    "suite_type_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_suites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_number" "text" DEFAULT ((('LUX-'::"text" || (EXTRACT(year FROM "now"()))::"text") || '-'::"text") || "lpad"(("nextval"('"public"."booking_number_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "package_id" "uuid",
    "route_id" "uuid",
    "purpose" "public"."booking_purpose" NOT NULL,
    "source" "public"."source_kind" DEFAULT 'web_form'::"public"."source_kind" NOT NULL,
    "stage" "public"."pipeline_stage" DEFAULT 'enquiry'::"public"."pipeline_stage" NOT NULL,
    "consultant" "text",
    "owner_user_id" "uuid",
    "departure_date" "date",
    "duration_nights" integer,
    "no_of_suites" integer DEFAULT 1 NOT NULL,
    "no_of_adults" integer DEFAULT 1 NOT NULL,
    "no_of_children" integer DEFAULT 0 NOT NULL,
    "child_ages" integer[],
    "hotel_phase" "public"."hotel_phase" DEFAULT 'none'::"public"."hotel_phase" NOT NULL,
    "hotel_supplier_id" "uuid",
    "extend_stay" boolean DEFAULT false NOT NULL,
    "extra_nights" integer,
    "additional_services" boolean DEFAULT false NOT NULL,
    "additional_services_details" "text",
    "promotion_code" "text",
    "raw_text" "text",
    "extracted_json" "jsonb",
    "terms_accepted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."correspondences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text",
    "status" "public"."correspondence_status" DEFAULT 'scheduled'::"public"."correspondence_status" NOT NULL,
    "sent_at" timestamp with time zone,
    "scheduled_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."correspondences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "phone" "text",
    "email" "text" NOT NULL,
    "country" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "kind" "public"."document_kind" NOT NULL,
    "status" "public"."document_status" DEFAULT 'required'::"public"."document_status" NOT NULL,
    "storage_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotel_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid",
    "location_id" "uuid" NOT NULL,
    "phase" "public"."hotel_phase" NOT NULL,
    "hotel_supplier_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hotel_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itineraries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."itineraries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "country" "text" DEFAULT 'South Africa'::"text" NOT NULL,
    "region_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "method" "text",
    "reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "from_stage" "public"."pipeline_stage" NOT NULL,
    "to_stage" "public"."pipeline_stage" NOT NULL,
    "moved_by" "text",
    "moved_by_user_id" "uuid",
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pipeline_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "clearance_level" "public"."user_role" DEFAULT 'consultant'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "surname" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quote_line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "itinerary_id" "uuid",
    "status" "public"."quote_status" DEFAULT 'draft'::"public"."quote_status" NOT NULL,
    "validity_until" "date",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "last_sent_at" timestamp with time zone,
    "override_pin" "text",
    "override_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "route_id" "uuid",
    "suite_type_id" "uuid" NOT NULL,
    "price_per_person" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "valid_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "valid_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "origin_location_id" "uuid" NOT NULL,
    "destination_location_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suite_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid",
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suite_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_pricing_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "single_price" numeric(12,2) NOT NULL,
    "double_price" numeric(12,2) NOT NULL,
    "family_price" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_pricing_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_seasonal_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "label" "text",
    "valid_from" "date" NOT NULL,
    "valid_to" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supplier_seasonal_periods_date_check" CHECK (("valid_to" >= "valid_from"))
);


ALTER TABLE "public"."supplier_seasonal_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_seasonal_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "single_price" numeric(12,2) NOT NULL,
    "double_price" numeric(12,2) NOT NULL,
    "family_price" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_seasonal_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "public"."supplier_kind" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "website" "text",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."travellers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "is_child" boolean DEFAULT false NOT NULL,
    "prefix" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "id_passport" "text",
    "date_of_birth" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."travellers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_suites"
    ADD CONSTRAINT "booking_suites_booking_id_suite_number_key" UNIQUE ("booking_id", "suite_number");



ALTER TABLE ONLY "public"."booking_suites"
    ADD CONSTRAINT "booking_suites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_booking_number_key" UNIQUE ("booking_number");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."correspondences"
    ADD CONSTRAINT "correspondences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_offers"
    ADD CONSTRAINT "hotel_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_history"
    ADD CONSTRAINT "pipeline_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."quote_line_items"
    ADD CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_snapshots"
    ADD CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suite_types"
    ADD CONSTRAINT "suite_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_pricing_options"
    ADD CONSTRAINT "supplier_pricing_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_pricing_options"
    ADD CONSTRAINT "supplier_pricing_options_unique_name_per_supplier" UNIQUE ("supplier_id", "name");



ALTER TABLE ONLY "public"."supplier_seasonal_periods"
    ADD CONSTRAINT "supplier_seasonal_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_seasonal_prices"
    ADD CONSTRAINT "supplier_seasonal_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_seasonal_prices"
    ADD CONSTRAINT "supplier_seasonal_prices_unique" UNIQUE ("period_id", "option_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travellers"
    ADD CONSTRAINT "travellers_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "customers_email_unique" ON "public"."customers" USING "btree" ("lower"("email"));



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_booking_suites_booking_id" ON "public"."booking_suites" USING "btree" ("booking_id");



CREATE INDEX "idx_bookings_consultant" ON "public"."bookings" USING "btree" ("consultant");



CREATE INDEX "idx_bookings_customer_id" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "idx_bookings_departure_date" ON "public"."bookings" USING "btree" ("departure_date");



CREATE INDEX "idx_bookings_package_id" ON "public"."bookings" USING "btree" ("package_id");



CREATE INDEX "idx_bookings_route_id" ON "public"."bookings" USING "btree" ("route_id");



CREATE INDEX "idx_bookings_stage" ON "public"."bookings" USING "btree" ("stage");



CREATE INDEX "idx_correspondences_booking_id" ON "public"."correspondences" USING "btree" ("booking_id");



CREATE INDEX "idx_documents_booking_id" ON "public"."documents" USING "btree" ("booking_id");



CREATE INDEX "idx_hotel_offers_location" ON "public"."hotel_offers" USING "btree" ("location_id", "phase");



CREATE INDEX "idx_hotel_offers_package" ON "public"."hotel_offers" USING "btree" ("package_id");



CREATE INDEX "idx_itineraries_booking_id" ON "public"."itineraries" USING "btree" ("booking_id");



CREATE INDEX "idx_packages_supplier_id" ON "public"."packages" USING "btree" ("supplier_id");



CREATE INDEX "idx_payments_booking_id" ON "public"."payments" USING "btree" ("booking_id");



CREATE INDEX "idx_pipeline_history_booking_id" ON "public"."pipeline_history" USING "btree" ("booking_id");



CREATE INDEX "idx_quote_line_items_quote_id" ON "public"."quote_line_items" USING "btree" ("quote_id");



CREATE INDEX "idx_quotes_booking_id" ON "public"."quotes" USING "btree" ("booking_id");



CREATE INDEX "idx_rate_cards_package_suite" ON "public"."rate_cards" USING "btree" ("package_id", "suite_type_id");



CREATE INDEX "idx_routes_destination" ON "public"."routes" USING "btree" ("destination_location_id");



CREATE INDEX "idx_routes_origin" ON "public"."routes" USING "btree" ("origin_location_id");



CREATE INDEX "idx_routes_package_id" ON "public"."routes" USING "btree" ("package_id");



CREATE INDEX "idx_suite_types_package_id" ON "public"."suite_types" USING "btree" ("package_id");



CREATE INDEX "idx_travellers_booking_id" ON "public"."travellers" USING "btree" ("booking_id");



CREATE INDEX "supplier_pricing_options_supplier_idx" ON "public"."supplier_pricing_options" USING "btree" ("supplier_id");



CREATE INDEX "supplier_seasonal_periods_supplier_idx" ON "public"."supplier_seasonal_periods" USING "btree" ("supplier_id");



CREATE INDEX "supplier_seasonal_prices_option_idx" ON "public"."supplier_seasonal_prices" USING "btree" ("option_id");



CREATE INDEX "supplier_seasonal_prices_period_idx" ON "public"."supplier_seasonal_prices" USING "btree" ("period_id");



CREATE UNIQUE INDEX "ux_locations_name" ON "public"."locations" USING "btree" ("name");



CREATE UNIQUE INDEX "ux_packages_name_supplier" ON "public"."packages" USING "btree" ("name", "supplier_id");



CREATE UNIQUE INDEX "ux_rate_cards_package_suite_route_valid_from" ON "public"."rate_cards" USING "btree" ("package_id", "suite_type_id", "route_id", "valid_from");



CREATE UNIQUE INDEX "ux_routes_name_package" ON "public"."routes" USING "btree" ("name", "package_id");



CREATE UNIQUE INDEX "ux_suite_types_name_package" ON "public"."suite_types" USING "btree" ("name", "package_id");



CREATE UNIQUE INDEX "ux_suppliers_name" ON "public"."suppliers" USING "btree" ("name");



CREATE OR REPLACE TRIGGER "trg_updated_at_bookings" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_customers" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_hotel_offers" BEFORE UPDATE ON "public"."hotel_offers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_itineraries" BEFORE UPDATE ON "public"."itineraries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_locations" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_packages" BEFORE UPDATE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_quotes" BEFORE UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_routes" BEFORE UPDATE ON "public"."routes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_suite_types" BEFORE UPDATE ON "public"."suite_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_suppliers" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_updated_at_templates" BEFORE UPDATE ON "public"."templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."booking_suites"
    ADD CONSTRAINT "booking_suites_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_suites"
    ADD CONSTRAINT "booking_suites_suite_type_id_fkey" FOREIGN KEY ("suite_type_id") REFERENCES "public"."suite_types"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_hotel_supplier_id_fkey" FOREIGN KEY ("hotel_supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id");



ALTER TABLE ONLY "public"."correspondences"
    ADD CONSTRAINT "correspondences_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hotel_offers"
    ADD CONSTRAINT "hotel_offers_hotel_supplier_id_fkey" FOREIGN KEY ("hotel_supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."hotel_offers"
    ADD CONSTRAINT "hotel_offers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."hotel_offers"
    ADD CONSTRAINT "hotel_offers_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_history"
    ADD CONSTRAINT "pipeline_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_history"
    ADD CONSTRAINT "pipeline_history_moved_by_user_id_fkey" FOREIGN KEY ("moved_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_line_items"
    ADD CONSTRAINT "quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id");



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id");



ALTER TABLE ONLY "public"."rate_cards"
    ADD CONSTRAINT "rate_cards_suite_type_id_fkey" FOREIGN KEY ("suite_type_id") REFERENCES "public"."suite_types"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."suite_types"
    ADD CONSTRAINT "suite_types_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."supplier_pricing_options"
    ADD CONSTRAINT "supplier_pricing_options_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_seasonal_periods"
    ADD CONSTRAINT "supplier_seasonal_periods_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_seasonal_prices"
    ADD CONSTRAINT "supplier_seasonal_prices_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."supplier_pricing_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_seasonal_prices"
    ADD CONSTRAINT "supplier_seasonal_prices_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."supplier_seasonal_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."travellers"
    ADD CONSTRAINT "travellers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



CREATE POLICY "al_insert" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "al_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "biz_delete" ON "public"."booking_suites" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."bookings" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."correspondences" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."customers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."documents" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."itineraries" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."payments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."quote_line_items" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."quotes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_delete" ON "public"."travellers" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "biz_insert" ON "public"."booking_suites" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."correspondences" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."itineraries" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."quote_line_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."quotes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_insert" ON "public"."travellers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "biz_select" ON "public"."booking_suites" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."bookings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."correspondences" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."documents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."itineraries" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."payments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."quote_line_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."quotes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_select" ON "public"."travellers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "biz_update" ON "public"."booking_suites" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."bookings" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."correspondences" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."customers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."itineraries" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."payments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."quote_line_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."quotes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "biz_update" ON "public"."travellers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."booking_suites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."correspondences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itineraries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ph_insert" ON "public"."pipeline_history" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ph_select" ON "public"."pipeline_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pipeline_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."auth_has_role"(ARRAY['admin'::"public"."user_role"])));



ALTER TABLE "public"."quote_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ref_delete" ON "public"."hotel_offers" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."locations" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."packages" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."rate_cards" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."routes" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."suite_types" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."supplier_pricing_options" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."supplier_seasonal_periods" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."supplier_seasonal_prices" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."suppliers" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_delete" ON "public"."templates" FOR DELETE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."hotel_offers" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."packages" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."rate_cards" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."routes" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."suite_types" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."supplier_pricing_options" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."supplier_seasonal_periods" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."supplier_seasonal_prices" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_insert" ON "public"."templates" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_select" ON "public"."hotel_offers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."locations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."packages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."rate_cards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."routes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."suite_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."supplier_pricing_options" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."supplier_seasonal_periods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."supplier_seasonal_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_select" ON "public"."templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ref_update" ON "public"."hotel_offers" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."locations" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."packages" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."rate_cards" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."routes" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."suite_types" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."supplier_pricing_options" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."supplier_seasonal_periods" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."supplier_seasonal_prices" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."suppliers" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "ref_update" ON "public"."templates" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



ALTER TABLE "public"."report_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rs_insert" ON "public"."report_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



CREATE POLICY "rs_select" ON "public"."report_snapshots" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rs_update" ON "public"."report_snapshots" FOR UPDATE TO "authenticated" USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])) WITH CHECK ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));



ALTER TABLE "public"."suite_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_pricing_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_seasonal_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_seasonal_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."travellers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."auth_has_role"("required_roles" "public"."user_role"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."auth_has_role"("required_roles" "public"."user_role"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_has_role"("required_roles" "public"."user_role"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."booking_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."booking_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."booking_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."booking_suites" TO "anon";
GRANT ALL ON TABLE "public"."booking_suites" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_suites" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."correspondences" TO "anon";
GRANT ALL ON TABLE "public"."correspondences" TO "authenticated";
GRANT ALL ON TABLE "public"."correspondences" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."hotel_offers" TO "anon";
GRANT ALL ON TABLE "public"."hotel_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_offers" TO "service_role";



GRANT ALL ON TABLE "public"."itineraries" TO "anon";
GRANT ALL ON TABLE "public"."itineraries" TO "authenticated";
GRANT ALL ON TABLE "public"."itineraries" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."packages" TO "anon";
GRANT ALL ON TABLE "public"."packages" TO "authenticated";
GRANT ALL ON TABLE "public"."packages" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_history" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_history" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_history" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quote_line_items" TO "anon";
GRANT ALL ON TABLE "public"."quote_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."rate_cards" TO "anon";
GRANT ALL ON TABLE "public"."rate_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_cards" TO "service_role";



GRANT ALL ON TABLE "public"."report_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."report_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."report_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."routes" TO "anon";
GRANT ALL ON TABLE "public"."routes" TO "authenticated";
GRANT ALL ON TABLE "public"."routes" TO "service_role";



GRANT ALL ON TABLE "public"."suite_types" TO "anon";
GRANT ALL ON TABLE "public"."suite_types" TO "authenticated";
GRANT ALL ON TABLE "public"."suite_types" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_pricing_options" TO "anon";
GRANT ALL ON TABLE "public"."supplier_pricing_options" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_pricing_options" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_seasonal_periods" TO "anon";
GRANT ALL ON TABLE "public"."supplier_seasonal_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_seasonal_periods" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_seasonal_prices" TO "anon";
GRANT ALL ON TABLE "public"."supplier_seasonal_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_seasonal_prices" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."travellers" TO "anon";
GRANT ALL ON TABLE "public"."travellers" TO "authenticated";
GRANT ALL ON TABLE "public"."travellers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































