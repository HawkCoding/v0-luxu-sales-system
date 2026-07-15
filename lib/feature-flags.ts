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
