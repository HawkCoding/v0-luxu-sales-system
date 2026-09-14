import type { Locator, Page } from "@playwright/test"
import { expect } from "@playwright/test"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../lib/supabase/types"

// On-screen furniture for the silent training clips.
//
// There is no voice-over, so every clip carries its own instructions: a caption
// pill that names the step, and a ring drawn round the control that is about to
// be clicked. Both live in a single host element with a fixed id, are appended
// to <body> (never inside the app tree), and are torn down by `clearOverlays`
// in each test's finally block — so neither can survive into a screenshot taken
// by the handbook or quick-start capture suites.

const OVERLAY_HOST_ID = "luxus-training-overlay"

/** Colours picked to stay legible over both the light app chrome and a dialog scrim. */
const CAPTION_BG = "rgba(12, 20, 38, 0.95)"
const RING_COLOUR = "#f59e0b"

/**
 * Show a step caption.
 *
 * Bottom-left on purpose: dialog footers put Send/Cancel on the right, and a
 * full-width banner at either edge would cover the very button the clip is
 * teaching. The pill is capped at 60vw so the right half always stays clear.
 *
 * The caption stays up until the next `caption()` or `clearOverlays()`, so the
 * viewer keeps the instruction on screen while the action happens.
 */
export async function caption(page: Page, text: string, holdMs = 2200): Promise<void> {
  await page.evaluate(
    ({ hostId, message, bg }) => {
      let host = document.getElementById(hostId)
      if (!host) {
        host = document.createElement("div")
        host.id = hostId
        host.setAttribute("data-training-overlay", "true")
        host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;"
        const style = document.createElement("style")
        style.textContent =
          "@keyframes luxus-training-pulse{0%{box-shadow:0 0 0 0 rgba(245,158,11,.55)}" +
          "70%{box-shadow:0 0 0 14px rgba(245,158,11,0)}" +
          "100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}"
        host.appendChild(style)
        document.body.appendChild(host)
      }
      host.querySelector("[data-training-caption]")?.remove()
      const pill = document.createElement("div")
      pill.setAttribute("data-training-caption", "true")
      pill.style.cssText = [
        "position:fixed",
        "left:24px",
        "bottom:24px",
        "max-width:60vw",
        "padding:14px 24px",
        "border-radius:14px",
        `background:${bg}`,
        "color:#ffffff",
        "font-family:'Segoe UI',system-ui,-apple-system,sans-serif",
        "font-size:26px",
        "font-weight:700",
        "line-height:1.25",
        "letter-spacing:0.2px",
        "box-shadow:0 12px 32px rgba(0,0,0,.42)",
        "pointer-events:none",
      ].join(";")
      pill.textContent = message
      host.appendChild(pill)
    },
    { hostId: OVERLAY_HOST_ID, message: text, bg: CAPTION_BG },
  )
  await page.waitForTimeout(holdMs)
}

/** Remove the caption and any ring. Safe to call on a closed or navigated page. */
export async function clearOverlays(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document.getElementById("luxus-training-overlay")?.remove()
    })
    .catch(() => undefined)
}

async function clearRing(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document
        .getElementById("luxus-training-overlay")
        ?.querySelectorAll("[data-training-ring]")
        .forEach((node) => node.remove())
    })
    .catch(() => undefined)
}

/**
 * Draw a pulsing ring round `locator`, hold it, then clear it.
 *
 * The ring is a sibling overlay positioned from the element's box rather than a
 * style applied to the element itself: the app's own focus and hover states stay
 * exactly as a consultant would see them.
 */
export async function highlight(page: Page, locator: Locator, holdMs = 900): Promise<void> {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded().catch(() => undefined)
  const box = await locator.boundingBox()
  if (!box) return

  await page.evaluate(
    ({ hostId, rect, colour }) => {
      let host = document.getElementById(hostId)
      if (!host) {
        host = document.createElement("div")
        host.id = hostId
        host.setAttribute("data-training-overlay", "true")
        host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;"
        const style = document.createElement("style")
        style.textContent =
          "@keyframes luxus-training-pulse{0%{box-shadow:0 0 0 0 rgba(245,158,11,.55)}" +
          "70%{box-shadow:0 0 0 14px rgba(245,158,11,0)}" +
          "100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}"
        host.appendChild(style)
        document.body.appendChild(host)
      }
      const ring = document.createElement("div")
      ring.setAttribute("data-training-ring", "true")
      ring.style.cssText = [
        "position:fixed",
        `left:${rect.x - 6}px`,
        `top:${rect.y - 6}px`,
        `width:${rect.width + 12}px`,
        `height:${rect.height + 12}px`,
        "border-radius:10px",
        `border:4px solid ${colour}`,
        "animation:luxus-training-pulse 1.1s ease-out infinite",
        "pointer-events:none",
      ].join(";")
      host.appendChild(ring)
    },
    { hostId: OVERLAY_HOST_ID, rect: box, colour: RING_COLOUR },
  )

  await page.waitForTimeout(holdMs)
  await clearRing(page)
}

/** Highlight a control, then click it. The ring is gone before the click lands. */
export async function highlightClick(page: Page, locator: Locator, holdMs = 900): Promise<void> {
  await highlight(page, locator, holdMs)
  await locator.click()
}

/** Let the viewer read whatever just appeared before the next action. */
export async function beat(page: Page, ms = 1200): Promise<void> {
  await page.waitForTimeout(ms)
}

// ---------------------------------------------------------------------------
// Database fixtures
// ---------------------------------------------------------------------------

export type QaSupabase = SupabaseClient<Database>

export interface TrainingProduct {
  /** File-name slug and Playwright test-title prefix. */
  product: "blue-train" | "rovos"
  /** Supplier name exactly as it appears in the Build Booking picker. */
  supplier: string
  supplierId: string
  /** Route option text in Build Booking step 2. */
  route: string
  /** Suite type option text in Build Booking step 2. */
  suiteType: string
  /** Free-text route on the new-enquiry draft form. */
  routeText: string
  routeId: string
  /** Seeded customer the fixture booking hangs off — complete enough for every gate. */
  customerId: string
  /** Booking number for the fixture booking driven by clips 2–4. */
  bookingNumber: string
  /** Consultant-typed invoice number entered on camera in clip 3. */
  invoiceNumber: string
  /** Supplier reference entered on camera in clip 4. */
  supplierReference: string
}

export const TRAINING_PRODUCTS: readonly TrainingProduct[] = [
  {
    product: "blue-train",
    supplier: "Blue Train",
    supplierId: "002b438f-df83-483a-9274-f17e9fef7f35",
    route: "Pretoria ↔ Cape Town",
    suiteType: "Deluxe",
    routeText: "Pretoria to Cape Town",
    routeId: "a409fa56-f2d0-4981-a211-798ab54f1fa6",
    customerId: "00000000-0000-0000-0000-000000008018",
    bookingNumber: "LTT-2026-0901",
    invoiceNumber: "INV-2026-0901",
    supplierReference: "BT-CPT-90142",
  },
  {
    product: "rovos",
    supplier: "Rovos Rail",
    supplierId: "d6de79b1-07f9-4d5d-a122-35df6e7b93e6",
    route: "Cape Town Journey",
    suiteType: "Deluxe Suite",
    routeText: "Pretoria to Cape Town",
    routeId: "249e387f-4a90-4f9c-9941-b5c504022ae4",
    customerId: "00000000-0000-0000-0000-000000008009",
    bookingNumber: "LTT-2026-0902",
    invoiceNumber: "INV-2026-0902",
    supplierReference: "RR-CPT-77310",
  },
] as const

/** Well clear of the two-month "pay in full" switch, and inside both suppliers' rate cards. */
export const TRAINING_DEPARTURE = "2027-06-15"

/** The seeded consultant, so the fixture booking shows up as Leonie's own work. */
const CONSULTANT_USER_ID = "00000000-0000-0000-0000-0000000000a2"

/**
 * Create the enquiry-stage booking that clips 2–4 drive from end to end.
 *
 * Nothing else is seeded: the quote, the services, the invoice, the payments,
 * the voucher and every email are all produced on camera by the clips. Deleting
 * the booking therefore removes everything they made — every table that
 * references `bookings.id` is ON DELETE CASCADE.
 */
export async function createTrainingBooking(
  supabase: QaSupabase,
  product: TrainingProduct,
): Promise<string> {
  // A re-run after an aborted session would otherwise collide on booking_number.
  await deleteTrainingBookingByNumber(supabase, product.bookingNumber)

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      booking_number: product.bookingNumber,
      customer_id: product.customerId,
      route_id: product.routeId,
      primary_supplier_id: product.supplierId,
      purpose: "reservation",
      source: "phone_call",
      stage: "enquiry",
      consultant: "LB",
      owner_user_id: CONSULTANT_USER_ID,
      assigned_salesperson_id: CONSULTANT_USER_ID,
      departure_date: TRAINING_DEPARTURE,
      no_of_adults: 2,
      no_of_adults_original: 2,
      no_of_children: 0,
      no_of_suites: 1,
      hotel_phase: "none",
      terms_accepted: false,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Could not create the training booking (${error?.message ?? "no row"}).`)
  }
  return data.id
}

/** Remove a training booking and, by cascade, everything the clips wrote against it. */
export async function deleteTrainingBooking(supabase: QaSupabase, bookingId: string): Promise<void> {
  const { error } = await supabase.from("bookings").delete().eq("id", bookingId)
  if (error) {
    throw new Error(`Could not remove the training booking ${bookingId} (${error.message}).`)
  }
}

export async function deleteTrainingBookingByNumber(
  supabase: QaSupabase,
  bookingNumber: string,
): Promise<void> {
  const { error } = await supabase.from("bookings").delete().eq("booking_number", bookingNumber)
  if (error) {
    throw new Error(`Could not remove booking ${bookingNumber} (${error.message}).`)
  }
}

/**
 * Remove the booking clip 1 creates through the UI, plus the customer the draft
 * form created for it. Customers the seed owns are never touched — only a row
 * matching the throwaway email this suite types on camera.
 */
export async function deleteEnquiryFixture(
  supabase: QaSupabase,
  options: { bookingId?: string | null; customerEmail: string },
): Promise<void> {
  if (options.bookingId) {
    await supabase.from("bookings").delete().eq("id", options.bookingId)
  }
  await supabase.from("customers").delete().eq("email", options.customerEmail)
}
