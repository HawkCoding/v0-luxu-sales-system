import { BANKING_SETTING_KEYS, type BankingSettings } from "@/lib/settings-access"

/**
 * Test-only helper: a complete BankingSettings object with every key present.
 * Defaults to empty strings so tests opt into only the fields they exercise,
 * and new banking keys never break unrelated fixtures again.
 */
export function makeBankingSettings(overrides: Partial<BankingSettings> = {}): BankingSettings {
  const base = Object.fromEntries(BANKING_SETTING_KEYS.map((key) => [key, ""])) as BankingSettings
  return { ...base, ...overrides }
}
