import { formatDisplayDate } from "./date-format"

export function formatRateCardValidityRange(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
  formatDate: (value: string) => string = formatDisplayDate,
): string {
  const from = validFrom ? formatDate(validFrom) : "Open"
  const to = validTo ? formatDate(validTo) : "Ongoing"

  return `${from} - ${to}`
}
