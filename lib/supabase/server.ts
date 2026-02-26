import { createServerClient as createSSRServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database } from "./types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cookie-based SSR client — reads the logged-in user's JWT from request cookies.
// Use this in internal API routes and Server Components so RLS is enforced.
export async function createSessionClient() {
  const cookieStore = await cookies()
  return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll called from a Server Component — safe to ignore
        }
      },
    },
  })
}

// Service-role client — bypasses RLS entirely.
// Use ONLY in trusted server-side contexts (e.g. /api/enquiries public intake route,
// background jobs, migrations). Never expose this client to the browser.
export function createServiceClient() {
  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (never commit it)."
    )
  }
  if (!supabaseServiceKey.includes(".")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY appears invalid. Use the full service_role JWT from Supabase Dashboard -> Project Settings -> API."
    )
  }
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
