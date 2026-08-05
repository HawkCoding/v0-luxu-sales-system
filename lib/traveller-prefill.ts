/**
 * Prefilling a returning customer's own guest row on the reservation form.
 *
 * We already hold the customer's ID/passport number and date of birth on their
 * CRM profile — captured the last time they travelled, via the primary-guest
 * write-back in `app/api/jobs/[id]/travellers/route.ts`. This module decides
 * which guest row is the customer and which blanks it can safely fill, so a
 * repeat booker doesn't retype details we already have.
 */

/**
 * Fields we can carry from the customer profile onto their guest row. Order
 * drives the wording of the "prefilled" hint shown in the UI.
 */
export const PREFILL_FIELDS = ["prefix", "idPassport", "dateOfBirth", "residence"] as const
export type PrefillField = (typeof PREFILL_FIELDS)[number]

const PREFILL_FIELD_LABELS: Record<PrefillField, string> = {
  prefix: "title",
  idPassport: "ID/passport",
  dateOfBirth: "date of birth",
  residence: "residence",
}

/** The parts of a guest row this module reads and writes. */
export type PrefillableTraveller = Record<PrefillField, string> & {
  key: string
  firstName: string
  lastName: string
  isChild: boolean
  isPrimary: boolean
}

/** The parts of a customer record this module reads. */
export interface PrefillSourceCustomer {
  firstName: string
  lastName: string
  title?: string | null
  idPassport?: string | null
  dateOfBirth?: string | null
  country?: string | null
}

export function customerPrefillValues(customer: PrefillSourceCustomer): Record<PrefillField, string> {
  return {
    prefix: customer.title ?? "",
    idPassport: customer.idPassport ?? "",
    dateOfBirth: customer.dateOfBirth ?? "",
    residence: customer.country ?? "",
  }
}

function sameName(
  a: { firstName: string; lastName: string },
  b: { firstName: string; lastName: string },
): boolean {
  return (
    a.firstName.trim().toLowerCase() === b.firstName.trim().toLowerCase() &&
    a.lastName.trim().toLowerCase() === b.lastName.trim().toLowerCase()
  )
}

/**
 * Locates the guest row that *is* the booking customer: the primary guest if one
 * is flagged, otherwise an adult row with the same name. Returns -1 when the
 * customer is paying for someone else's trip and isn't travelling themselves —
 * in that case we must not touch anyone's identity details.
 */
export function findCustomerRow<T extends PrefillableTraveller>(rows: T[], customer: PrefillSourceCustomer): number {
  const primary = rows.findIndex((row) => row.isPrimary)
  if (primary !== -1) return primary
  return rows.findIndex((row) => !row.isChild && sameName(row, customer))
}

export interface PrefillResult<T> {
  rows: T[]
  /** Guest row key → the fields this call filled in. Empty when nothing changed. */
  prefilled: Map<string, Set<PrefillField>>
  /** True when `rows` is a new array (fields filled, or the primary flag moved). */
  changed: boolean
}

/**
 * Copies the identity fields held on the customer profile onto their guest row.
 * Only blank fields are filled — anything already on the row (from the enquiry,
 * or typed this session) always wins, so this can never destroy captured data.
 *
 * `createRow` seeds a brand-new row when the booking has no guests at all.
 */
export function fillBlanksFromCustomer<T extends PrefillableTraveller, C extends PrefillSourceCustomer>(
  rows: T[],
  customer: C,
  createRow: (customer: C) => T,
): PrefillResult<T> {
  const values = customerPrefillValues(customer)
  const prefilled = new Map<string, Set<PrefillField>>()

  if (rows.length === 0) {
    const seeded = createRow(customer)
    const filled = new Set(PREFILL_FIELDS.filter((field) => values[field]))
    if (filled.size > 0) prefilled.set(seeded.key, filled)
    return { rows: [seeded], prefilled, changed: true }
  }

  const targetIndex = findCustomerRow(rows, customer)
  if (targetIndex === -1) return { rows, prefilled, changed: false }

  const target = rows[targetIndex]
  const filled = new Set<PrefillField>()
  const patch: Partial<Record<PrefillField, string>> = {}
  for (const field of PREFILL_FIELDS) {
    if (target[field].trim() || !values[field]) continue
    patch[field] = values[field]
    filled.add(field)
  }

  // Matched on name rather than the flag: adopt them as primary so the
  // write-back on save knows which guest maps to the customer. The DB allows
  // only one primary per booking, so the previous holder is cleared.
  const claimPrimary = !target.isPrimary
  if (filled.size === 0 && !claimPrimary) return { rows, prefilled, changed: false }

  if (filled.size > 0) prefilled.set(target.key, filled)

  return {
    rows: rows.map((row, index) => {
      if (index === targetIndex) return { ...row, ...patch, isPrimary: true }
      return claimPrimary && row.isPrimary ? { ...row, isPrimary: false } : row
    }),
    prefilled,
    changed: true,
  }
}

export function describePrefilled(fields: Set<PrefillField>): string {
  return PREFILL_FIELDS.filter((field) => fields.has(field))
    .map((field) => PREFILL_FIELD_LABELS[field])
    .join(", ")
}
