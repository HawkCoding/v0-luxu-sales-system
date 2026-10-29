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

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/**
 * HTML to readable text for the outgoing text/plain part: `<br>` is a line break and every block
 * ends in a blank line, so the paragraphs the salesperson wrote stay separate. (htmlToPlainText
 * flattens inbound enquiries for the parser; it ignores `<br>` and puts each paragraph on one line,
 * which ran "Availability" into the sentence under it.)
 */
function htmlToEmailPlainText(html: string): string {
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|blockquote)>/gi, "\n\n")
    .replace(/<\/(tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * text/plain alternative for a branded email. Mail clients build the inbox preview from this part
 * when it exists, so it must open with the message body: no <style> CSS, no hidden preheader and no
 * masthead logo ahead of the content. Falls back to the whole document when the slots are missing.
 */
export function brandedEmailToPlainText(html: string): string {
  const content = extractContentSlot(html)
  if (content === null) return htmlToEmailPlainText(html.replace(/<head[\s\S]*?<\/head>/gi, " "))
  const signature = extractSignatureSlot(html)
  return [content, signature]
    .filter((part): part is string => !!part)
    .map((part) => htmlToEmailPlainText(part))
    .filter(Boolean)
    .join("\n\n")
}
