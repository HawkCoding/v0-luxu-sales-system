export function formatRateCardValidityRange(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
  formatDate: (value: string) => string = (value) => value,
): string {
  const from = validFrom ? formatDate(validFrom) : "Open"
  const to = validTo ? formatDate(validTo) : "Ongoing"

  return `${from} - ${to}`
}
