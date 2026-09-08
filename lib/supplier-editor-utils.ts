export interface DraftHydrationContext {
  hasLocalForm: boolean
  isEditing: boolean
  supplierStatus: "draft" | "active" | "inactive" | "temporary"
  supplierIdentityChanged: boolean
}

interface OverlapSignatureRateCard {
  suiteTypeId: string
  routeId: string | null
  currency: string
  validFrom: string
  validTo: string | null
}

interface OverlapSignaturePackage {
  id: string
  rateCards: OverlapSignatureRateCard[]
}

interface OverlapSignatureSuiteType {
  id: string
}

export interface OverlapValidationSignatureInput {
  suiteTypes: OverlapSignatureSuiteType[]
  packages: OverlapSignaturePackage[]
}

export function shouldHydrateFormFromServer(context: DraftHydrationContext): boolean {
  if (context.supplierIdentityChanged) {
    return true
  }
  if (!context.hasLocalForm) {
    return true
  }
  // Used to also hydrate unconditionally for a published (active/inactive) supplier, on the
  // reasoning that only a draft/temporary one is safe to protect mid-edit. But
  // supplierIdentityChanged already catches every genuine external change (it's keyed on
  // `${id}:${updatedAt}`), so that carve-out did nothing except let an ordinary SWR revalidation
  // -- one returning the exact same, unchanged row -- silently discard in-progress edits on a
  // published supplier. That is what let a ticked "Can be the main product" checkbox revert to
  // unchecked before Save ever ran (F-P7-1). An active edit session is protected regardless of
  // status; only a real change to the record forces a re-hydrate.
  return !context.isEditing
}

export function getOverlapValidationSignature(
  form: OverlapValidationSignatureInput,
): string {
  const parts: string[] = []
  for (const suiteType of form.suiteTypes) {
    parts.push(`suite:${suiteType.id}`)
  }
  for (const pkg of form.packages) {
    parts.push(`pkg:${pkg.id}`)
    for (const rateCard of pkg.rateCards) {
      parts.push(
        [
          "rate",
          rateCard.suiteTypeId,
          rateCard.routeId ?? "__null__",
          rateCard.currency,
          rateCard.validFrom,
          rateCard.validTo ?? "",
        ].join(":"),
      )
    }
  }
  return parts.join("|")
}
