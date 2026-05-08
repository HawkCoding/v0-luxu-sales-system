import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { flattenZod, jsonError, jsonZodError, safeSupabaseError } from "./responses"

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
