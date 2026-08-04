-- Client-facing invoice email subjects showed both the salesperson-typed
-- invoice number and the internal job reference (e.g. "Confirmation Invoice
-- 244453 — LTT-2026-0025"). The job reference means nothing to the customer;
-- only the typed invoice number should appear. deposit_request is untouched
-- here — its live subject was already customized away from job-number
-- wording (mirrors the quote_email subject format).

update public.templates set
  subject = 'Invoice {{invoiceNumber}}',
  version = version + 1,
  updated_at = now()
where key = 'full_payment_request';

update public.templates set
  subject = 'Final Invoice {{invoiceNumber}}',
  version = version + 1,
  updated_at = now()
where key = 'final_invoice';

update public.templates set
  subject = 'Payment received — {{invoiceNumber}}',
  version = version + 1,
  updated_at = now()
where key = 'payment_received';
