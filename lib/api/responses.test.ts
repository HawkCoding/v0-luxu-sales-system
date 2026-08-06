import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { PostgrestError } from "@supabase/supabase-js"

import { flattenZod, jsonError, jsonZodError, mapPostgrestError, safeSupabaseError } from "./responses"

function makePostgrestError(overrides: Partial<PostgrestError>): PostgrestError {
  return { message: "boom", details: "", hint: "", code: "", name: "PostgrestError", ...overrides }
}

describe("jsonError", () => {
  it("returns the requested status with only an error message when no details supplied", async () => {
    const response = jsonError("Boom", 418)
    expect(response.status).toBe(418)
    expect(await response.json()).toEqual({ error: "Boom" })
  })

  it("includes details when provided", async () => {
    const response = jsonError("Bad", 400, { field: ["required"] })
    expect(await response.json()).toEqual({ error: "Bad", details: { field: ["required"] } })
  })
})

describe("flattenZod", () => {
  it("flattens to fieldErrors", () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() })
    const parsed = schema.safeParse({ name: "", age: "x" })
    if (parsed.success) throw new Error("expected failure")
    const flat = flattenZod(parsed.error)
    expect(flat.name).toBeDefined()
    expect(flat.age).toBeDefined()
  })
})

describe("jsonZodError", () => {
  it("returns 400 with a flattened details object", async () => {
    const schema = z.object({ name: z.string().min(1) })
    const parsed = schema.safeParse({ name: "" })
    if (parsed.success) throw new Error("expected failure")
    const response = jsonZodError(parsed.error)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe("Invalid request body")
    expect(body.details).toMatchObject({ name: expect.any(Array) })
  })
})

describe("safeSupabaseError", () => {
  it("logs the cause and returns a sanitised 500 response", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = safeSupabaseError("scope:test", new Error("internal column does not exist"))
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: "Database error" })
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe("mapPostgrestError", () => {
  it("maps a duplicate email unique violation to a DUPLICATE_EMAIL 409, without echoing the raw message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const error = makePostgrestError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "customers_email_unique"',
        details: "Key (lower(email))=(jane@example.com) already exists.",
      })
      const response = mapPostgrestError("scope:test", error)
      expect(response?.status).toBe(409)
      const body = await response?.json()
      expect(body.code).toBe("DUPLICATE_EMAIL")
      expect(body.error).not.toContain("jane@example.com")
      expect(body.error).not.toContain("customers_email_unique")
    } finally {
      spy.mockRestore()
    }
  })

  it("maps a generic unique violation to a 409 without a specific code", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const error = makePostgrestError({ code: "23505", message: "duplicate key value violates unique constraint \"foo_unique\"" })
      const response = mapPostgrestError("scope:test", error)
      expect(response?.status).toBe(409)
    } finally {
      spy.mockRestore()
    }
  })

  it("maps a foreign key violation to 400", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = mapPostgrestError("scope:test", makePostgrestError({ code: "23503" }))
      expect(response?.status).toBe(400)
    } finally {
      spy.mockRestore()
    }
  })

  it("maps a check violation to 400", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = mapPostgrestError("scope:test", makePostgrestError({ code: "23514" }))
      expect(response?.status).toBe(400)
    } finally {
      spy.mockRestore()
    }
  })

  it("maps a not-null violation to 400", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = mapPostgrestError("scope:test", makePostgrestError({ code: "23502" }))
      expect(response?.status).toBe(400)
    } finally {
      spy.mockRestore()
    }
  })

  it("maps an RLS/permission failure to 403", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = mapPostgrestError("scope:test", makePostgrestError({ code: "42501" }))
      expect(response?.status).toBe(403)
    } finally {
      spy.mockRestore()
    }
  })

  it("returns null for an unmapped code so the caller can fall back", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = mapPostgrestError("scope:test", makePostgrestError({ code: "99999" }))
      expect(response).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
