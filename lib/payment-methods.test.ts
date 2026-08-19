import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"
import { makeBankingSettings } from "@/lib/settings-access.fixtures"

const settingsMocks = vi.hoisted(() => ({
  getBankingSettings: vi.fn(async () => makeBankingSettings({ bank_name: "Fallback Bank", company_email: "office@luxus.test" })),
}))

vi.mock("@/lib/settings-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings-access")>()
  return { ...actual, getBankingSettings: settingsMocks.getBankingSettings }
})

import { getPaymentMethod, toBankingSettings, type PaymentMethodRow } from "./payment-methods"

function methodRow(overrides: Partial<PaymentMethodRow> = {}): MockRow {
  return {
    id: "method-1",
    name: "Primary",
    enabled: true,
    is_default: false,
    sort_order: 0,
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_branch_code: null,
    bank_swift_code: null,
    company_address: null,
    company_reg_number: null,
    company_vat_number: null,
    company_tel: null,
    company_cell: null,
    company_fax: null,
    company_email: null,
    company_website: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  settingsMocks.getBankingSettings.mockClear()
})

describe("toBankingSettings", () => {
  it("prefers the row's own field, falling back per-field to the legacy app_settings value", () => {
    const row = methodRow({ bank_name: "Standard Bank", bank_account_number: "" }) as unknown as PaymentMethodRow
    const fallback = makeBankingSettings({ bank_name: "Fallback Bank", bank_account_number: "12345" })

    const result = toBankingSettings(row, fallback)

    expect(result.bank_name).toBe("Standard Bank")
    // Blank on the row falls back rather than rendering empty.
    expect(result.bank_account_number).toBe("12345")
  })
})

describe("getPaymentMethod", () => {
  it("resolves the requested enabled id", async () => {
    const { supabase } = createSupabaseMock({
      payment_methods: [
        methodRow({ id: "a", name: "A", is_default: true, bank_name: "Bank A" }),
        methodRow({ id: "b", name: "B", bank_name: "Bank B" }),
      ],
    })

    const method = await getPaymentMethod(supabase as never, "b")
    expect(method.id).toBe("b")
    expect(method.banking.bank_name).toBe("Bank B")
  })

  it("falls back to the enabled default when the requested id is unknown", async () => {
    const { supabase } = createSupabaseMock({
      payment_methods: [methodRow({ id: "a", name: "A", is_default: true, bank_name: "Bank A" })],
    })

    const method = await getPaymentMethod(supabase as never, "does-not-exist")
    expect(method.id).toBe("a")
    expect(method.isDefault).toBe(true)
  })

  it("falls back to the enabled default when the requested id is disabled", async () => {
    const { supabase } = createSupabaseMock({
      payment_methods: [
        methodRow({ id: "a", name: "A", is_default: true, bank_name: "Bank A" }),
        methodRow({ id: "b", name: "B", enabled: false, bank_name: "Bank B" }),
      ],
    })

    const method = await getPaymentMethod(supabase as never, "b")
    expect(method.id).toBe("a")
  })

  it("falls back to the pure app_settings shape when no payment methods exist", async () => {
    const { supabase } = createSupabaseMock({ payment_methods: [] })

    const method = await getPaymentMethod(supabase as never, null)
    expect(method.id).toBe("")
    expect(method.banking.bank_name).toBe("Fallback Bank")
  })
})
