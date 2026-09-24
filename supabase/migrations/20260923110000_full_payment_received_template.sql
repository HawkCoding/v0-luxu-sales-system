-- "Full payment received" system template: the payment confirmation sent once the booking balance
-- reaches zero -- the final payment after a deposit, or a pay-in-full invoice settled. Until now
-- every payment confirmation used payment_received, whose "Final amount due {{finalDueDate}}:
-- {{outstandingAmount}}" line read nonsensically on a booking that owed nothing. Deposit-only
-- payments keep payment_received; app/api/jobs/[id]/payment-received/route.ts picks the key.
--
-- Wording mirrors payment_received (SA Rail tone) minus the final-due line, and matches
-- DEFAULT_TEMPLATES.full_payment_received in lib/templates/get-template.ts.
--
-- Idempotent: ON CONFLICT targets ux_templates_key_supplier_kind (key, supplier_id, supplier_kind)
-- NULLS NOT DISTINCT -- `(key)` alone raises 42P10 -- so a re-run, or a row an admin has since
-- edited, is left untouched. Sits next to payment_received in the Templates page order.
INSERT INTO public.templates (key, name, subject, body_html, version, active, is_system, sort_order)
SELECT
  'full_payment_received',
  'Full payment received',
  'Full payment received — {{invoiceNumber}}',
  '<p>Dear {{customerName}},</p><p>Thank you very much for your payment well received.</p><p>We are delighted to confirm that your booking is now paid in full. Please find attached your amended confirmation invoice.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Amount received: <strong>{{receivedAmount}}</strong> – Paid in full, thank you</p><p><strong>TICKETS &amp; VOUCHERS</strong></p><p>Your travel vouchers will now be issued and sent to you electronically.</p><p>Hope you have a wonderful day.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
  1,
  true,
  true,
  COALESCE(
    (
      SELECT t.sort_order
      FROM public.templates t
      WHERE t.key = 'payment_received' AND t.supplier_id IS NULL AND t.supplier_kind IS NULL
      LIMIT 1
    ),
    0
  )
ON CONFLICT (key, supplier_id, supplier_kind) DO NOTHING;

NOTIFY pgrst, 'reload schema';
