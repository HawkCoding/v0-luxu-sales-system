import { describe, it, expect } from "vitest"
import { shouldSendRoute, type RouteRetentionInput } from "./itinerary-payload"

function route(overrides: Partial<RouteRetentionInput> = {}): RouteRetentionInput {
  return { name: "", suiteTypeId: null, description: "", ...overrides }
}

describe("shouldSendRoute", () => {
  describe("tour operator itineraries", () => {
    it("keeps a nameless itinerary that belongs to a tour type", () => {
      expect(shouldSendRoute(route({ suiteTypeId: "type-1" }), true)).toBe(true)
    })

    it("keeps a nameless itinerary with a description but no tour type", () => {
      expect(shouldSendRoute(route({ description: "Day 1: Pretoria" }), true)).toBe(true)
    })

    it("keeps an itinerary that already has a derived name", () => {
      expect(shouldSendRoute(route({ name: "Luxury 3-Day" }), true)).toBe(true)
    })

    it("drops a wholly blank itinerary row", () => {
      expect(shouldSendRoute(route(), true)).toBe(false)
    })

    it("treats whitespace-only copy as blank", () => {
      expect(shouldSendRoute(route({ name: "  ", description: "\n " }), true)).toBe(false)
    })
  })

  describe("other supplier kinds", () => {
    it("keeps a named route", () => {
      expect(shouldSendRoute(route({ name: "Pretoria to Cape Town" }), false)).toBe(true)
    })

    it("drops a nameless route even when it carries other fields", () => {
      expect(shouldSendRoute(route({ suiteTypeId: "type-1", description: "copy" }), false)).toBe(
        false,
      )
    })
  })
})
