-- Email automation Phase 3: real invoice PDFs.
-- 1. Private `invoices` storage bucket (PDF only) with authenticated access.
-- 2. invoices.pdf_document_id linking to the generated documents row.
-- 3. Remove legacy phantom invoice_pdf document rows that pointed at
--    `invoices/<invoice uuid>` paths which never had a stored file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "invoices_pdf_read" on storage.objects;
create policy "invoices_pdf_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices');

drop policy if exists "invoices_pdf_insert" on storage.objects;
create policy "invoices_pdf_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'invoices');

drop policy if exists "invoices_pdf_update" on storage.objects;
create policy "invoices_pdf_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'invoices')
  with check (bucket_id = 'invoices');

alter table public.invoices
  add column if not exists pdf_document_id uuid references public.documents(id) on delete set null;

-- Upgrade the stock deposit_request template body ONLY if it is still the
-- unedited seeded version (tokens for percentage/due date/invoice number and
-- the banking-details block are now supplied by the send flow).
update public.templates
set body_html = '<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>R {{depositAmount}}</strong> ({{depositPercentage}}%) is required to secure your booking, due by <strong>{{dueDate}}</strong>. Invoice <strong>{{invoiceNumber}}</strong> is attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>',
    version = version + 1,
    updated_at = now()
where key = 'deposit_request'
  and body_html = '<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>R {{depositAmount}}</strong> (25%) is required to secure your booking. Please find your invoice attached.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>';

-- Invoice email intro/closing wording now lives in the deposit_request /
-- final_invoice templates.
delete from public.app_settings
where key in ('invoice_email_intro_deposit', 'invoice_email_intro_final', 'invoice_email_closing');

-- Phantom rows: created by the old deposit/final routes with
-- storage_path = 'invoices/<invoice uuid>' and no actual file behind them.
delete from public.documents
where kind = 'invoice_pdf'
  and storage_path ~ '^invoices/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
