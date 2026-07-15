export const DEFAULT_QUOTE_VALIDITY_DAYS = 14

export const QUOTE_VALIDITY_QUICK_OPTIONS = [7, 30, 90] as const

export function isoDateDaysFromNow(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

export function resolveValidityDays(rawSettingValue: string | null | undefined): number {
  const parsed = rawSettingValue ? parseInt(rawSettingValue, 10) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_QUOTE_VALIDITY_DAYS
}

export interface QuoteValidityQuickOption {
  days: number
  isOrgDefault: boolean
}

export function buildQuickOptions(orgDefaultDays: number): QuoteValidityQuickOption[] {
  const options: QuoteValidityQuickOption[] = QUOTE_VALIDITY_QUICK_OPTIONS.map((days) => ({
    days,
    isOrgDefault: false,
  }))

  const exactMatchIndex = options.findIndex((option) => option.days === orgDefaultDays)
  if (exactMatchIndex !== -1) {
    options[exactMatchIndex] = { ...options[exactMatchIndex], isOrgDefault: true }
    return options
  }

  let closestIndex = 0
  let closestDistance = Math.abs(QUOTE_VALIDITY_QUICK_OPTIONS[0] - orgDefaultDays)
  for (let i = 1; i < QUOTE_VALIDITY_QUICK_OPTIONS.length; i++) {
    const distance = Math.abs(QUOTE_VALIDITY_QUICK_OPTIONS[i] - orgDefaultDays)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = i
    }
  }

  options[closestIndex] = { days: orgDefaultDays, isOrgDefault: true }
  return options
}
