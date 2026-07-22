/**
 * Pre-fill a sensible trip title from the booking's route + customer surname.
 * Only a starting point — the salesperson can always edit it before generating.
 */
export function buildDefaultTripTitle(direction?: string | null, lastName?: string | null): string {
  const route = direction?.trim()
  const surname = lastName?.trim()
  if (route && surname) return `${route} — ${surname} Family`
  if (surname) return `${surname} Family`
  return ""
}
