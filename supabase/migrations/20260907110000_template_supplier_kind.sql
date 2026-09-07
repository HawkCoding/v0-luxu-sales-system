-- Per-kind email template variants: a system template key (e.g. "quote_email") can now also have
-- one row per SupplierKind ("hotel_property"), sitting between the per-supplier variant
-- (20260824100000_template_supplier_variants.sql) and the untagged shared row in resolution order.
-- Lets a hotel-shaped or tour-shaped quote email be written once and reused by every supplier of
-- that kind, rather than hand-authored per supplier. Resolution order lives in code
-- (lib/templates/get-template.ts): (key, supplierId) -> (key, supplierKind) -> (key, NULL) ->
-- DEFAULT_TEMPLATES.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS supplier_kind text;

-- Mutually exclusive with a specific supplier: a row targets all bookings, one product kind, or one
-- supplier -- never two of those at once.
ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_supplier_id_or_kind_check;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_supplier_id_or_kind_check
  CHECK (supplier_id IS NULL OR supplier_kind IS NULL);

-- Replaces the two-column unique index from 20260824100000 with a three-column one. NULLS NOT
-- DISTINCT still gives at most one untagged row per key (supplier_id and supplier_kind both null)
-- and at most one row per key per supplier, and now also at most one row per key per kind -- three
-- independent uniqueness rules from a single index, since a non-null supplier_kind never equals a
-- null one.
DROP INDEX IF EXISTS public.ux_templates_key_supplier;
CREATE UNIQUE INDEX IF NOT EXISTS ux_templates_key_supplier_kind
  ON public.templates (key, supplier_id, supplier_kind) NULLS NOT DISTINCT;

-- Idempotent seed: kind-level wording for the three system templates whose default copy is rail-
-- shaped ("your journey", "secure your suite", "wonderful journey on {{routeName}}") and reaches a
-- hotel, tour or cruise client unchanged otherwise. follow_up is included because its "secure your
-- suite" line is the same defect. ON CONFLICT targets the new three-column index, so a second run
-- (or a row an admin has since hand-edited under the same key+kind) is a no-op rather than an error
-- -- hand edits are never overwritten by a later deploy of this migration.
INSERT INTO public.templates (key, name, subject, body_html, version, active, is_system, sort_order, supplier_kind)
VALUES
  (
    'quote_email', 'Quote email — Hotel',
    '{{supplierName}}/{{clientSurname}}-{{checkInDate}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your enquiry.</p><p>We are pleased to share your Luxus Travel &amp; Tours quote for your stay at <strong>{{propertyName}}</strong>, checking in <strong>{{checkInDate}}</strong>.</p>{{quoteSummaryTable}}<p>The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1000, 'hotel_property'
  ),
  (
    'quote_email', 'Quote email — Tour',
    '{{supplierName}}/{{clientSurname}}-{{departureDateShort}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your enquiry.</p><p>We are pleased to share your Luxus Travel &amp; Tours quote for your tour with <strong>{{supplierName}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1001, 'tour_operator'
  ),
  (
    'quote_email', 'Quote email — Cruise',
    '{{supplierName}}/{{clientSurname}}-{{departureDateShort}}',
    '<p>Dear {{customerName}},</p><p>Thank you for your enquiry.</p><p>We are pleased to share your Luxus Travel &amp; Tours quote for your voyage with <strong>{{supplierName}}</strong>, sailing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1002, 'cruise_line'
  ),
  (
    'voucher_email', 'Voucher email — Hotel',
    'Your Travel Voucher — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Your travel voucher for your stay at <strong>{{propertyName}}</strong> is attached, together with your itinerary. Please present the voucher to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1003, 'hotel_property'
  ),
  (
    'voucher_email', 'Voucher email — Tour',
    'Your Travel Voucher — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Your travel voucher for your <strong>{{supplierName}}</strong> tour is attached, together with your itinerary. Please present the voucher to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1004, 'tour_operator'
  ),
  (
    'voucher_email', 'Voucher email — Cruise',
    'Your Travel Voucher — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>Your travel voucher for your <strong>{{supplierName}}</strong> voyage is attached, together with your itinerary. Please present the voucher to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1005, 'cruise_line'
  ),
  (
    'thank_you', 'Thank you — Hotel',
    'Thank you for travelling with us — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We hope you had a wonderful stay at <strong>{{propertyName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you back again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1006, 'hotel_property'
  ),
  (
    'thank_you', 'Thank you — Tour',
    'Thank you for travelling with us — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We hope you had a wonderful time on your <strong>{{supplierName}}</strong> tour. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1007, 'tour_operator'
  ),
  (
    'thank_you', 'Thank you — Cruise',
    'Thank you for travelling with us — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We hope you had a wonderful voyage with <strong>{{supplierName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1008, 'cruise_line'
  ),
  (
    'follow_up', 'Follow up — Hotel',
    'Following up on your enquiry — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your room.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1009, 'hotel_property'
  ),
  (
    'follow_up', 'Follow up — Tour',
    'Following up on your enquiry — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your place.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1010, 'tour_operator'
  ),
  (
    'follow_up', 'Follow up — Cruise',
    'Following up on your enquiry — {{jobNumber}}',
    '<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your cabin.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    1, true, false, 1011, 'cruise_line'
  )
ON CONFLICT (key, supplier_id, supplier_kind) DO NOTHING;

NOTIFY pgrst, 'reload schema';
