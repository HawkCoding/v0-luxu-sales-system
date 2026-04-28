CREATE OR REPLACE FUNCTION public.audit_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_id uuid;
  actor_name text;
  changed_record jsonb;
  audit_entity_type text;
  audit_entity_id text;
  audit_action text;
BEGIN
  BEGIN
    actor_id := auth.uid();

    IF actor_id IS NOT NULL THEN
      SELECT trim(concat_ws(' ', p.name, p.surname))
      INTO actor_name
      FROM public.profiles p
      WHERE p.user_id = actor_id;
    END IF;

    actor_name := nullif(actor_name, '');
    actor_name := coalesce(actor_name, 'system');

    changed_record := CASE
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END;

    audit_entity_id := coalesce(changed_record ->> 'id', changed_record ->> 'user_id');

    audit_entity_type := CASE TG_TABLE_NAME
      WHEN 'customers' THEN 'Customer'
      WHEN 'bookings' THEN 'Booking'
      WHEN 'quotes' THEN 'Quote'
      WHEN 'quote_line_items' THEN 'QuoteLineItem'
      WHEN 'payments' THEN 'Payment'
      WHEN 'suppliers' THEN 'Supplier'
      WHEN 'packages' THEN 'Package'
      WHEN 'package_legs' THEN 'PackageLeg'
      WHEN 'travellers' THEN 'Traveller'
      WHEN 'profiles' THEN 'UserProfile'
      WHEN 'locations' THEN 'Location'
      WHEN 'customer_linked_accounts' THEN 'CustomerLinkedAccount'
      WHEN 'supplier_email_labels' THEN 'SupplierEmailLabel'
      ELSE replace(initcap(replace(TG_TABLE_NAME, '_', ' ')), ' ', '')
    END;

    audit_action := CASE TG_OP
      WHEN 'INSERT' THEN 'record_created'
      WHEN 'UPDATE' THEN 'record_updated'
      WHEN 'DELETE' THEN 'record_deleted'
    END;

    INSERT INTO public.audit_logs (
      actor,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_json,
      after_json
    )
    VALUES (
      actor_name,
      actor_id,
      audit_entity_type,
      coalesce(audit_entity_id, ''),
      audit_action,
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  audited_table text;
  trigger_name text;
  audited_tables text[] := ARRAY[
    'customers',
    'bookings',
    'quotes',
    'quote_line_items',
    'payments',
    'suppliers',
    'packages',
    'package_legs',
    'travellers',
    'profiles',
    'locations',
    'customer_linked_accounts',
    'supplier_email_labels'
  ];
BEGIN
  FOREACH audited_table IN ARRAY audited_tables LOOP
    IF to_regclass(format('public.%I', audited_table)) IS NOT NULL THEN
      trigger_name := format('audit_%s', audited_table);

      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I',
        trigger_name,
        audited_table
      );

      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_table_change()',
        trigger_name,
        audited_table
      );
    END IF;
  END LOOP;
END;
$$;
