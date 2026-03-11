import { describe, expect, it, vi } from "vitest"
import type { SessionClient } from "./helpers"
import { getSupplierDeletionBlocker } from "./helpers"

type CountResult = { count: number | null; error: { message: string } | null }

function makeSessionClient(results: Record<string, CountResult>): SessionClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in(column: string) {
              const key = `${table}.${column}`
              return Promise.resolve(results[key] ?? { count: 0, error: null })
            },
          }
        },
      }
    },
  } as unknown as SessionClient
}

describe("getSupplierDeletionBlocker", () => {
  it("returns null without querying when no ids are pending deletion", async () => {
    const fromSpy = vi.fn()
    const supabase = { from: fromSpy } as unknown as SessionClient

    const blocker = await getSupplierDeletionBlocker(supabase, {
      packageIds: [],
      routeIds: [],
      suiteTypeIds: [],
    })

    expect(blocker).toBeNull()
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it("blocks package deletions that are still referenced by bookings or offers", async () => {
    const supabase = makeSessionClient({
      "bookings.package_id": { count: 1, error: null },
      "hotel_offers.package_id": { count: 0, error: null },
    })

    const blocker = await getSupplierDeletionBlocker(supabase, {
      packageIds: ["pkg-1"],
      routeIds: [],
      suiteTypeIds: [],
    })

    expect(blocker).toBe("Cannot remove package records linked to existing bookings or offers.")
  })

  it("blocks route deletions that are still referenced by bookings", async () => {
    const supabase = makeSessionClient({
      "bookings.route_id": { count: 2, error: null },
    })

    const blocker = await getSupplierDeletionBlocker(supabase, {
      packageIds: [],
      routeIds: ["route-1"],
      suiteTypeIds: [],
    })

    expect(blocker).toBe("Cannot remove route records linked to existing bookings.")
  })

  it("blocks suite type deletions that are still referenced by booking suites", async () => {
    const supabase = makeSessionClient({
      "booking_suites.suite_type_id": { count: 3, error: null },
    })

    const blocker = await getSupplierDeletionBlocker(supabase, {
      packageIds: [],
      routeIds: [],
      suiteTypeIds: ["suite-1"],
    })

    expect(blocker).toBe("Cannot remove suite type records linked to existing bookings.")
  })

  it("throws when dependency validation query fails", async () => {
    const supabase = makeSessionClient({
      "bookings.package_id": { count: null, error: { message: "boom" } },
      "hotel_offers.package_id": { count: 0, error: null },
    })

    await expect(
      getSupplierDeletionBlocker(supabase, {
        packageIds: ["pkg-1"],
        routeIds: [],
        suiteTypeIds: [],
      }),
    ).rejects.toThrow("Failed to validate package dependencies")
  })
})
