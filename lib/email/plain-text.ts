import { htmlToPlainText } from "@/lib/inbound-email/html"
import { extractContentSlot } from "@/lib/templates/content-slot"
import { extractSignatureSlot } from "@/lib/templates/signature-slot"

/** Longest inbox-preview snippet worth carrying; clients show well under this. */
const PREHEADER_MAX_LENGTH = 140

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Inbox-preview snippet for a rendered template body: the first words of the message itself, so
 * the list shows what the email says instead of the subject (which the list already shows) or,
 * in Outlook, whatever visible text it finds first -- the brand masthead's logo URL.
 */
export function buildPreheader(bodyHtml: string, fallback: string): string {
  const text = collapse(htmlToPlainText(bodyHtml))
  if (!text) return fallback
  return text.length > PREHEADER_MAX_LENGTH ? `${text.slice(0, PREHEADER_MAX_LENGTH - 1).trimEnd()}…` : text
}

/**
 * text/plain alternative for a branded email. Mail clients build the inbox preview from this part
 * when it exists, so it must open with the message body: no <style> CSS, no hidden preheader and no
 * masthead logo ahead of the content. Falls back to the whole document when the slots are missing.
 */
export function brandedEmailToPlainText(html: string): string {
  const content = extractContentSlot(html)
  if (content === null) return htmlToPlainText(html.replace(/<head[\s\S]*?<\/head>/gi, " "))
  const signature = extractSignatureSlot(html)
  return [content, signature]
    .filter((part): part is string => !!part)
    .map((part) => htmlToPlainText(part))
    .filter(Boolean)
    .join("\n\n")
}
