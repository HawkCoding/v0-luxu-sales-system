SELECT email, name, surname, clearance_level::text AS clearance_level, is_active
FROM public.profiles
WHERE lower(email) IN (
  'carmen@luxustravel.co.za',
  'dirk@luxustravel.co.za',
  'leonie@luxustravel.co.za',
  'monade@luxustravel.co.za',
  'douwlien@luxustravel.co.za'
)
ORDER BY email;
