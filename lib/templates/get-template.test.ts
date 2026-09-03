import { describe, expect, it } from "vitest"
import { DEFAULT_TEMPLATES, getTemplate } from "./get-template"
import { SYSTEM_TEMPLATE_KEYS, getTokenSpecs } from "./registry"

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000fff"

interface TemplateRow {
  key: string
  subject: string
  body_html: string
  supplier_id: string | null
  active: boolean
}

// Minimal fluent stand-in for the supabase chain getTemplate builds: any number of
// .eq()/.is() calls narrow the candidate rows, then .maybeSingle() resolves.
function makeSupabase(rows: TemplateRow[]) {
  return {
    from(table: string) {
      if (table !== "templates") throw new Error(`Unexpected table: ${table}`)
      const filters: { field: string; value: unknown }[] = []
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push({ field, value })
          return builder
        },
        is: (field: string, value: unknown) => {
          filters.push({ field, value })
          return builder
        },
        maybeSingle: async () => {
          const match = rows.find((row) =>
            filters.every((f) => (row as unknown as Record<string, unknown>)[f.field] === f.value),
          )
          return { data: match ?? null, error: null }
        },
      }
      return builder
    },
  }
}

describe("getTemplate — supplier variants", () => {
  it("resolves the (key, supplierId) variant when one exists and is active", async () => {
    const supabase = makeSupabase([
      { key: "quote_email", subject: "Shared subject", body_html: "<p>Shared</p>", supplier_id: null, active: true },
      {
        key: "quote_email",
        subject: "Shalati subject",
        body_html: "<p>Shalati</p>",
        supplier_id: SUPPLIER_ID,
        active: true,
      },
    ])
    const result = await getTemplate(supabase as never, "quote_email", SUPPLIER_ID)
    expect(result).toEqual({ key: "quote_email", subject: "Shalati subject", bodyHtml: "<p>Shalati</p>" })
  })

  it("falls back to the shared (supplier_id IS NULL) row when no variant matches the supplier", async () => {
    const supabase = makeSupabase([
      { key: "quote_email", subject: "Shared subject", body_html: "<p>Shared</p>", supplier_id: null, active: true },
    ])
    const result = await getTemplate(supabase as never, "quote_email", SUPPLIER_ID)
    expect(result).toEqual({ key: "quote_email", subject: "Shared subject", bodyHtml: "<p>Shared</p>" })
  })

  it("falls back to the shared row when the matching variant is inactive", async () => {
    const supabase = makeSupabase([
      { key: "quote_email", subject: "Shared subject", body_html: "<p>Shared</p>", supplier_id: null, active: true },
      {
        key: "quote_email",
        subject: "Shalati subject",
        body_html: "<p>Shalati</p>",
        supplier_id: SUPPLIER_ID,
        active: false,
      },
    ])
    const result = await getTemplate(supabase as never, "quote_email", SUPPLIER_ID)
    expect(result).toEqual({ key: "quote_email", subject: "Shared subject", bodyHtml: "<p>Shared</p>" })
  })

  it("resolves the shared row directly when no supplierId is given", async () => {
    const supabase = makeSupabase([
      { key: "quote_email", subject: "Shared subject", body_html: "<p>Shared</p>", supplier_id: null, active: true },
      {
        key: "quote_email",
        subject: "Shalati subject",
        body_html: "<p>Shalati</p>",
        supplier_id: SUPPLIER_ID,
        active: true,
      },
    ])
    const result = await getTemplate(supabase as never, "quote_email")
    expect(result).toEqual({ key: "quote_email", subject: "Shared subject", bodyHtml: "<p>Shared</p>" })
  })

  it("falls back to the code-level default for a system key when no row exists at all", async () => {
    const supabase = makeSupabase([])
    const result = await getTemplate(supabase as never, "quote_email", SUPPLIER_ID)
    expect(result).toEqual({
      key: "quote_email",
      subject: DEFAULT_TEMPLATES.quote_email.subject,
      bodyHtml: DEFAULT_TEMPLATES.quote_email.bodyHtml,
    })
  })

  it("returns null for an unknown custom key with no matching row", async () => {
    const supabase = makeSupabase([])
    const result = await getTemplate(supabase as never, "not_a_real_key", SUPPLIER_ID)
    expect(result).toBeNull()
  })
})

// Regression test for the double-Rand bug: money tokens (amountDue,
// depositAmount, etc.) are resolved via Intl.NumberFormat ZAR currency
// style, which already includes the "R" symbol (e.g. "R 12 345,00"). A
// template that also hardcodes a literal "R"/"R " before the token renders
// "R R 12 345,00" in sent emails. Guard against reintroducing that.
const MONEY_TOKENS = [
  "amountDue",
  "depositAmount",
  "finalAmount",
  "receivedAmount",
  "outstandingAmount",
  "total",
  "amountReceived",
]

describe("DEFAULT_TEMPLATES", () => {
  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    for (const token of MONEY_TOKENS) {
      it(`${key} does not hardcode a literal "R" before {{${token}}}`, () => {
        expect(template.bodyHtml).not.toContain(`R {{${token}}}`)
        expect(template.bodyHtml).not.toContain(`R{{${token}}}`)
      })
    }
  }
})

// The template editor previews with registry samples. A bare-number sample makes
// a hardcoded literal "R" look correct in preview while a real send emits "RR",
// which is how the bug reached production. Samples must carry the symbol.
describe("registry money-token samples", () => {
  const specs = getTokenSpecs(SYSTEM_TEMPLATE_KEYS[0])

  for (const token of MONEY_TOKENS) {
    const spec = specs.find((s) => s.name === token)
    if (!spec) continue

    it(`${token} sample includes the R currency symbol`, () => {
      expect(spec.sample.startsWith("R")).toBe(true)
    })
  }
})
