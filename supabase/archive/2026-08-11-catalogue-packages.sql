-- Archive of the catalogue-package data as it stood immediately before
-- 20260811140000_drop_catalogue_packages.sql removed these tables.
--
-- Kept as a record: the Blue Train Five Night Package was the only authored package
-- (the other production rows were auto-generated per-booking "hidden" packages). There is
-- no UI left that could display this, so it is reference material, not a restore path --
-- the tables and their foreign keys would have to be recreated first.
--
-- Column order matches the pre-drop schema; see the migration history if you need it.

INSERT INTO public.packages VALUES ('7af631c8-99ff-4eff-8964-96971736278f', 'Blue Train Five Night Package', NULL, true, '2026-07-08 09:10:59.747152+00', '2026-07-08 09:10:59.747152+00', 5, 50.00, 'ZAR', 'blue-train-five-night-package', NULL, 0.00);
INSERT INTO public.package_legs VALUES ('1631c0a8-9c2b-4fe9-8b94-884084beeaa0', '7af631c8-99ff-4eff-8964-96971736278f', '002b438f-df83-483a-9274-f17e9fef7f35', 'The Blue Train', 0, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_legs VALUES ('5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4', '7af631c8-99ff-4eff-8964-96971736278f', 'd13eedf1-9700-40ae-8fce-e9cf1cb277fa', 'Ulysses Tours & Transfers', 1, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_legs VALUES ('18da3cc2-ebe5-440a-958e-5474ec0f349f', '7af631c8-99ff-4eff-8964-96971736278f', 'fa22aa9c-7e8d-4f7e-9abb-16cf8011d8c9', 'The President Hotel', 2, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_legs VALUES ('569ef307-9a27-4e6d-84a4-8be9e4b12766', '7af631c8-99ff-4eff-8964-96971736278f', '87cbbf54-5085-4146-afe7-172f522b3325', 'City Sightseeing Bus Tours', 3, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_legs VALUES ('c68f1ea0-df95-4a61-95d3-6b84ad6c6353', '7af631c8-99ff-4eff-8964-96971736278f', 'd13eedf1-9700-40ae-8fce-e9cf1cb277fa', 'Ulysses Tours & Transfers', 4, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_legs VALUES ('54e9d8bd-aa12-46d7-b15e-1e38660242ae', '7af631c8-99ff-4eff-8964-96971736278f', 'c3c2de5c-c68d-41c5-b04a-053708edca5a', 'FlySafair', 5, '2026-07-08 09:11:00.134+00', NULL);
INSERT INTO public.package_leg_routes VALUES ('1631c0a8-9c2b-4fe9-8b94-884084beeaa0', 'a409fa56-f2d0-4981-a211-798ab54f1fa6', '2026-07-08 09:11:00.134+00');
INSERT INTO public.package_leg_routes VALUES ('5bd4c566-b0b5-4fa3-8035-e9a7fd3a4ee4', '5d50f736-f4a3-4fb1-9518-da7dc67c14e6', '2026-07-08 09:11:00.134+00');
INSERT INTO public.package_leg_routes VALUES ('569ef307-9a27-4e6d-84a4-8be9e4b12766', '635df36f-b0b9-4199-bec7-4e6d8bf00332', '2026-07-08 09:11:00.134+00');
INSERT INTO public.package_leg_routes VALUES ('c68f1ea0-df95-4a61-95d3-6b84ad6c6353', '4b8b200f-f34d-4e5a-9192-4e60e5d91a24', '2026-07-08 09:11:00.134+00');
INSERT INTO public.package_leg_routes VALUES ('54e9d8bd-aa12-46d7-b15e-1e38660242ae', 'fdd66479-3d2c-4b75-b7d2-23743d12203e', '2026-07-08 09:11:00.134+00');
