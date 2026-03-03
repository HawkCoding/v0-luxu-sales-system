import { NextResponse } from "next/server"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"

function getSafeNextPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/")) return "/app"
  return rawNext
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = getSafeNextPath(searchParams.get("next"))

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth-failed`)
  }

  const supabase = await createSessionClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth-failed`)
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user?.email) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=auth-failed`)
  }

  const email = user.email.toLowerCase().trim()
  const service = createServiceClient()

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle()

  if (profileError || !profile) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized`)
  }

  const hasLinkedUserId = Boolean(profile.user_id?.trim())
  if (hasLinkedUserId && profile.user_id !== user.id) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=account-link-mismatch`)
  }

  if (!hasLinkedUserId) {
    const { error: linkError } = await service
      .from("profiles")
      .update({ user_id: user.id })
      .ilike("email", email)

    if (linkError) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=auth-failed`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
