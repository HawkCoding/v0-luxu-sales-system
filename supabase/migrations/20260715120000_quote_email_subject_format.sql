-- Quote email subject now encodes supplier/client/route/date at a glance.
-- Upgrade ONLY if the subject is still the unedited stock version — a
-- manager's customised subject is never overwritten.

update public.templates
set subject = '{{supplierName}}/{{clientSurname}}-{{direction}}-{{departureDateShort}}',
    version = version + 1,
    updated_at = now()
where key = 'quote_email'
  and subject = 'Your Quote — {{jobNumber}}';
