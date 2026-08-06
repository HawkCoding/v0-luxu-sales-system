import { NextResponse } from "next/server"
import { ZodError } from "zod"
import type { PostgrestError } from "@supabase/supabase-js"

export type ApiErrorBody = { error: string; details?: unknown }

export function jsonError(error: string, status: number, details?: unknown): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error }
  if (details !== undefined) body.details = details
  return NextResponse.json(body, { status })
}

export function flattenZod(error: ZodError): Record<string, string[] | undefined> {
  return error.flatten().fieldErrors
}

export function jsonZodError(error: ZodError, message = "Invalid request body"): NextResponse<ApiErrorBody> {
  return jsonError(message, 400, flattenZod(error))
}

export function safeSupabaseError(
  scope: string,
  cause: unknown,
  message = "Database error",
  status = 500,
): NextResponse<ApiErrorBody> {
  console.error(`supabase:${scope}`, cause)
  return jsonError(message, status)
}

/**
 * Translate a Postgres constraint/permission failure into a user-facing
 * response, without leaking `error.message`/`error.details`. Returns null
 * when the error code isn't one we have a specific mapping for, so the
 * caller can fall back to `safeSupabaseError`.
 */
export function mapPostgrestError(
  scope: string,
  error: PostgrestError,
): NextResponse<ApiErrorBody & { code?: string }> | null {
  console.error(`supabase:${scope}`, error)

  switch (error.code) {
    case "23505":
      if (error.message.includes("customers_email_unique")) {
        return NextResponse.json(
          { error: "That email already belongs to another customer.", code: "DUPLICATE_EMAIL" },
          { status: 409 },
        )
      }
      return jsonError("That value is already used by another record.", 409)
    case "23503":
      return jsonError("A record this change refers to no longer exists.", 400)
    case "23514":
      return jsonError("That value isn't allowed for this field.", 400)
    case "23502":
      return jsonError("A required field is missing.", 400)
    case "42501":
      return jsonError("You don't have permission to make this change.", 403)
    default:
      return null
  }
}
