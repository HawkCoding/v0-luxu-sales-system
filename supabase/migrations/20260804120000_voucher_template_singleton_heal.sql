-- Data-only heal: the voucher_template singleton row can go missing
-- (e.g. lost to out-of-band prod pushes), which breaks Save/upload since
-- both assume exactly one row exists. Re-seed it if absent; idempotent.
INSERT INTO voucher_template (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM voucher_template);
