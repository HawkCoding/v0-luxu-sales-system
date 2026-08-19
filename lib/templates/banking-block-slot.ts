// Locates and swaps the {{bankingDetails}} block inside composed email
// content. Unlike the signature, which sits in its own marker-comment slot
// outside the editable content (lib/templates/signature-slot.ts), the
// banking block is *inside* the content — it's an editable, movable
// preserved block in the rich-text editor (lib/templates/rich-text/serialize.ts).
// So the swap is a DOM replacement of the element carrying
// data-payment-block="1" (set in lib/invoices/banking-details-block.ts),
// not a string-marker splice. Pure DOMParser walk — safe to import from both
// server and client code (jsdom in tests, browser in the app).

const PAYMENT_BLOCK_SELECTOR = "[data-payment-block]"

/** True when the content contains a banking-details block to swap. */
export function hasBankingBlock(contentHtml: string): boolean {
  const doc = new DOMParser().parseFromString(contentHtml, "text/html")
  return doc.body.querySelector(PAYMENT_BLOCK_SELECTOR) !== null
}

/**
 * Replace the banking-details block element with newly rendered block HTML.
 * Returns null when no block is present, so callers can leave the content
 * untouched rather than silently no-op inserting nothing.
 */
export function replaceBankingBlock(contentHtml: string, newBlockHtml: string): string | null {
  const doc = new DOMParser().parseFromString(contentHtml, "text/html")
  const target = doc.body.querySelector(PAYMENT_BLOCK_SELECTOR)
  if (!target) return null

  const replacementDoc = new DOMParser().parseFromString(newBlockHtml, "text/html")
  const replacement = replacementDoc.body.firstElementChild
  if (!replacement) return null

  target.replaceWith(replacement)
  return doc.body.innerHTML
}
