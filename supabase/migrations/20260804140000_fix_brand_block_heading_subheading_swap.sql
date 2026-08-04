-- brand_block_heading/brand_block_subheading were seeded swapped relative to
-- the SARAIL masthead: the bold product line (BLUE TRAIN | ROVOS RAIL |
-- KRUGER SHALATI) belongs in the heading slot, the quieter division line
-- ("A division of Luxus Travel & Tours") in the subheading slot underneath it.
-- Only rows still holding the original mis-swapped default text are touched,
-- so any admin customisation is left alone.
UPDATE public.app_settings
SET value = 'BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI'
WHERE key = 'brand_block_heading'
  AND value = 'A division of Luxus Travel & Tours';

UPDATE public.app_settings
SET value = 'A division of Luxus Travel & Tours'
WHERE key = 'brand_block_subheading'
  AND value = 'BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI';
