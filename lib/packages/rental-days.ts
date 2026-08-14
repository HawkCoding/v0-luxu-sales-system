/** Whole days a vehicle rental is billed for, rounded up. Shared by the client-side price-override
 *  preview and the server-side quote pricer so the two can never disagree on the day count. Missing
 *  or invalid dates default to 1 day rather than blocking the price from showing at all. */
export function getBillableRentalDays(pickupAt: string | null, returnAt: string | null): number {
  if (!pickupAt || !returnAt) return 1

  const pickup = new Date(pickupAt)
  const returnDate = new Date(returnAt)
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(returnDate.getTime())) return 1

  const durationMs = returnDate.getTime() - pickup.getTime()
  if (durationMs <= 0) return 1

  return Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))
}
