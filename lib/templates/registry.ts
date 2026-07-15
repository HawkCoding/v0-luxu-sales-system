// Token registry for system email templates.
//
// Each system template key maps to the tokens the sending code actually
// provides. The Templates page uses this to show token chips and build
// sample previews; renderTemplate flags any token in a template body that
// is not supplied at send time.

import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"

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
  "deposit_request",
  "final_invoice",
  "payment_reminder",
  "voucher_email",
  "itinerary_email",
  "thank_you",
] as const

export type SystemTemplateKey = (typeof SYSTEM_TEMPLATE_KEYS)[number]

export function isSystemTemplateKey(key: string): key is SystemTemplateKey {
  return (SYSTEM_TEMPLATE_KEYS as readonly string[]).includes(key)
}

const customerName: TemplateTokenSpec = {
  name: "customerName",
  description: "Full name of the customer",
  kind: "scalar",
  sample: "Jane Smith",
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
  description: "Invoice number (e.g. BT-2026-0001-DEP1)",
  kind: "scalar",
  sample: "BT-2026-0001-DEP1",
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
  sample: "2026-08-01",
}
const bankingDetails: TemplateTokenSpec = {
  name: "bankingDetails",
  description: "Company banking details block (configured in Settings)",
  kind: "block",
  sample:
    "<p><strong>Banking details</strong><br/>Bank: Example Bank<br/>Account: Luxus Travel &amp; Tours<br/>Account no: 000000000</p>",
}

export const TEMPLATE_TOKENS: Record<SystemTemplateKey, TemplateTokenSpec[]> = {
  quote_email: [
    customerName,
    jobNumber,
    { name: "quoteNumber", description: "Quote number (e.g. BT-2026-0001-Q1)", kind: "scalar", sample: "BT-2026-0001-Q1" },
    { name: "quoteDate", description: "Date the quote was issued", kind: "scalar", sample: "2026-07-12" },
    { name: "direction", description: "Travel route / journey name", kind: "scalar", sample: "Pretoria → Cape Town" },
    { name: "departureDate", description: "Departure date of the trip", kind: "scalar", sample: "2026-09-14" },
    {
      name: "departureDateShort",
      description: "Departure date, short month format (used in the subject line)",
      kind: "scalar",
      sample: "14 Sep 2026",
    },
    {
      name: "supplierName",
      description: "Primary supplier for the booking (route supplier, falling back to hotel supplier)",
      kind: "scalar",
      sample: "Bluetrain",
    },
    { name: "clientSurname", description: "Customer's surname", kind: "scalar", sample: "Smith" },
    // Hidden while quote validity is disabled — still substituted at send time
    // so a customised template containing the token keeps working.
    ...(QUOTE_VALIDITY_ENABLED
      ? [{ name: "validityDate", description: "Date the quote expires", kind: "scalar", sample: "2026-07-26" } satisfies TemplateTokenSpec]
      : []),
    { name: "total", description: "Total quoted price (formatted)", kind: "scalar", sample: "R 58 900,00" },
    {
      name: "quoteSummaryTable",
      description:
        "Quote meta (journey dates, guests), package itinerary and exclusions, then the VAT-inclusive total (system-generated)",
      kind: "block",
      sample:
        '<div style="margin:18px 0;padding:14px 16px;background:#fbf8f3;border:1px solid #e8dfd2;" data-label="Quote details"><p style="margin:0;"><strong>Quote number:</strong> BT-2026-0001-Q1</p><p style="margin:6px 0 0;"><strong>Journey:</strong> 18 – 22 July 2026</p><p style="margin:6px 0 0;"><strong>Guests:</strong> 2 Adults</p></div><div style="margin:18px 0;padding:14px 16px;background:#f4efe6;border:1px solid #d8cdbc;" data-label="Total price"><p style="margin:0;font-weight:700;">TOTAL for 2 Adults: R 86 300,00 (VAT inclusive)</p></div>',
    },
  ],
  follow_up: [
    customerName,
    jobNumber,
    {
      name: "lastSentDate",
      description: "Date the quote was last sent to the customer",
      kind: "scalar",
      sample: "2026-07-05",
    },
  ],
  deposit_request: [
    customerName,
    jobNumber,
    invoiceNumber,
    {
      name: "depositAmount",
      description: "Deposit amount due (formatted)",
      kind: "scalar",
      sample: "14 725.00",
    },
    {
      name: "depositPercentage",
      description: "Deposit percentage applied",
      kind: "scalar",
      sample: "25",
    },
    dueDate,
    bankingDetails,
  ],
  final_invoice: [customerName, jobNumber, invoiceNumber, amountDue, dueDate, bankingDetails],
  payment_reminder: [
    customerName,
    jobNumber,
    invoiceNumber,
    amountDue,
    dueDate,
    {
      name: "daysOverdue",
      description: "Days past the due date (blank if not yet due)",
      kind: "scalar",
      sample: "3",
    },
    bankingDetails,
  ],
  voucher_email: [
    customerName,
    jobNumber,
    { name: "direction", description: "Travel route / journey name", kind: "scalar", sample: "Pretoria → Cape Town" },
    { name: "voucherNumber", description: "Voucher number", kind: "scalar", sample: "180226-01" },
    { name: "departureDate", description: "Departure date of the trip", kind: "scalar", sample: "14 September 2026" },
    consultantName,
  ],
  itinerary_email: [
    customerName,
    jobNumber,
    { name: "tripTitle", description: "Itinerary trip title", kind: "scalar", sample: "Cape Town Rail Adventure" },
    { name: "departureDate", description: "Departure date of the trip", kind: "scalar", sample: "2026-09-14" },
  ],
  thank_you: [
    customerName,
    jobNumber,
    { name: "routeName", description: "Route or journey name", kind: "scalar", sample: "The Blue Train" },
    { name: "tripEndDate", description: "Date the trip ended", kind: "scalar", sample: "2026-09-18" },
    consultantName,
  ],
}

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
