/**
 * GET /auth/signed-out
 *
 * Clears the Supabase session cookies and sends the user to /login with a
 * reason. Server Components cannot write cookies, so the app layout redirects
 * here instead of straight to /login when it rejects a session — without this
 * the layout and the proxy bounce each other forever (QA 02, F02-1).
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_REASONS = ["account-inactive", "unauthorized", "auth-failed"] as const

type SignedOutReason = (typeof ALLOWED_REASONS)[number]

export function resolveSignedOutReason(rawReason: string | null): SignedOutReason {
  return ALLOWED_REASONS.includes(rawReason as SignedOutReason)
    ? (rawReason as SignedOutReason)
    : "auth-failed"
}

export async function GET(request: NextRequest) {
  const reason = resolveSignedOutReason(request.nextUrl.searchParams.get("reason"))
  const cookieStore = await cookies()

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/login"
  redirectUrl.search = `?error=${reason}`
  const response = NextResponse.redirect(redirectUrl)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Failed to revoke session while signing out", error)
    }
  }

  // Defensive: drop anything the sign-out left behind so the proxy cannot see a
  // user on the next request and bounce back to /app.
  cookieStore.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      response.cookies.delete(name)
    }
  })

  return response
}
