-- One documents row per (booking, kind, storage path).
--
-- lib/documents/upsert-generated-document.ts looked the row up and then inserted it, with nothing
-- in the database stopping two regenerations that land at the same moment from each inserting a
-- row for the same file -- the Documents tab then listed the PDF twice. This adds the unique index
-- the helper's upsert targets (onConflict: booking_id,kind,storage_path).
--
-- Existing duplicates have to go first or the index build fails. Every row in a duplicate group
-- points at the same storage object, so removing the extras loses no file. Per group the row kept
-- is, in order: one a quote, invoice or voucher links to (pdf_document_id); one marked 'sent'
-- (that status gates the Voucher Sent stage); the newest. Links to a removed row are moved to the
-- kept one first -- quotes.pdf_document_id has no ON DELETE action, so a delete would fail on it.
--
-- NULL storage paths never conflict (uploads without a file, placeholder 'required' rows), and
-- uploaded attachments carry a random UUID in their path, so neither is touched.
--
-- Idempotent: with no duplicates left the dedupe is a no-op, and the index uses IF NOT EXISTS.

DO $$
DECLARE
  v_groups integer;
  v_removed integer;
BEGIN
  CREATE TEMP TABLE _document_duplicates ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      d.id,
      d.booking_id,
      d.kind,
      d.storage_path,
      row_number() OVER (
        PARTITION BY d.booking_id, d.kind, d.storage_path
        ORDER BY
          (EXISTS (SELECT 1 FROM public.quotes q WHERE q.pdf_document_id = d.id)
            OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.pdf_document_id = d.id)
            OR EXISTS (SELECT 1 FROM public.vouchers v WHERE v.pdf_document_id = d.id)) DESC,
          (d.status = 'sent') DESC,
          d.created_at DESC,
          d.id DESC
      ) AS rank,
      count(*) OVER (PARTITION BY d.booking_id, d.kind, d.storage_path) AS group_size
    FROM public.documents d
    WHERE d.storage_path IS NOT NULL
  )
  SELECT loser.id AS loser_id, keeper.id AS keeper_id
  FROM ranked loser
  JOIN ranked keeper
    ON keeper.booking_id = loser.booking_id
   AND keeper.kind = loser.kind
   AND keeper.storage_path = loser.storage_path
   AND keeper.rank = 1
  WHERE loser.group_size > 1
    AND loser.rank > 1;

  SELECT count(DISTINCT keeper_id), count(*) INTO v_groups, v_removed FROM _document_duplicates;

  UPDATE public.quotes q
     SET pdf_document_id = dup.keeper_id
    FROM _document_duplicates dup
   WHERE q.pdf_document_id = dup.loser_id;

  UPDATE public.invoices i
     SET pdf_document_id = dup.keeper_id
    FROM _document_duplicates dup
   WHERE i.pdf_document_id = dup.loser_id;

  UPDATE public.vouchers v
     SET pdf_document_id = dup.keeper_id
    FROM _document_duplicates dup
   WHERE v.pdf_document_id = dup.loser_id;

  DELETE FROM public.documents d
   USING _document_duplicates dup
   WHERE d.id = dup.loser_id;

  RAISE NOTICE 'documents dedupe: % duplicate group(s), % row(s) removed', v_groups, v_removed;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_booking_kind_storage_path
  ON public.documents (booking_id, kind, storage_path);
