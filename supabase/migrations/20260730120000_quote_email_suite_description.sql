-- Point the AVAILABILITY line at {{suiteDescription}}.
--
-- {{suiteType}} and {{suiteConfiguration}} are independent lists, so a booking
-- with more than one suite rendered the cross-product — "a Deluxe and Luxury
-- Twin bedded, with a shower, Twin bedded, with a 3/4 bath and Double bedded,
-- with a full bath". {{suiteDescription}} pairs each suite with its own
-- configuration and carries its own article, so the literal "a " in front of
-- the token goes too.
--
-- Targeted string replacements rather than a whole-body rewrite: the sales team
-- edits these bodies in Settings, and clobbering the body would throw that away.
-- Idempotent — after the first run no pattern matches.

update public.templates
set
  body_html = replace(
    replace(
      replace(
        body_html,
        'with a <strong>{{suiteType}} {{suiteConfiguration}}</strong>',
        'with <strong>{{suiteDescription}}</strong>'
      ),
      'with a {{suiteType}} {{suiteConfiguration}}',
      'with {{suiteDescription}}'
    ),
    '{{suiteType}} {{suiteConfiguration}}',
    '{{suiteDescription}}'
  ),
  version = version + 1,
  updated_at = now()
where body_html like '%{{suiteType}} {{suiteConfiguration}}%';

-- The seeded body still carried a "****" placeholder where the suite line
-- belongs; fill it in so a fresh database matches what production sends.
update public.templates
set
  body_html = replace(
    body_html,
    'assist you with a <strong>****</strong>',
    'assist you with <strong>{{suiteDescription}}</strong>'
  ),
  version = version + 1,
  updated_at = now()
where key = 'quote_email'
  and body_html like '%assist you with a <strong>****</strong>%';
