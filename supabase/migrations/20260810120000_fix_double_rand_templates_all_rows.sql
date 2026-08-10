-- Follow-up to 20260723130000_fix_double_rand_templates.sql, which only cleaned
-- rows with is_system = true. Salesperson-edited (and non-system) templates kept
-- the literal "R" in front of money tokens, so production deposit-invoice emails
-- still render "RR 44 475,75" — the tokens already resolve through
-- Intl.NumberFormat ZAR currency style, which emits the "R" itself.
-- Widened here to every row and to the subject line as well. Idempotent: rows
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
  subject =
  replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(subject,
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
WHERE body_html LIKE '%R{{%'
   OR body_html LIKE '%R {{%'
   OR subject LIKE '%R{{%'
   OR subject LIKE '%R {{%';
