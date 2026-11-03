-- Taiwan was missing from the country list, so a Taiwanese guest's residence resolved to no code
-- and the {{guestInfo}} GUEST DETAILS line printed "DOB: 20/02/1981 300000002" without the "TW"
-- Carmen writes. There is no settings screen for countries, so it is seeded here. Idempotent.

INSERT INTO public.countries (name, iso_alpha2, iso_alpha3)
VALUES ('Taiwan', 'TW', 'TWN')
ON CONFLICT (name) DO UPDATE
SET
  iso_alpha2 = EXCLUDED.iso_alpha2,
  iso_alpha3 = EXCLUDED.iso_alpha3;

INSERT INTO public.country_aliases (country_id, alias)
SELECT c.id, lower(trim(v.alias))
FROM (
  VALUES
    ('Taiwan'),
    ('TW'),
    ('TWN'),
    ('Republic of China'),
    ('ROC')
) AS v(alias)
JOIN public.countries c ON c.name = 'Taiwan'
ON CONFLICT DO NOTHING;
