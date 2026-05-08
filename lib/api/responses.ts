import { NextResponse } from "next/server"
import { ZodError } from "zod"

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
