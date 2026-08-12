/**
 * POST /api/auth/login
 *
 * Password sign-in, proxied through the server so GoTrue's raw response never
 * reaches the browser.
 *
 * Signing in directly from the client leaked account state: a deactivated
 * account answers `user_banned` even when the password is wrong, while an
 * unknown address answers `invalid_credentials` — so anyone could enumerate
 * deactivated staff accounts with no password knowledge (QA 02, F02-6).
 * Every failure here returns one byte-identical body.
 *
 * Cookies stay client-side: this route holds no session of its own and hands
 * the tokens back for `supabase.auth.setSession()` to persist, exactly as the
 * browser client did before.
 */

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

/** One response for every failure — never say which part was wrong. */
function loginRejected() {
  return NextResponse.json({ error: "Invalid email or password." }, { status: 400 })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Sign-in is unavailable." }, { status: 500 })
  }

  let credentials: z.infer<typeof loginSchema>
  try {
    credentials = loginSchema.parse(await request.json())
  } catch {
    return loginRejected()
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  })

  if (error || !data.session || !data.user) {
    // Logged server-side only; the caller always gets the generic body.
    console.warn("[login] rejected:", error?.code ?? error?.message ?? "no session")
    return loginRejected()
  }

  // Belt and braces: an account whose profile is missing or deactivated gets no
  // tokens, even if the auth-level ban is somehow absent.
  const service = createServiceClient()
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("is_active")
    .eq("user_id", data.user.id)
    .maybeSingle()

  if (profileError || !profile || profile.is_active === false) {
    await supabase.auth.signOut()
    console.warn("[login] rejected: profile missing or inactive")
    return loginRejected()
  }

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  })
}
