export interface ReservationSpecialRequests {
  dietary?: string | null
  medical?: string | null
  occasion?: string | null
  smokingPreference?: "smoking" | "non_smoking" | null
  mealSeating?: "first" | "second" | null
}

const SMOKING_LABEL: Record<"smoking" | "non_smoking", string> = {
  smoking: "Smoking",
  non_smoking: "Non-smoking",
}

const MEAL_SEATING_LABEL: Record<"first" | "second", string> = {
  first: "1st seating",
  second: "2nd seating",
}

/** Merges the reservation form's special-request fields into the free-text
 * additional-services notes that already flow onto the voucher. */
export function buildSpecialRequestsText(
  additionalServicesDetails: string | null | undefined,
  details: ReservationSpecialRequests | null | undefined,
): string {
  const lines: string[] = []
  if (details?.dietary) lines.push(`Dietary: ${details.dietary}`)
  if (details?.medical) lines.push(`Medical: ${details.medical}`)
  if (details?.occasion) lines.push(`Occasion: ${details.occasion}`)
  if (details?.smokingPreference) lines.push(`Smoking: ${SMOKING_LABEL[details.smokingPreference]}`)
  if (details?.mealSeating) lines.push(`Meal seating: ${MEAL_SEATING_LABEL[details.mealSeating]}`)

  const base = additionalServicesDetails?.trim() || ""
  const requestBlock = lines.join("\n")

  return [base, requestBlock].filter(Boolean).join("\n\n")
}
