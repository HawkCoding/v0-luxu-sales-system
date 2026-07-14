import type { Enquiry, ConsultantAbbreviation, VoucherTemplate } from "./types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "./types"
import { formatDisplayDateLong } from "./date-format"
import { tintWithWhite } from "./voucher/pdf/design-tokens"

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
}

export interface VoucherServiceBlockData {
  route?: string | null
  departureDate?: string | null
  arrivalDate?: string | null
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
}

export interface VoucherServiceBlock {
  serviceType: VoucherServiceType
  title: string
  supplierReference?: string | null
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
  consultant: ConsultantAbbreviation
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

function buildGuestInfoSection(data: VoucherData): string {
  const specialRequestsHtml = data.specialRequests
    ? `

      <div class="info-label">Special Requests</div>
      <div class="info-value">${escapeHtml(data.specialRequests)}</div>`
    : ""

  return `
  <div class="section">
    <div class="section-title">Guest Information</div>
    <div class="info-grid">
      <div class="info-label">Guest Names</div>
      <div class="info-value">${escapeHtml(data.guestNames)}</div>

      <div class="info-label">Number of Guests</div>
      <div class="info-value">${escapeHtml(data.numberOfGuests)} (${escapeHtml(data.enquiry.noOfAdults)} adults${data.enquiry.noOfChildren ? `, ${escapeHtml(data.enquiry.noOfChildren)} children` : ""})</div>

      <div class="info-label">Contact Email</div>
      <div class="info-value">${escapeHtml(data.customerEmail)}</div>

      <div class="info-label">Contact Phone</div>
      <div class="info-value">${escapeHtml(data.customerPhone)}</div>

      <div class="info-label">Consultant</div>
      <div class="info-value">${escapeHtml(data.consultant)} – ${escapeHtml(data.consultantName)}</div>
${specialRequestsHtml}
    </div>
  </div>`
}

// Only ISO date-ish values are reformatted; anything else is already display text
// and must be passed through untouched (re-parsing "04/07/2026" would flip d/m).
function formatServiceDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return formatDisplayDateLong(value) || value
}

function buildServiceBlockBodyRows(block: VoucherServiceBlock): string {
  const rows: Array<[string, string | number | null | undefined]> = []
  const d = block.serviceData
  const departureDate = formatServiceDate(d.departureDate)
  const arrivalDate = formatServiceDate(d.arrivalDate)
  rows.push(["Your Reference", block.supplierReference ?? "—"])

  if (block.serviceType === "train") {
    rows.push(["Route", d.route ?? "—"])
    rows.push(["Departure Date", departureDate ?? "—"])
    rows.push(["Arrival Date", arrivalDate ?? "TBC"])
    rows.push(["Suite Type", d.suiteType ?? "—"])
    if (d.numberOfSuites != null) rows.push(["Number of Suites", d.numberOfSuites])
    if (d.mealPlan) rows.push(["Meal Basis", d.mealPlan])
  } else if (block.serviceType === "hotel") {
    if (d.roomType) rows.push(["Room Type", d.roomType])
    if (d.nights != null) rows.push(["Nights", d.nights])
    if (d.mealPlan) rows.push(["Meal Plan", d.mealPlan])
    if (departureDate) rows.push(["Check-In", departureDate])
    if (arrivalDate) rows.push(["Check-Out", arrivalDate])
  } else if (block.serviceType === "transfer") {
    if (d.vehicleType) rows.push(["Vehicle", d.vehicleType])
    if (d.pickup) rows.push(["Pickup", d.pickup])
    if (d.dropoff) rows.push(["Drop-off", d.dropoff])
    if (departureDate) rows.push(["Date", departureDate])
  } else if (block.serviceType === "tour") {
    if (d.itinerary) rows.push(["Itinerary", d.itinerary])
    if (departureDate) rows.push(["Start Date", departureDate])
    if (arrivalDate) rows.push(["End Date", arrivalDate])
  } else if (block.serviceType === "airline") {
    if (d.route) rows.push(["Route", d.route])
    if (d.cabin) rows.push(["Cabin", d.cabin])
    if (d.flightNumber) rows.push(["Flight", d.flightNumber])
    if (departureDate) rows.push(["Departure", departureDate])
    if (arrivalDate) rows.push(["Arrival", arrivalDate])
  }

  if (d.notes) rows.push(["Notes", d.notes])

  const contactParts: string[] = []
  if (block.contactDetails.phone) contactParts.push(`Phone: ${block.contactDetails.phone}`)
  if (block.contactDetails.email) contactParts.push(`Email: ${block.contactDetails.email}`)
  if (block.contactDetails.location) contactParts.push(`Location: ${block.contactDetails.location}`)
  if (contactParts.length > 0) {
    rows.push(["Contact", contactParts.join(" • ")])
  }

  return rows
    .map(
      ([label, value]) => `
        <div class="info-label">${escapeHtml(label)}</div>
        <div class="info-value">${escapeHtml(value)}</div>`,
    )
    .join("\n")
}

function buildServiceBlocksSection(data: VoucherData): string {
  const blocks = data.serviceBlocks ?? []
  if (blocks.length === 0) return buildServiceProviderSection(data)

  return sortedVoucherServiceBlocks(blocks)
    .map(
      (block) => `
  <div class="section">
    <div class="section-title">${escapeHtml(block.title || voucherServiceTypeLabel(block.serviceType))}</div>
    <div class="provider-box">
      <div class="provider-name">${escapeHtml(block.contactDetails.name ?? "")}</div>
      <div class="info-grid">${buildServiceBlockBodyRows(block)}
      </div>
    </div>
  </div>`,
    )
    .join("\n")
}

function buildServiceProviderSection(data: VoucherData): string {
  const descriptionHtml = data.supplierDescription
    ? `<div class="provider-description">${escapeHtml(data.supplierDescription)}</div>`
    : ""

  return `
  <div class="section">
    <div class="section-title">Service Provider</div>
    <div class="provider-box">
      <div class="provider-name">${escapeHtml(data.supplierName)}</div>
${descriptionHtml}
      <div class="info-grid">
        <div class="info-label">Your Reference</div>
        <div class="info-value">${escapeHtml(data.voucherNumber)}</div>

        <div class="info-label">Route</div>
        <div class="info-value">${escapeHtml(data.route)}</div>

        <div class="info-label">Departure Date</div>
        <div class="info-value">${escapeHtml(data.departure)}</div>

        <div class="info-label">Arrival Date</div>
        <div class="info-value">${escapeHtml(data.arrival || "TBC")}</div>

        <div class="info-label">Suite Type</div>
        <div class="info-value">${escapeHtml(data.suiteType)}</div>

        <div class="info-label">Number of Suites</div>
        <div class="info-value">${escapeHtml(data.enquiry.noOfSuites)}</div>

        <div class="info-label">Meal Basis</div>
        <div class="info-value">Full Board (All meals included)</div>
      </div>
    </div>
  </div>`
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

  // Preview mirrors lib/voucher/pdf/styles.ts pt-for-pt; the PDF is the
  // source of truth — update both when the design changes.
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
    @page { size: A4; margin: 20mm; }
    body {
      font-family: ${previewBodyFontStack(t.font_family)};
      font-size: 10pt;
      line-height: 1.5;
      color: #2B2B2B;
      margin: 0;
      padding: 52pt 60pt 72pt;
      position: relative;
    }
    .frame-outer, .frame-inner { position: absolute; pointer-events: none; }
    .frame-outer { inset: 20pt; border: 0.75pt solid ${frameOuter}; }
    .frame-inner { inset: 24pt; border: 0.5pt solid ${frameInner}; }

    /* Header variants */
    .header { margin-bottom: 24pt; }
    .header-split { display: flex; align-items: stretch; border-bottom: 0.5pt solid ${rule}; padding-bottom: 12pt; }
    .header-logo-side { width: 120px; min-width: 120px; display: flex; align-items: center; justify-content: center; padding: 8px; background: #fff; }
    .header-logo { max-width: 100px; max-height: 80px; object-fit: contain; }
    .header-banner-side { flex: 1; position: relative; overflow: hidden; }
    .header-banner { width: 100%; height: 100px; object-fit: cover; display: block; }
    .header-text-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.35); padding: 8px 16px; }
    .header-text-overlay .product-line { color: #fff; margin: 0; }
    .header-text-overlay .header-subtitle { color: rgba(255,255,255,0.85); margin: 2pt 0 0; }

    .header-logo-only { text-align: center; padding-bottom: 12pt; border-bottom: 0.5pt solid ${rule}; }
    .header-logo-center { max-height: 70px; object-fit: contain; margin-bottom: 6px; }

    .header-banner-only { border-bottom: 0.5pt solid ${rule}; padding-bottom: 8pt; }
    .header-banner-only .header-banner-full { width: 100%; max-height: 110px; object-fit: cover; display: block; }
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
      margin: 24pt 0 12pt;
    }
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: 3pt;
      text-transform: uppercase;
      color: ${t.accent_colour};
      margin: 0;
    }
    .voucher-stub {
      border: 0.75pt solid ${t.accent_colour};
      border-left-style: dashed;
      padding: 6pt 12pt;
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
      font-size: 14pt;
      font-weight: 700;
      color: ${t.accent_colour};
      margin-top: 2pt;
    }

    .guidance {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 9pt;
      font-style: italic;
      line-height: 1.6;
      color: #6B6B6B;
      margin: 8pt 0 24pt;
      padding-right: 48pt;
    }

    .section { margin-bottom: 24pt; }
    .section-title {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 600;
      letter-spacing: 2pt;
      text-transform: uppercase;
      color: ${t.section_bg};
      border-bottom: 0.5pt solid ${ruleFaint};
      padding-bottom: 6pt;
      margin-bottom: 12pt;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 140pt 1fr;
      gap: 8pt 12pt;
    }
    .info-label {
      font-family: 'Montserrat', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 600;
      letter-spacing: 1pt;
      text-transform: uppercase;
      color: #6B6B6B;
      padding-top: 1pt;
    }
    .info-value { color: #2B2B2B; font-size: 10pt; }

    .provider-box {
      border: 0.75pt solid ${ruleFaint};
      padding: 16pt;
    }
    .provider-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 13pt;
      font-weight: 700;
      color: ${t.accent_colour};
      margin-bottom: 12pt;
    }
    .provider-description {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 9.5pt;
      color: #6B6B6B;
      font-style: italic;
      margin-bottom: 12pt;
    }

    .footer-section { margin-top: 8pt; text-align: center; }
    .footer-rule { width: 64pt; border-top: 0.5pt solid ${rule}; margin: 0 auto 12pt; }
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
      margin-top: 20pt;
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
