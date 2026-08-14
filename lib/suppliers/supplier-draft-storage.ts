import type {
  EditablePackage,
  EditableSuiteType,
  SupplierFormState,
} from "@/components/supplier-detail-view"

/**
 * Bump this whenever `SupplierFormState` gains, drops or renames a field.
 *
 * A local draft is written by whichever app version the browser happened to be running, and it can
 * sit in `localStorage` for weeks. A draft written before a field existed has no key for it, so
 * restoring it raw put `undefined` where the render expects an array or a string — which crashed
 * the supplier page to the root error boundary in production. The version stamp drops those drafts
 * instead of restoring them; the normalizer below is the second line of defence.
 */
export const SUPPLIER_DRAFT_SCHEMA_VERSION = 1

export interface SupplierDraftEnvelope {
  version: number
  savedAt: string
  form: SupplierFormState
}

function toArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function normalizeSuiteType(suiteType: EditableSuiteType): EditableSuiteType {
  return {
    ...suiteType,
    bedroomTypeIds: toArray<string>(suiteType.bedroomTypeIds, []),
    bedroomLayoutIds: toArray<string>(suiteType.bedroomLayoutIds, []),
    bathroomTypeIds: toArray<string>(suiteType.bathroomTypeIds, []),
  }
}

function normalizePackage(pkg: EditablePackage): EditablePackage {
  return {
    ...pkg,
    routes: toArray(pkg.routes, []),
    rateCards: toArray(pkg.rateCards, []),
  }
}

/**
 * Merge a stored draft over a freshly built form state so every key is present and of the right
 * kind. `fallback` is `buildFormState(supplier)`, so anything the draft is missing takes the
 * server's current value rather than `undefined`.
 */
export function normalizeSupplierDraft(
  draft: SupplierFormState,
  fallback: SupplierFormState,
): SupplierFormState {
  const storedEmails = toArray<SupplierFormState["emails"][number]>(draft.emails, [])

  return {
    ...fallback,
    ...draft,
    // An empty email list is not a valid form state -- the fallback already carries either the
    // supplier's legacy single address or one blank row.
    emails: storedEmails.length > 0 ? storedEmails : fallback.emails,
    stationAddresses: toArray(draft.stationAddresses, fallback.stationAddresses),
    rateAdjustments: toArray(draft.rateAdjustments, fallback.rateAdjustments),
    bedroomTypes: toArray(draft.bedroomTypes, fallback.bedroomTypes),
    bedroomLayouts: toArray(draft.bedroomLayouts, fallback.bedroomLayouts),
    bathroomTypes: toArray(draft.bathroomTypes, fallback.bathroomTypes),
    suiteTypes: toArray(draft.suiteTypes, fallback.suiteTypes).map(normalizeSuiteType),
    packages: toArray(draft.packages, fallback.packages).map(normalizePackage),
    name: toText(draft.name, fallback.name),
    phone: toText(draft.phone, fallback.phone),
    website: toText(draft.website, fallback.website),
    location: toText(draft.location, fallback.location),
    locationDetail: toText(draft.locationDetail, fallback.locationDetail),
    streetAddress: toText(draft.streetAddress, fallback.streetAddress),
    description: toText(draft.description, fallback.description),
    notes: toText(draft.notes, fallback.notes),
    defaultTimeStart: toText(draft.defaultTimeStart, fallback.defaultTimeStart),
    defaultTimeEnd: toText(draft.defaultTimeEnd, fallback.defaultTimeEnd),
    inclusions: toText(draft.inclusions, fallback.inclusions),
    exclusions: toText(draft.exclusions, fallback.exclusions),
  }
}

/** The payload written to `localStorage`. Stamped so a later schema can reject it. */
export function serializeSupplierDraft(
  form: SupplierFormState,
  savedAt: string = new Date().toISOString(),
): string {
  const envelope: SupplierDraftEnvelope = {
    version: SUPPLIER_DRAFT_SCHEMA_VERSION,
    savedAt,
    form,
  }
  return JSON.stringify(envelope)
}

/**
 * Parse a stored draft. Returns `null` when the payload is unusable -- unparseable, written by an
 * older schema, or structurally wrong -- in which case the caller should clear the storage key.
 */
export function readSupplierDraft(
  raw: string | null,
  fallback: SupplierFormState,
): SupplierFormState | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const envelope = parsed as Partial<SupplierDraftEnvelope>
  // Unversioned drafts predate this envelope and cannot be trusted field by field.
  if (envelope.version !== SUPPLIER_DRAFT_SCHEMA_VERSION) return null

  const form = envelope.form
  if (!form || typeof form !== "object" || Array.isArray(form)) return null
  if (!Array.isArray(form.suiteTypes) || !Array.isArray(form.packages)) return null

  return normalizeSupplierDraft(form, fallback)
}
