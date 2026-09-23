// Builds the {{quoteSummaryTable}} block token for the quote_email template:
// quote meta summary (incl. journey dates + guests), the dated package
// itinerary and exclusions, then the per-person rate and bold VAT-inclusive
// total as the final block — as inline-styled HTML. Content mirrors the quote
// PDF (lib/quotes/pdf/quote-document.tsx) via the shared quote-presentation
// helpers. Each section carries a data-label attribute so the send-dialog
// editor can show a readable name on its locked placeholder card.

import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { EMAIL_COLORS } from "@/lib/email/email-chrome"
import { formatMoney } from "@/lib/money"
import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import {
  AGENT_COMMISSION_COLOR,
  AGENT_COMMISSION_LABEL,
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  derivePerPersonRate,
  DISCOUNT_COLOR,
  DISCOUNT_LABEL,
  formatAgentCommission,
  formatDiscount,
  formatFlightCapLine,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
  TRAVEL_DATES_LABEL,
  VAT_INCLUSIVE_SUFFIX,
  WARNING_TEXT_COLOR,
} from "@/lib/quotes/quote-presentation"

export interface QuoteSummaryInput {
  quoteNumber: string
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  adults: number
  children: number
  /** VAT-inclusive grand total (quotes.total) — already net of agentCommission. */
  total: number
  /** Gross travel price before the agency discount (quotes.subtotal). Only shown, and only used
   *  to derive the per-person rate, when agentCommission is greater than zero. */
  subtotal?: number
  /** Flat discount given to a booking agency (quotes.agent_commission). Zero/absent renders the
   *  pricing box exactly as it did before this field existed. */
  agentCommission?: number
  /** Client-facing Discount (quotes.discount_amount). Only rendered when discountVisible is true. */
  discount?: number
  /** quotes.discount_visible — the total is net of the discount either way; this only controls
   *  whether the red line prints. */
  discountVisible?: boolean
  /** The quote's currency (quotes.currency). Every amount in the block is in it. */
  currency?: string
  /** Package itinerary; empty array omits the section entirely. */
  itineraryBlocks: VoucherServiceBlock[]
  /** Heading for the itinerary section (document-text setting). */
  packageIncludesHeading?: string
  /** Heading for the exclusions section (document-text setting). */
  packageExcludesHeading?: string
  /** Standing exclusion appended after the suppliers' own; empty omits it. */
  packageExcludesDefault?: string
  /** Highest priced adult flight fare on the quote; null/absent omits the capped-fare bullet. */
  flightCapPerPerson?: number | null
}

export function formatQuoteDate(value: string | null): string {
  return formatDisplayDate(value) || "To be confirmed"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// Panels are a Swirl fill on the Angora message with a warm divider border, so
// they still read as boxes now that the container itself is tinted.
const panel = `margin:18px 0;padding:14px 16px;background-color:${EMAIL_COLORS.panel};border:1px solid ${EMAIL_COLORS.divider};`
const summaryBox = panel
const summaryLine = "margin:0 0 6px;color:#312b24;font-size:13px;line-height:19px;"
const pricingBox = panel
const perPersonLine = "margin:0 0 6px;color:#554c42;font-size:13px;line-height:19px;"
const subtotalLine = "margin:0 0 4px;color:#554c42;font-size:13px;line-height:19px;"
const agentCommissionLine = `margin:0 0 4px;color:${AGENT_COMMISSION_COLOR};font-size:13px;font-weight:700;line-height:19px;`
const discountLine = `margin:0 0 4px;color:${DISCOUNT_COLOR};font-size:13px;font-weight:700;line-height:19px;`
const pricingDivider = `margin:0 0 6px;border-bottom:1px solid ${EMAIL_COLORS.divider};`
const totalLine = "margin:0;color:#172018;font-size:16px;font-weight:700;line-height:22px;"
const sectionHeading = `margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid ${EMAIL_COLORS.divider};color:#172018;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;`
// The itinerary reads a size smaller than the email's 13px body copy, its bullets smaller again --
// mirrors the PDF's 9pt/8pt itinerary against its 10pt body.
const itineraryTitle = "margin:0 0 2px;color:#172018;font-size:12px;font-weight:700;line-height:17px;"
const itineraryText = "margin:0 0 3px;color:#312b24;font-size:12px;line-height:17px;"
const itineraryDetail =
  "margin:0 0 2px;padding-left:12px;color:#554c42;font-size:11px;line-height:16px;"
// A subheading inside the bullet list: bold and undashed, with a little air above it so it reads
// as a section break rather than another inclusion.
const itineraryDetailHeading =
  "margin:6px 0 2px;padding-left:12px;color:#312b24;font-size:11px;font-weight:700;line-height:16px;"
// A caveat the client must not miss ("Train arrival times cannot be guaranteed").
const itineraryDetailWarning = `margin:0 0 2px;padding-left:12px;color:${WARNING_TEXT_COLOR};font-size:11px;line-height:16px;`
// A hotel's own description, in place of its facility bullets.
const itineraryDescription =
  "margin:0 0 2px;padding-left:12px;color:#554c42;font-size:11px;font-style:italic;line-height:16px;"
const excludesItem = "margin:0 0 4px;color:#554c42;font-size:12px;line-height:18px;"

const DEFAULT_INCLUDES_HEADING = "Your Package Includes"
const DEFAULT_EXCLUDES_HEADING = "Your Package Excludes"

export function buildQuoteSummaryBlock(input: QuoteSummaryInput): string {
  const pax = { adults: input.adults, children: input.children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(input.journeyStart, input.journeyEnd)
  const agentCommission = input.agentCommission ?? 0
  const hasAgentCommission = agentCommission > 0
  const discount = input.discount ?? 0
  const hasVisibleDiscount = (input.discountVisible ?? true) && discount > 0
  const showSubtotal = hasAgentCommission || hasVisibleDiscount
  // Per-person rate is always the gross rate — the discount is the agency's cut, not the
  // traveller's. Falls back to `total` when no subtotal is supplied (pre-existing callers).
  const perPersonRate = derivePerPersonRate(showSubtotal ? (input.subtotal ?? input.total) : input.total, pax)

  const metaLines = [
    ...(QUOTE_REFERENCE_ENABLED
      ? [
          `<p style="${summaryLine}"><strong>Quote number:</strong> ${escapeHtml(input.quoteNumber)}</p>`,
          `<p style="${summaryLine}"><strong>Quote date:</strong> ${formatQuoteDate(input.quoteDate)}</p>`,
        ]
      : []),
    ...(QUOTE_VALIDITY_ENABLED
      ? [`<p style="${summaryLine}"><strong>Valid until:</strong> ${formatQuoteDate(input.validUntil)}</p>`]
      : []),
    `<p style="${summaryLine}"><strong>${TRAVEL_DATES_LABEL}:</strong> ${escapeHtml(journeyRange ?? "To be confirmed")}</p>`,
  ]
  if (paxLabel) {
    metaLines.push(`<p style="${summaryLine}"><strong>Guests:</strong> ${escapeHtml(paxLabel)}</p>`)
  }

  // formatMoney emits the currency symbol itself. Never prefix a literal "R" around these
  // tokens: two migrations exist purely to undo that mistake in stored template bodies
  // (20260723130000_fix_double_rand_templates.sql and its all-rows follow-up).
  const money = (amount: number) => formatMoney(amount, input.currency)

  const pricing =
    `<div style="${pricingBox}" data-label="Total price">` +
    (perPersonRate !== null
      ? `<p style="${perPersonLine}">${escapeHtml(paxLabel)} x ${money(perPersonRate)} per person</p>`
      : "") +
    (showSubtotal
      ? `<p style="${subtotalLine}">Subtotal: ${money(input.subtotal ?? input.total)}</p>` +
        (hasAgentCommission
          ? `<p style="${agentCommissionLine}">${escapeHtml(AGENT_COMMISSION_LABEL)}: ${escapeHtml(formatAgentCommission(agentCommission, money))}</p>`
          : "") +
        (hasVisibleDiscount
          ? `<p style="${discountLine}">${escapeHtml(DISCOUNT_LABEL)}: ${escapeHtml(formatDiscount(discount, money))}</p>`
          : "") +
        `<div style="${pricingDivider}"></div>`
      : "") +
    `<p style="${totalLine}">${escapeHtml(formatTotalLabel(pax))}: ${money(input.total)} ${escapeHtml(VAT_INCLUSIVE_SUFFIX)}</p>` +
    `</div>`

  const sortedBlocks = sortItineraryBlocksChronologically(input.itineraryBlocks)

  let itinerary = ""
  const moneyNoDecimals = (amount: number) => formatMoney(amount, input.currency, { decimals: false })
  const flightCapBullet =
    input.flightCapPerPerson != null ? formatFlightCapLine(moneyNoDecimals, input.flightCapPerPerson) : null
  const itineraryLines = buildQuoteItineraryLines(sortedBlocks, flightCapBullet)
  if (itineraryLines.length > 0) {
    const heading = input.packageIncludesHeading || DEFAULT_INCLUDES_HEADING
    const items = itineraryLines
      .map((line) => {
        const date = line.dateISO
          ? formatDisplayDateLong(line.dateISO) || "Date to be confirmed"
          : "Date to be confirmed"
        const bullets = line.bullets
          .map((bullet) => {
            if (bullet.kind === "heading") {
              return `<p style="${itineraryDetailHeading}">${escapeHtml(bullet.text)}</p>`
            }
            if (bullet.kind === "warning") {
              return `<p style="${itineraryDetailWarning}">- ${escapeHtml(bullet.text)}</p>`
            }
            return `<p style="${itineraryDetail}">- ${escapeHtml(bullet.text)}</p>`
          })
          .join("")
        const description = line.description
          ? `<p style="${itineraryDescription}">${escapeHtml(line.description)}</p>`
          : ""
        return (
          `<div style="margin:0 0 10px;">` +
          `<p style="${itineraryTitle}"><strong>${escapeHtml(date)}</strong></p>` +
          `<p style="${itineraryText}">${escapeHtml(line.text)}</p>` +
          description +
          bullets +
          `</div>`
        )
      })
      .join("")
    itinerary =
      `<div data-label="${escapeHtml(heading)}">` +
      `<p style="${sectionHeading}">${escapeHtml(heading)}</p>${items}</div>`
  }

  let excludes = ""
  const exclusions = collectQuoteExclusions(sortedBlocks, input.packageExcludesDefault)
  if (exclusions.length > 0) {
    const heading = input.packageExcludesHeading || DEFAULT_EXCLUDES_HEADING
    const items = exclusions
      .map((item) => `<p style="${excludesItem}">- ${escapeHtml(item)}</p>`)
      .join("")
    excludes =
      `<div data-label="${escapeHtml(heading)}">` +
      `<p style="${sectionHeading}">${escapeHtml(heading)}</p>${items}</div>`
  }

  // The total price block deliberately renders last, directly before whatever
  // text follows the {{quoteSummaryTable}} token in the template.
  return (
    `<div style="${summaryBox}" data-label="Quote details">${metaLines.join("")}</div>` +
    itinerary +
    excludes +
    pricing +
    `<hr style="margin:24px 0 18px;border:none;border-top:1px solid ${EMAIL_COLORS.divider};" data-label="Divider line"/>`
  )
}
