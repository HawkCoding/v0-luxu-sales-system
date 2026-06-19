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
  if (context.supplierStatus !== "draft" && context.supplierStatus !== "temporary") {
    return true
  }
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
