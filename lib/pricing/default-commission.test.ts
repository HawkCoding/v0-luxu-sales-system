import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import {
  DEFAULT_COMMISSION,
  getDefaultCommission,
  normalizeCommissionValue,
  parseDefaultCommission,
} from "@/lib/pricing/default-commission"

describe("normalizeCommissionValue", () => {
  it("caps a percent at 100", () => {
    expect(normalizeCommissionValue("percent", 150)).toBe(100)
  })

  it("allows a per-person value above 100", () => {
    expect(normalizeCommissionValue("per_person", 2500)).toBe(2500)
  })

  it("floors negatives at zero and rounds to cents", () => {
    expect(normalizeCommissionValue("percent", -5)).toBe(0)
    expect(normalizeCommissionValue("percent", 12.345)).toBe(12.35)
  })

  it("falls back to zero for a non-finite value", () => {
    expect(normalizeCommissionValue("percent", Number.NaN)).toBe(0)
  })
})

describe("parseDefaultCommission", () => {
  it("reads a stored pair", () => {
    expect(parseDefaultCommission("per_person", "750")).toEqual({ type: "per_person", value: 750 })
  })

  it("treats an unknown type as percent", () => {
    expect(parseDefaultCommission("nonsense", "10")).toEqual({ type: "percent", value: 10 })
  })

  it("treats a missing value as no commission", () => {
    expect(parseDefaultCommission("percent", null)).toEqual({ type: "percent", value: 0 })
    expect(parseDefaultCommission("percent", "")).toEqual({ type: "percent", value: 0 })
  })
})

describe("getDefaultCommission", () => {
  it("reads both settings rows", async () => {
    const { supabase } = createSupabaseMock({
      app_settings: [
        { key: "default_commission_type", value: "percent" },
        { key: "default_commission_value", value: "12.5" },
      ],
    })

    await expect(getDefaultCommission(supabase as never)).resolves.toEqual({
      type: "percent",
      value: 12.5,
    })
  })

  it("falls back to no commission when the settings are absent", async () => {
    const { supabase } = createSupabaseMock({ app_settings: [] })
    await expect(getDefaultCommission(supabase as never)).resolves.toEqual(DEFAULT_COMMISSION)
  })
})
