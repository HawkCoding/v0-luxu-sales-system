-- Fix double-Rand bug: money tokens (amountDue, depositAmount, etc.) are
-- resolved via Intl.NumberFormat ZAR currency style, which already includes
-- the "R" symbol (e.g. "R 12 345,00"). A few system templates additionally
-- hardcoded a literal "R"/"R " before the token, producing "R R 12 345,00"
-- in sent emails. Strip the redundant literal prefix. Idempotent: rows
-- without the pattern are left untouched, so re-running is a no-op.
UPDATE public.templates
SET body_html =
  replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(body_html,
    'R {{amountDue}}',         '{{amountDue}}'),
    'R{{amountDue}}',          '{{amountDue}}'),
    'R {{depositAmount}}',     '{{depositAmount}}'),
    'R{{depositAmount}}',      '{{depositAmount}}'),
    'R {{finalAmount}}',       '{{finalAmount}}'),
    'R{{finalAmount}}',        '{{finalAmount}}'),
    'R {{receivedAmount}}',    '{{receivedAmount}}'),
    'R{{receivedAmount}}',     '{{receivedAmount}}'),
    'R {{outstandingAmount}}', '{{outstandingAmount}}'),
    'R{{outstandingAmount}}',  '{{outstandingAmount}}'),
    'R {{total}}',             '{{total}}'),
    'R{{total}}',              '{{total}}'),
    'R {{amountReceived}}',    '{{amountReceived}}'),
    'R{{amountReceived}}',     '{{amountReceived}}'),
  updated_at = now()
WHERE is_system = true
  AND (body_html LIKE '%R{{%' OR body_html LIKE '%R {{%');
