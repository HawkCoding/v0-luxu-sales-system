// Token registry for system email templates.
//
// Each system template key maps to the tokens the sending code actually
// provides. The Templates page uses this to show token chips and build
// sample previews; renderTemplate flags any token in a template body that
// is not supplied at send time.

import { QUOTE_REFERENCE_ENABLED, QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { SupplierKind } from "@/lib/types"

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
  /**
   * Which products this token is worth reaching for, or omitted for the ones every template uses.
   *
   * Presentation only: every token still resolves in every template. The kinds decide how the
   * editor's chip list is grouped and which group opens first, so an author writing the Kruger
   * Shalati variant reaches for {{checkInDate}} rather than {{departureDate}} because it was the
   * only date token in front of them. A token can belong to several kinds -- {{direction}} to
   * everything that runs from an origin to a destination, {{suiteType}} to everything sold by the
   * unit.
   */
  kinds?: SupplierKind[]
}

/** Every kind a token is worth reaching for; an unscoped token belongs to all of them. */
export function tokenKinds(spec: TemplateTokenSpec): SupplierKind[] {
  return spec.kinds ?? [...ALL_SUPPLIER_KINDS]
}

/** Whether this token is one every template uses, rather than one scoped to some products. */
export function isUniversalToken(spec: TemplateTokenSpec): boolean {
  return spec.kinds === undefined
}

const ALL_SUPPLIER_KINDS: readonly SupplierKind[] = [
  "train_operator",
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "airline",
]

/** Kinds whose product runs from an origin to a destination, so a direction describes it. */
const JOURNEY_KINDS: SupplierKind[] = ["train_operator", "transfers", "vehicle_rental", "airline"]
/** Kinds that state a start date of their own. */
const DATED_KINDS: SupplierKind[] = [...JOURNEY_KINDS, "tour_operator"]
/** Kinds sold by the unit -- a suite, a tour, a cabin -- and priced per person on it. */
const UNIT_SOLD_KINDS: SupplierKind[] = ["train_operator", "tour_operator", "airline"]
/** The stay vocabulary belongs to a property and nothing else: these tokens are read off a hotel
 *  leg (see lib/templates/stay-tokens.ts) and have nothing to say about any other product. */
const STAY_KINDS: SupplierKind[] = ["hotel_property"]

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
  // Money samples must carry the "R" symbol: these tokens resolve through
  // Intl.NumberFormat ZAR currency style, so a bare-number sample makes the
  // editor preview hide a literal "R" the author typed in front of the token.
  sample: "R 12 500,00",
}
const dueDate: TemplateTokenSpec = {
  name: "dueDate",
  description: "Invoice due date",
  kind: "scalar",
  sample: "01 August 2026",
}
// Unit tokens. Whatever the product is sold by -- a suite on a train, a tour, a cabin on a flight
// -- these name it. The property equivalents are roomType / roomDescription below.
const suiteType: TemplateTokenSpec = {
  name: "suiteType",
  description: "Selected suite, tour or cabin type, without configuration options",
  kind: "scalar",
  sample: "Deluxe Suite and Luxury Suite",
  kinds: UNIT_SOLD_KINDS,
}
const suiteConfiguration: TemplateTokenSpec = {
  name: "suiteConfiguration",
  description:
    "Configuration options only (bedding, bathroom, layout). Pairs with the wrong suite once a booking has more than one — prefer suiteDescription",
  kind: "scalar",
  sample: "Twin bedded, with a shower",
  kinds: UNIT_SOLD_KINDS,
}
const suiteDescription: TemplateTokenSpec = {
  name: "suiteDescription",
  description: "Every selected suite with its own configuration, as one sentence. Includes the article",
  kind: "scalar",
  sample: "a Twin bedded Deluxe Suite with a shower and a Double bedded Luxury Suite with a full bath",
  kinds: UNIT_SOLD_KINDS,
}
// Stay tokens. On a booking carrying both a train and a hotel these name the hotel, where
// suiteType/suiteDescription above name the train — that is the whole point of the pair.
const roomType: TemplateTokenSpec = {
  name: "roomType",
  description: "Selected room type at the property, without configuration options",
  kind: "scalar",
  sample: "Bridge House Room",
  kinds: STAY_KINDS,
}
const roomDescription: TemplateTokenSpec = {
  name: "roomDescription",
  description: "Every selected room with its own configuration, as one sentence. Includes the article",
  kind: "scalar",
  sample: "a Twin bedded Bridge House Room with an en-suite bathroom",
  kinds: STAY_KINDS,
}
const supplierName: TemplateTokenSpec = {
  name: "supplierName",
  description:
    "The booking's main product, named exactly as it is spelled in Suppliers (the booking's primary supplier, falling back to the route or hotel supplier)",
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
const rateLabel: TemplateTokenSpec = {
  name: "rateLabel",
  description:
    "Client-facing name of the rate quoted on the booking's main product (rate_types.client_label, falling back to its internal name)",
  kind: "scalar",
  sample: "SADC Resident special",
  kinds: UNIT_SOLD_KINDS,
}
const trainOnlyNote: TemplateTokenSpec = {
  name: "trainOnlyNote",
  description:
    "Closing note offering to arrange hotels/transfers/flights, shown only when the quote prices the train and nothing else (suppliers.train_only_note)",
  kind: "block",
  sample:
    "<p>We have quoted you for the train only. If you would like to request any other services, we offer those as well.</p>",
  kinds: ["train_operator"],
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
  {
    name: "direction",
    description:
      "Travel route / journey name. Only products that run from an origin to a destination have one: on a stay or a tour it falls back to the length (\"3 Nights\") — prefer nights and checkInDate there",
    kind: "scalar",
    sample: "Pretoria → Cape Town",
    kinds: JOURNEY_KINDS,
  },
  { name: "routeName", description: "Route or journey name (alias of direction)", kind: "scalar", sample: "Pretoria → Cape Town", kinds: JOURNEY_KINDS },
  { name: "tripStartDate", description: "First day of the trip overall (earliest of any leg — hotel pre-nights count)", kind: "scalar", sample: "12 September 2026" },
  {
    name: "departureDate",
    description:
      "The main product's own start date (falls back to the trip start date). On a property booking this is really the check-in date — prefer checkInDate there",
    kind: "scalar",
    sample: "14 September 2026",
    kinds: DATED_KINDS,
  },
  {
    name: "departureDateShort",
    description:
      "Start date with an abbreviated month, for the subject line (falls back to the trip start date)",
    kind: "scalar",
    sample: "14 Sep 2026",
    kinds: DATED_KINDS,
  },
  { name: "tripEndDate", description: "Date the trip ended", kind: "scalar", sample: "18 September 2026" },
  {
    name: "tripTitle",
    description:
      "The itinerary's title as the salesperson named it, falling back to the route and surname (\"Pretoria → Cape Town — Smith Family\")",
    kind: "scalar",
    sample: "Pretoria → Cape Town — Smith Family",
  },
  suiteType,
  suiteConfiguration,
  suiteDescription,
  roomType,
  roomDescription,
  {
    name: "propertyName",
    description:
      "The property being stayed at, named as it is spelled in Suppliers. Equals supplierName on a standalone stay; on a rail booking with a hotel night it names the hotel, not the train",
    kind: "scalar",
    sample: "Kruger Shalati - Train on the Bridge",
    kinds: STAY_KINDS,
  },
  { name: "checkInDate", description: "Date the guest checks in to the property", kind: "scalar", sample: "05 May 2026", kinds: STAY_KINDS },
  {
    name: "checkOutDate",
    description: "Date the guest checks out — derived from the check-in date plus the night count, never stored separately",
    kind: "scalar",
    sample: "08 May 2026",
    kinds: STAY_KINDS,
  },
  { name: "nights", description: "Number of nights stayed, as a plain number", kind: "scalar", sample: "3", kinds: STAY_KINDS },
  {
    name: "mealPlan",
    description: "Meal plan / board basis booked at the property (a hotel supplier's \"route\" is its meal plan)",
    kind: "scalar",
    sample: "All-inclusive",
    kinds: STAY_KINDS,
  },
  { name: "checkInTime", description: "Property's check-in time (falls back to the app-wide default in Settings)", kind: "scalar", sample: "14h00", kinds: STAY_KINDS },
  { name: "checkOutTime", description: "Property's check-out time (falls back to the app-wide default in Settings)", kind: "scalar", sample: "11h00", kinds: STAY_KINDS },
  { name: "propertyLocation", description: "Where the property is, as captured on the supplier record", kind: "scalar", sample: "Kruger National Park", kinds: STAY_KINDS },
  {
    name: "propertyAddress",
    description: "The property's street address, for a directions or arrival paragraph",
    kind: "scalar",
    sample: "Selati Station & Bridge, Skukuza Rest Camp, Kruger National Park",
    kinds: STAY_KINDS,
  },
  { name: "guestCount", description: "Guests as one phrase, pluralised", kind: "scalar", sample: "2 Adults + 1 Child" },
  { name: "adultCount", description: "Number of adults, as a plain number", kind: "scalar", sample: "2" },
  { name: "childCount", description: "Number of children, as a plain number", kind: "scalar", sample: "1" },
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
  { name: "depositAmount", description: "Deposit amount due (formatted)", kind: "scalar", sample: "R 14 725,00" },
  { name: "depositPercentage", description: "Deposit percentage applied", kind: "scalar", sample: "25" },
  {
    name: "finalDueDate",
    description: "Date the final payment is due (2 months before departure, or \"Now\")",
    kind: "scalar",
    sample: "14 July 2026",
  },
  { name: "finalAmount", description: "Final amount due after the deposit (formatted)", kind: "scalar", sample: "R 44 175,00" },
  { name: "receivedAmount", description: "Total amount received to date (formatted)", kind: "scalar", sample: "R 14 725,00" },
  { name: "outstandingAmount", description: "Amount still outstanding (formatted)", kind: "scalar", sample: "R 44 175,00" },
  { name: "daysOverdue", description: "Days past the due date (\"—\" if not yet due)", kind: "scalar", sample: "3" },
  { name: "voucherNumber", description: "Voucher reference — the customer invoice number", kind: "scalar", sample: "180226-01" },
  guestInfo,
  bankingDetails,
  rateLabel,
  trainOnlyNote,
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
