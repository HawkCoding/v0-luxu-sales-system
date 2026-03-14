-- Keep supplier PATCH permissions aligned with RLS:
-- managers can edit suppliers in the API, so they must be able to delete
-- replaced supplier reference rows during save.
ALTER POLICY "ref_delete" ON "public"."supplier_pricing_options"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."packages"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."routes"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."suite_types"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."rate_cards"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."supplier_seasonal_periods"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));

ALTER POLICY "ref_delete" ON "public"."supplier_seasonal_prices"
  USING ("public"."auth_has_role"(ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"]));
