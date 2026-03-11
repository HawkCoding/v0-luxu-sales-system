import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const STALE_REFRESH_TOKEN_MESSAGES = [
  "Invalid Refresh Token",
  "Refresh Token Not Found",
  "refresh_token_not_found",
]

function isStaleRefreshTokenError(error: unknown) {
  if (!error) return false

  const errorMessage =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error)

  return STALE_REFRESH_TOKEN_MESSAGES.some((message) => errorMessage.includes(message))
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      response.cookies.delete(name)
    }
  })
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Refresh expired Auth token — keeps user sessions alive.
  // Must not run any code between createServerClient and getUser that writes cookies.
  try {
    const { data, error } = await supabase.auth.getUser()
    if (request.nextUrl.pathname === "/login" && data.user) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/app"
      redirectUrl.search = ""

      const redirectResponse = NextResponse.redirect(redirectUrl)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie)
      })

      return redirectResponse
    }
  } catch (error) {
    if (isStaleRefreshTokenError(error)) {
      clearSupabaseCookies(request, supabaseResponse)
      return supabaseResponse
    }

    throw error
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
