import { isAtOrPastStage } from "@/lib/pipeline/validate-transition"
import { getCanonicalPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/types"

export interface BookingVisibilityInput {
  stage: PipelineStage | string
}

/**
 * The three work queues a record moves through: an Enquiry until its quote is sent, a Quote until
 * the deposit is paid, then a Booking. Lost records sit in none of them.
 *
 * The section follows the canonical pipeline stage only. The `deposit_paid` flag on its own never
 * moves a record — money can land before anyone moves the stage, and the record stays a Quote
 * until it reaches Deposit Paid.
 */
export type RecordSection = "enquiries" | "quotes" | "bookings"

export interface RecordSectionConfig {
  /** Sidebar and heading label. */
  label: string
  /** The list page. Detail pages live at `${href}/<id>`. */
  href: string
  /** Singular noun for counts and copy — "quote", "booking". */
  noun: string
  /** Canonical stages listed in this section, in pipeline order. */
  stages: PipelineStage[]
}

export const RECORD_SECTIONS: Record<RecordSection, RecordSectionConfig> = {
  enquiries: { label: "Enquiries", href: "/app/enquiries", noun: "enquiry", stages: ["enquiry"] },
  quotes: {
    label: "Quotes",
    href: "/app/quotes",
    noun: "quote",
    stages: ["quote_sent", "accepted", "deposit_requested"],
  },
  bookings: {
    label: "Bookings",
    href: "/app/bookings",
    noun: "booking",
    stages: ["deposit_paid", "final_paid", "voucher_sent", "closed"],
  },
}

const RECORD_SECTION_KEYS = Object.keys(RECORD_SECTIONS) as RecordSection[]

/** Detail URLs a record can be opened at. `/app/jobs/<id>` is the section-less legacy path. */
const RECORD_DETAIL_PATH = /^\/app\/(enquiries|quotes|bookings|jobs)\/([^/?#]+)\/?$/
const SECTION_PATH = /^\/app\/(enquiries|quotes|bookings)(?:\/|$)/

function isPipelineStage(stage: string): stage is PipelineStage {
  return Object.prototype.hasOwnProperty.call(PIPELINE_STAGE_LABELS, stage)
}

export function getRecordSection(stage: PipelineStage | string): RecordSection | null {
  if (!isPipelineStage(stage)) return null
  const canonical = getCanonicalPipelineStage(stage)
  if (canonical === "lost") return null
  if (canonical === "enquiry") return "enquiries"
  if (isAtOrPastStage(canonical, "deposit_paid")) return "bookings"
  if (isAtOrPastStage(canonical, "quote_sent")) return "quotes"
  return null
}

/** "enquiry" / "quote" / "booking" for the record's current stage; "booking" for lost or unknown. */
export function getRecordNoun(stage: PipelineStage | string): string {
  return RECORD_SECTIONS[getRecordSection(stage) ?? "bookings"].noun
}

export function isVisibleInEnquiries(booking: BookingVisibilityInput): boolean {
  return getRecordSection(booking.stage) === "enquiries"
}

export function isVisibleInQuotes(booking: BookingVisibilityInput): boolean {
  return getRecordSection(booking.stage) === "quotes"
}

export function isVisibleInBookings(booking: BookingVisibilityInput): boolean {
  return getRecordSection(booking.stage) === "bookings"
}

/**
 * Where a record opens from any list. A record with no section (lost) opens at the neutral
 * `/app/jobs/<id>`, so the sidebar doesn't claim it belongs to a queue it was removed from.
 */
export function getRecordHref(id: string, stage: PipelineStage | string): string {
  const section = getRecordSection(stage)
  return section ? `${RECORD_SECTIONS[section].href}/${id}` : `/app/jobs/${id}`
}

/**
 * A link to one of a record's own tabs (`suffix` is the `?tab=…` query). On the record's detail
 * page it keeps the current path, so the jump is a same-route navigation instead of a remount via
 * another section's URL. Anywhere else it uses the neutral `/app/jobs/<id>`, which the detail page
 * canonicalises to the record's section on load.
 */
export function getRecordTabHref(pathname: string | null | undefined, id: string, suffix = ""): string {
  const match = RECORD_DETAIL_PATH.exec(pathname ?? "")
  const base = match && match[2] === id ? (pathname ?? "").replace(/\/$/, "") : `/app/jobs/${id}`
  return `${base}${suffix}`
}

/** The section a URL belongs to (list or detail page), or null for every other path. */
export function getSectionFromPathname(pathname: string | null | undefined): RecordSection | null {
  const match = SECTION_PATH.exec(pathname ?? "")
  const section = match?.[1]
  return RECORD_SECTION_KEYS.find((key) => key === section) ?? null
}

/**
 * The path a record detail page should be showing, or null when `pathname` is already right (or is
 * not this record's detail page, or the record has no section). Old `/app/bookings/<id>` and
 * `/app/jobs/<id>` links rely on this to land in the record's real section.
 */
export function getCanonicalRecordPath(
  pathname: string | null | undefined,
  id: string,
  stage: PipelineStage | string,
): string | null {
  const match = RECORD_DETAIL_PATH.exec(pathname ?? "")
  if (!match || match[2] !== id) return null

  const section = getRecordSection(stage)
  if (!section) return null
  if (match[1] === section) return null

  return `${RECORD_SECTIONS[section].href}/${id}`
}
