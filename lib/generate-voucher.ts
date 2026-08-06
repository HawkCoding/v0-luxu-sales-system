import type { Enquiry, VoucherTemplate } from "./types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "./types"
import { tintWithWhite } from "./voucher/pdf/design-tokens"
import { voucherProviderContactLine, voucherRowsForBlock } from "./voucher/service-block-rows"

export type VoucherServiceType =
  | "train"
  | "hotel"
  | "transfer"
  | "tour"
  | "airline"
  | "additional_service"

export interface VoucherServiceBlockContact {
  name?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  location?: string | null
  /** Client-facing supplier blurb, printed under the provider name — mirrors
   * `VoucherData.supplierDescription` on the single-provider fallback layout. */
  description?: string | null
  streetAddress?: string | null
  emergencyPhone?: string | null
}

/** Per-block guest breakdown, summed from the leg's captured suite/room units. */
export interface VoucherServiceBlockGuestBreakdown {
  adults: number
  children: number
  infants: number
}

export interface VoucherServiceBlockData {
  route?: string | null
  /** The station a train leg actually arrives at — the route's destination, or its origin when
   * `route_reversed` swaps the booked direction. Never derive this from the supplier's own
   * static `location` field, which has no notion of leg direction. */
  arrivalStation?: string | null
  departureDate?: string | null
  arrivalDate?: string | null
  /** HH:MM the service starts — train departure, hotel check-in, transfer pickup. */
  startTime?: string | null
  /** HH:MM the service ends — train arrival, hotel check-out. */
  endTime?: string | null
  suiteType?: string | null
  numberOfSuites?: number | null
  roomType?: string | null
  nights?: number | null
  mealPlan?: string | null
  vehicleType?: string | null
  pickup?: string | null
  dropoff?: string | null
  itinerary?: string | null
  cabin?: string | null
  flightNumber?: string | null
  durationDays?: number | null
  notes?: string | null
  /** Client-facing bullets for this supplier, e.g. "High Tea", "24-hour Butler service". */
  inclusions?: string[]
  /** Client-facing exclusions for this supplier; pooled into the quote's excludes section. */
  exclusions?: string[]
  /** Adults/children/infants captured for this specific leg's suite/room units — train & hotel
   * only; transfers use `passengerCount` since a transport request only captures a total. */
  guestBreakdown?: VoucherServiceBlockGuestBreakdown | null
  /** Total passengers on a transfer trip, from the captured transport request. */
  passengerCount?: number | null
  /** "1st seating meals; Nonsmoking" — composed from the booking's reservation-details form,
   * repeated on every train/hotel block since the preference applies to the whole party. */
  requestsLine?: string | null
  /** The booking's occasion (e.g. "Birthday Celebration"), repeated per train/hotel block. */
  occasion?: string | null
  /** Excursion lines for a train leg, e.g. "Kimberley **Weather & Time Permitted" — the leg's own
   * override when set, else the route's `default_excursions`. */
  excursions?: string[]
  /** A one-off operational caveat printed under this leg, e.g. "Check in IRENE COUNTRY LODGE 2h
   * prior to departure" or "The driver will meet you at the lounge with a whiteboard". */
  footnote?: string | null
  /** Flight-only: IATA/ICAO codes for the departure/arrival airports. */
  departureAirportCode?: string | null
  arrivalAirportCode?: string | null
  handLuggageKg?: number | null
  checkedLuggageKg?: number | null
  priorityBoarding?: boolean | null
  /** Flight-only: traveller names on the booking, printed "1.1 Name  1.2 Name" the way the legacy
   * voucher tabled FlySafair passengers. */
  passengerNames?: string[]
}

export interface VoucherServiceBlock {
  serviceType: VoucherServiceType
  title: string
  supplierId?: string | null
  supplierReference?: string | null
  /** Named contact next to the reference, e.g. "38562 – Carla" — from the leg's own capture,
   * falling back to the supplier's default_contact_name. */
  supplierContactName?: string | null
  contactDetails: VoucherServiceBlockContact
  serviceData: VoucherServiceBlockData
  displayOrder: number
}

export interface VoucherData {
  voucherNumber: string
  guestNames: string
  consultantName: string
  supplierName: string
  supplierDescription?: string | null
  route: string
  departure: string
  arrival: string
  suiteType: string
  numberOfGuests: number
  specialRequests: string
  customerEmail: string
  customerPhone: string
  enquiry: Enquiry
  consultant: string
  serviceBlocks?: VoucherServiceBlock[]
}

const SERVICE_TYPE_LABELS: Record<VoucherServiceType, string> = {
  train: "Train Service",
  hotel: "Hotel Stay",
  transfer: "Transfer",
  tour: "Tour",
  airline: "Flight",
  additional_service: "Additional Service",
}

export function voucherServiceTypeLabel(type: VoucherServiceType): string {
  return SERVICE_TYPE_LABELS[type]
}

export function sortedVoucherServiceBlocks(blocks: VoucherServiceBlock[]): VoucherServiceBlock[] {
  return [...blocks].sort((a, b) => a.displayOrder - b.displayOrder)
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })
}

// Mirrors resolveVoucherFontPairing in lib/voucher/pdf/fonts.ts, which is
// server-only; the template option picks the body leaning of the fixed pairing.
function previewBodyFontStack(fontFamily: string): string {
  const sansBody = fontFamily === "Arial, sans-serif" || fontFamily === "'Montserrat', Arial, sans-serif"
  return sansBody ? "'Montserrat', Arial, sans-serif" : "'Playfair Display', Georgia, serif"
}

function buildHeaderHtml(t: VoucherTemplate): string {
  const hasLogo = Boolean(t.logo_url)
  const hasBanner = Boolean(t.banner_url)

  if (hasLogo && hasBanner) {
    return `
    <div class="header header-split">
      <div class="header-logo-side">
        <img src="${escapeHtml(t.logo_url)}" alt="Logo" class="header-logo" />
      </div>
      <div class="header-banner-side">
        <img src="${escapeHtml(t.banner_url)}" alt="Header" class="header-banner" />
        <div class="header-text-overlay">
          <div class="product-line">${escapeHtml(t.product_line)}</div>
          <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
        </div>
      </div>
    </div>`
  }

  if (hasLogo) {
    return `
    <div class="header header-logo-only">
      <img src="${escapeHtml(t.logo_url)}" alt="Logo" class="header-logo-center" />
      <div class="product-line">${escapeHtml(t.product_line)}</div>
      <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
    </div>`
  }

  if (hasBanner) {
    return `
    <div class="header header-banner-only">
      <img src="${escapeHtml(t.banner_url)}" alt="Header" class="header-banner-full" />
      <div class="header-text-below">
        <div class="product-line">${escapeHtml(t.product_line)}</div>
        <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
      </div>
    </div>`
  }

  return `
  <div class="header header-text-only">
    <div class="product-line">${escapeHtml(t.product_line)}</div>
    <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
  </div>`
}

function infoRow(label: string, value: string | number, opts: { shaded?: boolean; dotted?: boolean } = {}): string {
  const classes = ["info-row", opts.shaded ? "info-row-shaded" : "", opts.dotted ? "info-row-dotted" : ""]
    .filter(Boolean)
    .join(" ")
  return `
      <div class="${classes}">
        <div class="info-label">${escapeHtml(label)}</div>
        <div class="info-value">${escapeHtml(value)}</div>
      </div>`
}

function cellRow(cells: Array<{ label: string; value: string | number }>, opts: { dotted?: boolean } = {}): string {
  const classes = ["cell-row", opts.dotted ? "info-row-dotted" : ""].filter(Boolean).join(" ")
  const cellsHtml = cells
    .map(
      (cell) => `
        <div class="cell">
          <div class="cell-label">${escapeHtml(cell.label)}</div>
          <div class="cell-value">${escapeHtml(cell.value)}</div>
        </div>`,
    )
    .join("")
  return `
      <div class="${classes}">${cellsHtml}
      </div>`
}

function buildGuestInfoSection(data: VoucherData): string {
  const childText = data.enquiry.noOfChildren
    ? `, ${data.enquiry.noOfChildren} ${data.enquiry.noOfChildren === 1 ? "child" : "children"}`
    : ""

  const rows = [
    infoRow("Guest Names", data.guestNames, { shaded: true }),
    infoRow("Number of Guests", `${data.numberOfGuests} (${data.enquiry.noOfAdults} adults${childText})`),
    infoRow("Contact Email", data.customerEmail, { shaded: true }),
    infoRow("Contact Phone", data.customerPhone),
    infoRow(
      "Consultant",
      data.consultant && data.consultantName ? `${data.consultant} – ${data.consultantName}` : "",
      { shaded: true },
    ),
  ]
  if (data.specialRequests) rows.push(infoRow("Special Requests", data.specialRequests))

  return `
  <div class="section">
    <div class="section-title">Guest Information</div>
${rows.join("\n")}
  </div>`
}

function buildServiceBlockBodyRows(block: VoucherServiceBlock): string {
  return voucherRowsForBlock(block)
    .map((row) => (row.cells ? cellRow(row.cells, { dotted: true }) : infoRow(row.label, row.value ?? "", { dotted: true })))
    .join("\n")
}

function buildServiceBlocksSection(data: VoucherData): string {
  const blocks = data.serviceBlocks ?? []
  if (blocks.length === 0) return buildServiceProviderSection(data)

  const blocksHtml = sortedVoucherServiceBlocks(blocks)
    .map((block) => {
      const contactLine = voucherProviderContactLine(block.contactDetails)
      const heading = block.contactDetails.name || block.title || voucherServiceTypeLabel(block.serviceType)
      const footnote = block.serviceData.footnote
      return `
  <div class="section">
    <div class="provider-box">
      <div class="provider-name">${escapeHtml(heading)}</div>
${contactLine ? `      <div class="provider-contact">${escapeHtml(contactLine)}</div>` : ""}
${buildServiceBlockBodyRows(block)}
${footnote ? `      <div class="provider-footnote">${escapeHtml(footnote)}</div>` : ""}
    </div>
  </div>`
    })
    .join("\n")

  return `${blocksHtml}
  <div class="end-of-services">End of Services</div>`
}

function buildServiceProviderSection(data: VoucherData): string {
  const descriptionHtml = data.supplierDescription
    ? `<div class="provider-description">${escapeHtml(data.supplierDescription)}</div>`
    : ""

  const rows = [
    infoRow("Your Reference", data.voucherNumber, { dotted: true }),
    infoRow("Route", data.route, { dotted: true }),
    infoRow("Departure Date", data.departure, { dotted: true }),
    infoRow("Arrival Date", data.arrival || "TBC", { dotted: true }),
    infoRow("Suite Type", data.suiteType, { dotted: true }),
    infoRow("Number of Suites", data.enquiry.noOfSuites, { dotted: true }),
    infoRow("Meal Basis", "Full Board (All meals included)", { dotted: true }),
  ]

  return `
  <div class="section">
    <div class="section-title">Service Provider</div>
    <div class="provider-box">
      <div class="provider-name">${escapeHtml(data.supplierName)}</div>
${descriptionHtml}
${rows.join("\n")}
    </div>
  </div>
  <div class="end-of-services">End of Services</div>`
}

function buildFooterSection(t: VoucherTemplate): string {
  const contact = [t.footer_phone, t.footer_email].filter(Boolean)
  return `
  <div class="section footer-section">
    <div class="footer-rule"></div>
${t.footer_company ? `    <div class="footer-company">${escapeHtml(t.footer_company)}</div>` : ""}
${contact.length > 0 ? `    <div class="footer-contact">${contact.map((part) => escapeHtml(part)).join(" &middot; ")}</div>` : ""}
  </div>`
}

export function generateVoucherHTML(data: VoucherData, template?: VoucherTemplate): string {
  const t: VoucherTemplate = template ?? VOUCHER_TEMPLATE_DEFAULTS

  const sectionOrder = t.section_order.length > 0
    ? t.section_order
    : (["guest_info", "service_provider", "footer"] as const)

  const hidden = new Set(t.hidden_sections)

  const sectionHtml = sectionOrder
    .filter((s) => !hidden.has(s))
    .map((s) => {
      if (s === "guest_info") return buildGuestInfoSection(data)
      if (s === "service_provider") return buildServiceBlocksSection(data)
      if (s === "footer") return buildFooterSection(t)
      return ""
    })
    .join("\n")

  // Preview mirrors lib/voucher/pdf/styles.ts pt-for-pt at the "compact" density (the only
  // density the voucher ever renders at); the PDF is the source of truth — update both when the
  // design changes. See lib/voucher/pdf/density.ts for the numbers being mirrored.
  const rule = tintWithWhite(t.accent_colour, 0.45)
  const ruleFaint = tintWithWhite(t.section_bg, 0.3)
  const frameOuter = tintWithWhite(t.accent_colour, 0.9)
  const frameInner = tintWithWhite(t.accent_colour, 0.35)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Travel Voucher – ${escapeHtml(data.voucherNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      font-family: ${previewBodyFontStack(t.font_family)};
      font-size: 9pt;
      line-height: 1.4;
      color: #2B2B2B;
      margin: 0;
      padding: 34pt 40pt 40pt;
      position: relative;
    }
    .frame-outer, .frame-inner { position: absolute; pointer-events: none; }
    .frame-outer { inset: 14pt; border: 0.75pt solid ${frameOuter}; }
    .frame-inner { inset: 17pt; border: 0.5pt solid ${frameInner}; }

    /* Header variants */
    .header { margin-bottom: 10pt; }
    .header-split { display: flex; align-items: stretch; border-bottom: 0.5pt solid ${rule}; padding-bottom: 12pt; }
    .header-logo-side { width: 90px; min-width: 90px; display: flex; align-items: center; justify-content: center; padding: 8px; background: #fff; }
    .header-logo { max-width: 76px; max-height: 60px; object-fit: contain; }
    .header-banner-side { flex: 1; position: relative; overflow: hidden; }
    .header-banner { width: 100%; height: 72px; object-fit: cover; display: block; }
    .header-text-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.35); padding: 8px 16px; }
    .header-text-overlay .product-line { color: #fff; margin: 0; }
    .header-text-overlay .header-subtitle { color: rgba(255,255,255,0.85); margin: 2pt 0 0; }

    .header-logo-only { text-align: center; padding-bottom: 12pt; border-bottom: 0.5pt solid ${rule}; }
    .header-logo-center { max-height: 52px; object-fit: contain; margin-bottom: 6px; }

    .header-banner-only { border-bottom: 0.5pt solid ${rule}; padding-bottom: 8pt; }
    .header-banner-only .header-banner-full { width: 100%; max-height: 80px; object-fit: cover; display: block; }
    .header-text-below { text-align: center; padding: 8pt 0; }

    .header-text-only { text-align: center; padding-bottom: 12pt; border-bottom: 0.5pt solid ${rule}; }

    .product-line {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 600;
      color: ${t.accent_colour};
      letter-spacing: 2pt;
      text-transform: uppercase;
      margin-top: 8pt;
    }
    .header-subtitle {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 9pt;
      color: #6B6B6B;
      font-style: italic;
      margin-top: 4pt;
    }

    /* Masthead row */
    .voucher-number-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin: 10pt 0 6pt;
    }
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 2pt;
      text-transform: uppercase;
      color: ${t.accent_colour};
      margin: 0;
    }
    .voucher-stub {
      border: 0.75pt solid ${t.accent_colour};
      border-left-style: dashed;
      padding: 3pt 12pt;
      text-align: center;
    }
    .voucher-stub-label {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 1.5pt;
      text-transform: uppercase;
      color: #6B6B6B;
    }
    .voucher-stub-number {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 11pt;
      font-weight: 700;
      color: ${t.accent_colour};
      margin-top: 2pt;
    }

    .guidance {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 7.5pt;
      font-style: italic;
      line-height: 1.3;
      color: #6B6B6B;
      margin: 4pt 0 10pt;
      padding-right: 48pt;
    }

    .section { margin-bottom: 10pt; }
    .section-title {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 1.2pt;
      text-transform: uppercase;
      color: ${t.section_bg};
      border-bottom: 0.5pt solid ${ruleFaint};
      padding-bottom: 3pt;
      margin-bottom: 5pt;
    }
    .info-row {
      display: flex;
      gap: 12pt;
      padding: 1.5pt 0;
    }
    /* Legacy tables ruled every provider-box row with a dotted line; Guest Information bands
       alternating rows instead (info-row-shaded) — same distinction the legacy voucher made. */
    .info-row-dotted { border-bottom: 0.5pt dotted ${ruleFaint}; padding-bottom: 2.5pt; }
    .info-row-shaded { background: #F4F4F4; margin: 0 -5pt; padding: 1.5pt 5pt; }
    .info-label {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 0.4pt;
      text-transform: uppercase;
      text-align: right;
      color: #6B6B6B;
      padding-top: 1pt;
      width: 108pt;
      min-width: 108pt;
      flex-shrink: 0;
    }
    .info-value { color: #2B2B2B; font-size: 9pt; flex: 1; }

    .cell-row { display: flex; gap: 16pt; padding: 1.5pt 0; }
    .cell-label {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 6.5pt;
      font-weight: 600;
      letter-spacing: 1pt;
      text-transform: uppercase;
      color: #6B6B6B;
      margin-bottom: 2pt;
    }
    .cell-value { color: #2B2B2B; font-size: 9pt; }

    .provider-box {
      border: 0.75pt solid ${ruleFaint};
      padding: 7pt 9pt;
    }
    .provider-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 11pt;
      font-weight: 700;
      color: ${t.accent_colour};
      margin-bottom: 1.5pt;
    }
    .provider-contact {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 7pt;
      color: #6B6B6B;
      margin-bottom: 5pt;
    }
    .provider-description {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 9.5pt;
      color: #6B6B6B;
      font-style: italic;
      margin-bottom: 12pt;
    }
    .provider-footnote {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 7.5pt;
      color: #6B6B6B;
      font-style: italic;
      margin-top: 3pt;
    }

    .end-of-services {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 8pt;
      letter-spacing: 1.5pt;
      text-transform: uppercase;
      color: #9A9A9A;
      text-align: center;
      margin: 2pt 0 8pt;
    }

    .footer-section { margin-top: 6pt; text-align: center; }
    .footer-rule { width: 64pt; border-top: 0.5pt solid ${rule}; margin: 0 auto 8pt; }
    .footer-company {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 600;
      letter-spacing: 1.5pt;
      text-transform: uppercase;
      color: ${t.accent_colour};
    }
    .footer-contact {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 7.5pt;
      color: #6B6B6B;
      margin-top: 4pt;
    }

    .page-number {
      font-family: 'Montserrat', Arial, sans-serif;
      text-align: center;
      font-size: 7.5pt;
      color: #9A9A9A;
      margin-top: 12pt;
    }
  </style>
</head>
<body>
  <div class="frame-outer"></div>
  <div class="frame-inner"></div>
${buildHeaderHtml(t)}

  <div class="voucher-number-row">
    <h1>TRAVEL VOUCHERS</h1>
    <div class="voucher-stub">
      <div class="voucher-stub-label">Voucher no.</div>
      <div class="voucher-stub-number">${escapeHtml(data.voucherNumber)}</div>
    </div>
  </div>

${t.guidance_text ? `<div class="guidance">${escapeHtml(t.guidance_text)}</div>` : ""}

${sectionHtml}

  <div class="page-number">Page 1 of 1</div>
</body>
</html>`
}

export function downloadVoucherPDF(html: string, _filename: string) {
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, "_blank")
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  }
}
