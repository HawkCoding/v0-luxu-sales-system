-- Quote PDF no longer labels itself "provisional" (customer feedback: the
-- word implied the quote wasn't final). Only updates the row if it still
-- holds the old default, so a manually-edited title in Settings is untouched.
UPDATE public.app_settings
SET value = 'QUOTATION'
WHERE key = 'quote_doc_title' AND value = 'PROVISIONAL QUOTATION';
