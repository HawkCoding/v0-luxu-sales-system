export function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}
