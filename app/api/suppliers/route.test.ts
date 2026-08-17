import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const helperMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
}))

vi.mock("./helpers", async () => {
  const actual = await vi.importActual<typeof import("./helpers")>("./helpers")
  return {
    ...actual,
    allowedRoles: new Set(["admin", "manager"]),
    requireAuthenticatedUser: helperMocks.requireAuthenticatedUser,
  }
})

import { GET, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const PARENT_ID = "00000000-0000-4000-8000-0000000000b1"

function createUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

describe("GET /api/suppliers", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: createUnauthorizedResponse(),
    })

    const response = await GET(new Request("http://localhost/api/suppliers"))
    expect(response.status).toBe(401)
  })

  it("returns active suppliers by default", async () => {
    const orMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(async () => ({
          data: [
            {
              id: "00000000-0000-4000-8000-000000000010",
              slug: "blue-train",
              kind: "train_operator",
              status: "active",
              name: "Blue Train",
              email: null,
              phone: null,
              website: null,
              location: null,
              notes: null,
              active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        })),
      })),
    }))

    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== "suppliers") throw new Error(`Unexpected table ${table}`)
          return {
            select: vi.fn(() => ({
              or: orMock,
            })),
          }
        }),
      },
      user: { id: USER_ID },
    })

    const response = await GET(new Request("http://localhost/api/suppliers"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(orMock).toHaveBeenCalledWith("active.eq.true,status.eq.temporary")
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({ slug: "blue-train", name: "Blue Train" })
  })

  it("includes drafts when includeDrafts=true", async () => {
    const selectOrderMock = vi.fn(() => ({
      order: vi.fn(async () => ({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            slug: "draft-supplier",
            kind: "hotel_property",
            status: "draft",
            name: "Draft Supplier",
            email: null,
            phone: null,
            website: null,
            location: null,
            notes: null,
            active: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        error: null,
      })),
    }))

    const eqMock = vi.fn()
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== "suppliers") throw new Error(`Unexpected table ${table}`)
          return {
            select: vi.fn(() => ({
              order: selectOrderMock,
              eq: eqMock,
            })),
          }
        }),
      },
      user: { id: USER_ID },
    })

    const response = await GET(
      new Request("http://localhost/api/suppliers?includeDrafts=true"),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(eqMock).not.toHaveBeenCalled()
    expect(payload[0]).toMatchObject({ slug: "draft-supplier", status: "draft" })
  })

  it("returns 500 when supplier query fails", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: null,
                  error: { message: "boom" },
                })),
              })),
            })),
          })),
        })),
      },
      user: { id: USER_ID },
    })

    const response = await GET(new Request("http://localhost/api/suppliers"))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: "Failed to load suppliers" })
  })
})

describe("POST /api/suppliers", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: createUnauthorizedResponse(),
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    expect(response.status).toBe(401)
  })

  it("returns 403 when user lacks write role", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { clearance_level: "consultant" },
                  error: null,
                })),
              })),
            })),
          }
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", kind: "hotel_property" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("returns 400 with field errors for invalid payload", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { clearance_level: "manager" },
                  error: null,
                })),
              })),
            })),
          }
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hotel_property", name: "A", email: "bad" }),
      }),
    )

    const payload = await response.json()
    expect(response.status).toBe(400)
    expect(payload.error).toBe("Invalid request payload")
    expect(payload.details).toBeDefined()
  })

  it("creates supplier, resolves slug suffix, and deduplicates supplier emails", async () => {
    const supplierEmailsInsert = vi.fn(async () => ({ error: null }))
    const supplierInsertRows: Array<Record<string, unknown>> = []

    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { clearance_level: "manager" },
                    error: null,
                  })),
                })),
              })),
            }
          }

          if (table === "suppliers") {
            return {
              select: vi.fn((selection: string) => {
                if (selection === "slug") {
                  return {
                    or: vi.fn(async () => ({
                      data: [{ slug: "blue-train" }, { slug: "blue-train-2" }],
                      error: null,
                    })),
                  }
                }

                return {
                  single: vi.fn(async () => ({
                    data: {
                      id: "00000000-0000-4000-8000-000000000099",
                      slug: "blue-train-3",
                      kind: "train_operator",
                      status: "draft",
                      name: "Blue Train",
                      email: "sales@example.com",
                      phone: null,
                      website: null,
                      location: null,
                      notes: null,
                      single_supplement_pct: 0,
                      active: false,
                      created_at: "2026-01-01T00:00:00.000Z",
                      updated_at: "2026-01-01T00:00:00.000Z",
                    },
                    error: null,
                  })),
                }
              }),
              insert: vi.fn((row: Record<string, unknown>) => {
                supplierInsertRows.push(row)
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: "00000000-0000-4000-8000-000000000099",
                        slug: String(row.slug),
                        kind: row.kind,
                        status: "draft",
                        name: row.name,
                        email: row.email,
                        phone: row.phone,
                        website: row.website,
                        location: row.location,
                        notes: row.notes,
                        single_supplement_pct: row.single_supplement_pct,
                        active: row.active,
                        created_at: "2026-01-01T00:00:00.000Z",
                        updated_at: "2026-01-01T00:00:00.000Z",
                      },
                      error: null,
                    })),
                  })),
                }
              }),
            }
          }

          if (table === "supplier_emails") {
            return {
              insert: supplierEmailsInsert,
            }
          }

          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "train_operator",
          name: "Blue Train",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          emails: [
            { email: "Sales@Example.com", label: "Sales" },
            { email: "sales@example.com", label: "General" },
          ],
        }),
      }),
    )

    const payload = await response.json()
    expect(response.status).toBe(201)
    expect(supplierInsertRows[0]).toMatchObject({
      // `blue-train` and `blue-train-2` are taken, so the category is tried before a number.
      slug: "blue-train-train-operator",
      active: false,
      email: "Sales@Example.com",
      single_supplement_pct: 0,
    })
    expect(supplierEmailsInsert).toHaveBeenCalledTimes(1)
    expect(supplierEmailsInsert).toHaveBeenCalledWith([
      {
        supplier_id: "00000000-0000-4000-8000-000000000099",
        email: "Sales@Example.com",
        label: "Sales",
        // The surviving row after dedupe keeps position 0, so it stays the primary contact.
        sort_order: 0,
      },
    ])
    expect(payload.slug).toBe("blue-train-train-operator")
  })

  it("writes locationId as location_id for a non-train supplier and discards any free-text location it sends", async () => {
    const supplierInsertRows: Array<Record<string, unknown>> = []
    const LOCATION_ID = "00000000-0000-4000-8000-0000000000c1"

    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { clearance_level: "manager" },
                    error: null,
                  })),
                })),
              })),
            }
          }

          if (table === "suppliers") {
            return {
              select: vi.fn(() => ({
                or: vi.fn(async () => ({ data: [], error: null })),
              })),
              insert: vi.fn((row: Record<string, unknown>) => {
                supplierInsertRows.push(row)
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: "00000000-0000-4000-8000-000000000099",
                        slug: String(row.slug),
                        kind: row.kind,
                        status: "draft",
                        name: row.name,
                        email: row.email,
                        phone: row.phone,
                        website: row.website,
                        location: row.location,
                        location_id: row.location_id,
                        notes: row.notes,
                        single_supplement_pct: row.single_supplement_pct,
                        active: row.active,
                        created_at: "2026-01-01T00:00:00.000Z",
                        updated_at: "2026-01-01T00:00:00.000Z",
                      },
                      error: null,
                    })),
                  })),
                }
              }),
            }
          }

          if (table === "supplier_emails") {
            return { insert: vi.fn(async () => ({ error: null })) }
          }

          if (table === "app_settings") {
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({ data: [], error: null })),
              })),
            }
          }

          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "hotel_property",
          name: "The Silo Hotel",
          email: "",
          phone: "",
          website: "",
          // A hotel has no reason to send text here, but the route must not trust it either way --
          // only train_operator's free text is ever written.
          location: "CT",
          locationId: LOCATION_ID,
          notes: "",
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(supplierInsertRows[0]).toMatchObject({
      location: null,
      location_id: LOCATION_ID,
    })
  })

  it("returns 409 naming the category and location when the composite key collides", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { clearance_level: "manager" },
                    error: null,
                  })),
                })),
              })),
            }
          }
          if (table === "suppliers") {
            return {
              select: vi.fn(() => ({
                or: vi.fn(async () => ({ data: [], error: null })),
              })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { code: "23505" },
                  })),
                })),
              })),
            }
          }
          if (table === "app_settings") {
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({ data: [], error: null })),
              })),
            }
          }

          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "hotel_property",
          name: "Duplicate Name",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
        }),
      }),
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'A Hotel supplier named "Duplicate Name" already exists at this location.',
    })
  })

  it("links to a sibling record and leaves its email rows to the database trigger", async () => {
    const supplierInsertRows: Record<string, unknown>[] = []
    const supplierEmailsInsert = vi.fn(async () => ({ error: null }))

    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { clearance_level: "manager" },
                    error: null,
                  })),
                })),
              })),
            }
          }

          if (table === "suppliers") {
            return {
              select: vi.fn((selection: string) => {
                if (selection === "slug") {
                  return { or: vi.fn(async () => ({ data: [], error: null })) }
                }
                // The parent lookup.
                return {
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: PARENT_ID,
                        name: "Toyota",
                        kind: "hotel_property",
                        parent_supplier_id: null,
                      },
                      error: null,
                    })),
                  })),
                }
              }),
              insert: vi.fn((row: Record<string, unknown>) => {
                supplierInsertRows.push(row)
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: "00000000-0000-4000-8000-0000000000aa",
                        slug: String(row.slug),
                        kind: row.kind,
                        status: "draft",
                        name: row.name,
                        // Mirrored onto the row by tr_supplier_inherit_contacts.
                        email: "hotel@toyota.test",
                        phone: "+27 11 000 0000",
                        website: null,
                        location: null,
                        notes: null,
                        single_supplement_pct: 0,
                        active: false,
                        parent_supplier_id: row.parent_supplier_id,
                        created_at: "2026-01-01T00:00:00.000Z",
                        updated_at: "2026-01-01T00:00:00.000Z",
                      },
                      error: null,
                    })),
                  })),
                }
              }),
            }
          }

          if (table === "supplier_emails") {
            return { insert: supplierEmailsInsert }
          }

          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transfers",
          name: "Toyota",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          emails: [{ email: "ignored@toyota.test", label: "General" }],
          parentSupplierId: PARENT_ID,
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(supplierInsertRows[0]).toMatchObject({ parent_supplier_id: PARENT_ID })
    // The trigger copies the parent's addresses down; writing the submitted ones here would only
    // be overwritten.
    expect(supplierEmailsInsert).not.toHaveBeenCalled()
  })

  it("rejects linking to a supplier in the same category", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { clearance_level: "manager" },
                    error: null,
                  })),
                })),
              })),
            }
          }
          if (table === "suppliers") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: PARENT_ID,
                      name: "Toyota",
                      kind: "transfers",
                      parent_supplier_id: null,
                    },
                    error: null,
                  })),
                })),
              })),
            }
          }
          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID },
    })

    const response = await POST(
      new Request("http://localhost/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transfers",
          name: "Toyota",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          parentSupplierId: PARENT_ID,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Link a supplier to a record in a different category.",
    })
  })
})
