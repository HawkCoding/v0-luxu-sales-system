-- Suppliers used to be unique by name alone, so a company that trades in more than one category
-- could only be captured once: creating "Toyota" as a hotel made "Toyota" as a transfers supplier
-- impossible. Each category is its own record (own rates, routes, cards), so the uniqueness key
-- becomes name + kind + location, and a supplier may optionally inherit its contact details from
-- a sibling record via parent_supplier_id.

-- 1. Uniqueness -------------------------------------------------------------------------------
-- Both create paths must be covered: POST /api/suppliers only collects the free-text `location`,
-- while POST /api/suppliers/quick sets `location_id`. Coalescing the two gives one key that works
-- for either. Every function here is IMMUTABLE, which an index expression requires.

DROP INDEX IF EXISTS public.ux_suppliers_name;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_kind_location_unique_idx
  ON public.suppliers USING btree (
    lower(btrim(name)),
    kind,
    coalesce(location_id::text, lower(btrim(coalesce(location, ''))))
  );

-- 2. Optional link to a sibling record --------------------------------------------------------
-- `parent_supplier_id IS NOT NULL` *is* the "Linked" checkbox -- no separate boolean. Deleting the
-- parent leaves the child standing with the contact values it last mirrored.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS parent_supplier_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_parent_supplier_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.suppliers
      ADD CONSTRAINT suppliers_parent_supplier_id_fkey
      FOREIGN KEY (parent_supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_parent_not_self'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_parent_not_self
      CHECK (parent_supplier_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS suppliers_parent_supplier_id_idx
  ON public.suppliers USING btree (parent_supplier_id);

-- 3. Inheritance is mirrored onto the child row, not resolved at read time ---------------------
-- Supplier contacts are read by consumers that know nothing about parent_supplier_id -- most
-- importantly lib/voucher/build-service-blocks.ts, which joins suppliers(phone, email, website,
-- emergency_phone, default_contact_name) directly. Physically mirroring the values onto the child
-- keeps every one of those readers correct with no code change; "read-only" is then purely a UI
-- affordance plus an API write guard.

-- 3a. Pull the parent's contact scalars down whenever a linked row is written.
CREATE OR REPLACE FUNCTION public.tr_supplier_inherit_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.suppliers%ROWTYPE;
BEGIN
  IF NEW.parent_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO parent_row FROM public.suppliers WHERE id = NEW.parent_supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked supplier % does not exist', NEW.parent_supplier_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- One level only: a linked record can never itself be a parent, in either direction.
  IF parent_row.parent_supplier_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot link to % because it is itself linked to another supplier', parent_row.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers WHERE parent_supplier_id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot link % because other suppliers inherit their contacts from it', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.email := parent_row.email;
  NEW.phone := parent_row.phone;
  NEW.website := parent_row.website;
  NEW.emergency_phone := parent_row.emergency_phone;
  NEW.default_contact_name := parent_row.default_contact_name;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_supplier_inherit_contacts ON public.suppliers;
CREATE TRIGGER tr_supplier_inherit_contacts
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.tr_supplier_inherit_contacts();

-- 3b. Copy the parent's email rows down the moment a row becomes linked.
CREATE OR REPLACE FUNCTION public.copy_supplier_emails_to_child(
  p_parent_id uuid,
  p_child_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.supplier_emails WHERE supplier_id = p_child_id;

  INSERT INTO public.supplier_emails (supplier_id, email, label, sort_order)
  SELECT p_child_id, parent_emails.email, parent_emails.label, parent_emails.sort_order
  FROM public.supplier_emails AS parent_emails
  WHERE parent_emails.supplier_id = p_parent_id;
END $$;

-- 3c. Push a parent's edits down to every record linked to it.
CREATE OR REPLACE FUNCTION public.tr_supplier_propagate_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child_id uuid;
BEGIN
  -- Newly linked (including a link created on INSERT): seed the child's email rows.
  IF NEW.parent_supplier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.parent_supplier_id IS DISTINCT FROM NEW.parent_supplier_id)
  THEN
    PERFORM public.copy_supplier_emails_to_child(NEW.parent_supplier_id, NEW.id);
  END IF;

  -- Unlinking keeps whatever was last mirrored, so there is nothing to undo here: the copied
  -- values simply become the child's own and editable again.

  IF TG_OP = 'UPDATE'
     AND NEW.parent_supplier_id IS NULL
     AND (
          OLD.email IS DISTINCT FROM NEW.email
       OR OLD.phone IS DISTINCT FROM NEW.phone
       OR OLD.website IS DISTINCT FROM NEW.website
       OR OLD.emergency_phone IS DISTINCT FROM NEW.emergency_phone
       OR OLD.default_contact_name IS DISTINCT FROM NEW.default_contact_name
     )
  THEN
    -- The children's own BEFORE trigger re-reads these same values, so this is idempotent and
    -- terminates: a child never has children of its own.
    UPDATE public.suppliers
    SET email = NEW.email,
        phone = NEW.phone,
        website = NEW.website,
        emergency_phone = NEW.emergency_phone,
        default_contact_name = NEW.default_contact_name
    WHERE parent_supplier_id = NEW.id;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_supplier_propagate_contacts ON public.suppliers;
CREATE TRIGGER tr_supplier_propagate_contacts
  AFTER INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.tr_supplier_propagate_contacts();

-- 3d. Keep linked records' email lists in step with the parent's.
-- Statement-level with a transition table so one editor save syncs once, not once per address.
-- Recursion terminates naturally: the re-fire lands on a child, and a child never has children.
CREATE OR REPLACE FUNCTION public.tr_supplier_emails_propagate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_supplier record;
  child record;
BEGIN
  FOR affected_supplier IN SELECT DISTINCT supplier_id FROM affected LOOP
    FOR child IN
      SELECT id FROM public.suppliers WHERE parent_supplier_id = affected_supplier.supplier_id
    LOOP
      PERFORM public.copy_supplier_emails_to_child(affected_supplier.supplier_id, child.id);
    END LOOP;
  END LOOP;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_supplier_emails_propagate_insert ON public.supplier_emails;
CREATE TRIGGER tr_supplier_emails_propagate_insert
  AFTER INSERT ON public.supplier_emails
  REFERENCING NEW TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.tr_supplier_emails_propagate();

DROP TRIGGER IF EXISTS tr_supplier_emails_propagate_update ON public.supplier_emails;
CREATE TRIGGER tr_supplier_emails_propagate_update
  AFTER UPDATE ON public.supplier_emails
  REFERENCING NEW TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.tr_supplier_emails_propagate();

DROP TRIGGER IF EXISTS tr_supplier_emails_propagate_delete ON public.supplier_emails;
CREATE TRIGGER tr_supplier_emails_propagate_delete
  AFTER DELETE ON public.supplier_emails
  REFERENCING OLD TABLE AS affected
  FOR EACH STATEMENT EXECUTE FUNCTION public.tr_supplier_emails_propagate();

NOTIFY pgrst, 'reload schema';
