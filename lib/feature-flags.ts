/**
 * Backup & restore is built but intentionally disabled — hidden from the UI
 * and its API routes return 404. Flip to true if a client requests it
 * (re-verify the flow first, and re-add the /api/cron/backup entry to
 * vercel.json for daily automatic backups).
 */
export const BACKUPS_ENABLED = false

/**
 * Quote validity ("valid until") is built but hidden — no Settings card, no
 * pickers, no "valid until" wording in quote emails/PDFs, and no validityDate
 * token chip on the Templates page. New quotes still get validity_until
 * stamped silently (quote date + org default days) so re-enabling is clean.
 * Nothing automates or gates on the date while this is false.
 */
export const QUOTE_VALIDITY_ENABLED = false

/**
 * Quote number and quote date are built but hidden from everything the
 * customer sees — no quote number badge or quote date row on the quote PDF,
 * no quote meta lines in the quote email, no quoteNumber/quoteDate token chips
 * on the Templates page, and the emailed PDF is named after the booking number
 * rather than the quote number. Salespeople never reference either, so they are
 * noise on customer documents.
 *
 * Quotes are still numbered and versioned (LTT-2026-0001-Q1) and staff screens
 * still show the number, so re-enabling is a one-line flip.
 */
export const QUOTE_REFERENCE_ENABLED = false
