-- F-P3-12: the quote_email template's availability line was hardcoded rail vocabulary --
-- "we can still assist you with your selected suite" -- reaching a tour or stay client unchanged,
-- since nothing resolved the noun to what they'd actually booked. {{unitNoun}} (lib/templates/
-- registry.ts) now resolves per the booking's primary product (suite/room/tour/cabin/vehicle) --
-- point the template at it. replace() is naturally idempotent: once applied, the old substring is
-- gone, so re-running this migration is a no-op. Scoped narrowly so a template an admin has since
-- hand-edited (and no longer contains the old phrase) is left untouched.
update public.templates set
  body_html = replace(
    body_html,
    'we can still assist you with your selected suite.',
    'we can still assist you with your selected {{unitNoun}}.'
  ),
  version = version + 1,
  updated_at = now()
where key = 'quote_email'
  and body_html like '%your selected suite.%';
