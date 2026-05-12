SELECT lower(email) AS email, id
FROM auth.users
WHERE lower(email) IN (
  'carmen@luxustravel.co.za',
  'dirk@luxustravel.co.za',
  'leonie@luxustravel.co.za',
  'monade@luxustravel.co.za',
  'douwlien@luxustravel.co.za'
)
ORDER BY email;
