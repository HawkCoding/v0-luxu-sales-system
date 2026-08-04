// Token registry for system email templates.
//
// Each system template key maps to the tokens the sending code actually
// provides. The Templates page uses this to show token chips and build
// sample previews; renderTemplate flags any token in a template body that
// is not supplied at send time.

import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"

export interface TemplateTokenSpec {
  /** Token name as written in the template, without braces (e.g. "customerName"). */
  name: string
  description: string
  /**
   * "scalar" values are HTML-escaped on substitution; "block" values are
   * pre-built HTML fragments (e.g. a banking-details table) inserted raw.
   */
  kind: "scalar" | "block"
  /** Sample value used for template previews. */
  sample: string
}

export const SYSTEM_TEMPLATE_KEYS = [
  "quote_email",
  "follow_up",
  "reservation_received",
  "deposit_request",
  "full_payment_request",
  "payment_received",
  "final_invoice",
  "payment_reminder",
  "voucher_email",
  "thank_you",
] as const

export type SystemTemplateKey = (typeof SYSTEM_TEMPLATE_KEYS)[number]

export function isSystemTemplateKey(key: string): key is SystemTemplateKey {
  return (SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(key)
}

const customerName: TemplateTokenSpec = {
  name: "customerName",
  description: "How the customer is addressed — title and surname",
  kind: "scalar",
  sample: "Mr Smith",
}
const jobNumber: TemplateTokenSpec = {
  name: "jobNumber",
  description: "Job/booking reference number",
  kind: "scalar",
  sample: "BT-2026-0001",
}
const consultantName: TemplateTokenSpec = {
  name: "consultantName",
  description: "Name of the assigned consultant",
  kind: "scalar",
  sample: "Carla de Jager",
}
const invoiceNumber: TemplateTokenSpec = {
  name: "invoiceNumber",
  description: "Customer-facing invoice number entered by the salesperson (falls back to the internal number)",
  kind: "scalar",
  sample: "INV-2026-0001",
}
const amountDue: TemplateTokenSpec = {
  name: "amountDue",
  description: "Amount due on the invoice (formatted)",
  kind: "scalar",
  sample: "12 500.00",
}
const dueDate: TemplateTokenSpec = {
  name: "dueDate",
  description: "Invoice due date",
  kind: "scalar",
  sample: "01 August 2026",
}
const suiteType: TemplateTokenSpec = {
  name: "suiteType",
  description: "Selected suite type, without configuration options",
  kind: "scalar",
  sample: "Deluxe Suite and Luxury Suite",
}
const suiteConfiguration: TemplateTokenSpec = {
  name: "suiteConfiguration",
  description:
    "Configuration options only (bedding, bathroom, layout). Pairs with the wrong suite once a booking has more than one — prefer suiteDescription",
  kind: "scalar",
  sample: "Twin bedded, with a shower",
}
const suiteDescription: TemplateTokenSpec = {
  name: "suiteDescription",
  description: "Every selected suite with its own configuration, as one sentence. Includes the article",
  kind: "scalar",
  sample: "a Twin bedded Deluxe Suite with a shower and a Double bedded Luxury Suite with a full bath",
}
const supplierName: TemplateTokenSpec = {
  name: "supplierName",
  description:
    "Primary supplier for the booking, named exactly as it is spelled in Suppliers (quoted train leg, falling back to the route or hotel supplier)",
  kind: "scalar",
  sample: "The Blue Train",
}
const bankingDetails: TemplateTokenSpec = {
  name: "bankingDetails",
  description: "Company banking details block (configured in Settings)",
  kind: "block",
  sample:
    "<p><strong>Banking details</strong><br/>Bank: Example Bank<br/>Account: Luxus Travel &amp; Tours<br/>Account no: 000000000</p>",
}
const guestInfo: TemplateTokenSpec = {
  name: "guestInfo",
  description: "Each named guest with their ID/passport number, for the customer to confirm (falls back to guest counts if names aren't captured yet)",
  kind: "block",
  sample:
    "<p>Mr John Smith ID: 8001015800083</p><p>Mrs Jane Smith ID: 8203125800084</p>",
}

// Every token below is resolvable in every template type (lib/templates/resolve-shared-tokens.ts
// fills anything the current pipeline stage can't supply yet with "—"), so all types share one
// list rather than each hand-curating a subset.
const ALL_TOKENS: TemplateTokenSpec[] = [
  customerName,
  jobNumber,
  supplierName,
  { name: "clientSurname", description: "Customer's surname", kind: "scalar", sample: "Smith" },
  consultantName,
  { name: "direction", description: "Travel route / journey name", kind: "scalar", sample: "Pretoria → Cape Town" },
  { name: "routeName", description: "Route or journey name (alias of direction)", kind: "scalar", sample: "Pretoria → Cape Town" },
  { name: "departureDate", description: "Departure date of the trip", kind: "scalar", sample: "14 September 2026" },
  {
    name: "departureDateShort",
    description: "Departure date as used in the subject line",
    kind: "scalar",
    sample: "14 September 2026",
  },
  { name: "tripEndDate", description: "Date the trip ended", kind: "scalar", sample: "18 September 2026" },
  { name: "tripTitle", description: "Itinerary trip title", kind: "scalar", sample: "Cape Town Rail Adventure" },
  suiteType,
  suiteConfiguration,
  suiteDescription,
  // Hidden while the quote reference is disabled — still substituted at send
  // time so a customised template containing either token keeps working.
  ...(QUOTE_REFERENCE_ENABLED
    ? [
        { name: "quoteNumber", description: "Quote number (e.g. LTT-2026-0001-Q1)", kind: "scalar", sample: "LTT-2026-0001-Q1" } satisfies TemplateTokenSpec,
        { name: "quoteDate", description: "Date the quote was issued", kind: "scalar", sample: "12 July 2026" } satisfies TemplateTokenSpec,
      ]
    : []),
  // Hidden while quote validity is disabled — still substituted at send time
  // so a customised template containing the token keeps working.
  ...(QUOTE_VALIDITY_ENABLED
    ? [{ name: "validityDate", description: "Date the quote expires", kind: "scalar", sample: "26 July 2026" } satisfies TemplateTokenSpec]
    : []),
  { name: "total", description: "Total quoted price (formatted)", kind: "scalar", sample: "R 58 900,00" },
  {
    name: "quoteSummaryTable",
    description:
      "Quote meta (journey dates, guests), package itinerary and exclusions, then the VAT-inclusive total (system-generated)",
    kind: "block",
    sample:
      '<div style="margin:18px 0;padding:14px 16px;background:#fbf8f3;border:1px solid #e8dfd2;" data-label="Quote details"><p style="margin:0;"><strong>Quote number:</strong> BT-2026-0001-Q1</p><p style="margin:6px 0 0;"><strong>Journey:</strong> 18 – 22 July 2026</p><p style="margin:6px 0 0;"><strong>Guests:</strong> 2 Adults</p></div><div style="margin:18px 0;padding:14px 16px;background:#f4efe6;border:1px solid #d8cdbc;" data-label="Total price"><p style="margin:0;font-weight:700;">TOTAL for 2 Adults: R 86 300,00 (incl.VAT)</p></div>',
  },
  { name: "lastSentDate", description: "Date the quote was last sent to the customer", kind: "scalar", sample: "05 July 2026" },
  invoiceNumber,
  amountDue,
  dueDate,
  { name: "depositAmount", description: "Deposit amount due (formatted)", kind: "scalar", sample: "14 725.00" },
  { name: "depositPercentage", description: "Deposit percentage applied", kind: "scalar", sample: "25" },
  {
    name: "finalDueDate",
    description: "Date the final payment is due (60 days before departure, or \"Now\")",
    kind: "scalar",
    sample: "14 July 2026",
  },
  { name: "finalAmount", description: "Final amount due after the deposit (formatted)", kind: "scalar", sample: "44 175.00" },
  { name: "receivedAmount", description: "Total amount received to date (formatted)", kind: "scalar", sample: "14 725.00" },
  { name: "outstandingAmount", description: "Amount still outstanding (formatted)", kind: "scalar", sample: "44 175.00" },
  { name: "daysOverdue", description: "Days past the due date (\"—\" if not yet due)", kind: "scalar", sample: "3" },
  { name: "voucherNumber", description: "Voucher number", kind: "scalar", sample: "180226-01" },
  guestInfo,
  bankingDetails,
]

export const TEMPLATE_TOKENS: Record<SystemTemplateKey, TemplateTokenSpec[]> = Object.fromEntries(
  SYSTEM_TEMPLATE_KEYS.map((key) => [key, ALL_TOKENS]),
) as Record<SystemTemplateKey, TemplateTokenSpec[]>

export function getTokenSpecs(key: string): TemplateTokenSpec[] {
  return isSystemTemplateKey(key) ? TEMPLATE_TOKENS[key] : []
}

/** Sample token values for previewing a template, split by kind. */
export function getSampleTokens(key: string): {
  tokens: Record<string, string>
  blocks: Record<string, string>
} {
  const tokens: Record<string, string> = {}
  const blocks: Record<string, string> = {}
  for (const spec of getTokenSpecs(key)) {
    if (spec.kind === "block") blocks[spec.name] = spec.sample
    else tokens[spec.name] = spec.sample
  }
  return { tokens, blocks }
}
