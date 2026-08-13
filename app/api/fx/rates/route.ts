import { NextResponse } from "next/server"
import { z } from "zod"
import { safeSupabaseError } from "@/lib/api/responses"
import { createSessionClient } from "@/lib/supabase/server"
import { getRates, upsertManualRate } from "@/lib/fx/rates"
import { SUPPORTED_CURRENCY_VALUES } from "@/lib/types"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const managerRoles = new Set(["admin", "manager"])

const patchSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCY_VALUES),
  // Four decimals matches the editable input and lib/pricing/convert-currency's roundFxRate, so
  // a hand-typed rate round-trips unchanged. Bounded to catch a fat-fingered decimal point.
  rate: z.number().positive().max(10_000),
})

async function getAuthenticatedContext() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  const actorName =
    [profile.name, profile.surname].filter(Boolean).join(" ").trim() ||
    profile.email ||
    user.email ||
    "unknown"

  return {
    ok: true as const,
    value: {
      supabase,
      userId: user.id,
      actorName,
      canEdit: managerRoles.has(profile.clearance_level),
    },
  }
}

/** Cached rates, refreshed from the provider only if they have aged past the TTL. Every
 *  authenticated user can read: a salesperson has to see the rate to quote with it. */
export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  try {
    const result = await getRates(context.value.supabase)
    return NextResponse.json({ ...result, canEdit: context.value.canEdit })
  } catch (error) {
    return safeSupabaseError("fx/rates", error)
  }
}

/** The ↻ button: force a live fetch, overwriting manual overrides. Manager/admin only. */
export async function POST() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  if (!context.value.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await getRates(context.value.supabase, { forceRefresh: true })

    if (result.stale) {
      // The cache is intact and still usable, so this is a soft failure the UI can show inline
      // rather than an error that empties the dialog.
      return NextResponse.json(
        { ...result, canEdit: true, warning: "Could not reach the rate provider. Showing the last saved rates." },
        { status: 200 },
      )
    }

    return NextResponse.json({ ...result, canEdit: true })
  } catch (error) {
    return safeSupabaseError("fx/rates", error)
  }
}

/** Saves a hand-edited rate as the shared default. A salesperson nudging a rate for one quote
 *  does not come through here — that override is stamped onto the quote's own lines. */
export async function PATCH(req: Request) {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  if (!context.value.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const before = await getRates(context.value.supabase)
    await upsertManualRate(context.value.supabase, parsed.data.currency, parsed.data.rate)
    const after = await getRates(context.value.supabase)

    await writeAuditLog(context.value.supabase, {
      actor: context.value.actorName,
      actorUserId: context.value.userId,
      entityType: "Settings",
      entityId: `fx_rate:${parsed.data.currency}`,
      action: "settings_changed",
      before: { rate: before.rates[parsed.data.currency] ?? null },
      after: { rate: parsed.data.rate },
      meta: settingAuditMeta(`fx_rate_${parsed.data.currency.toLowerCase()}`),
    })

    return NextResponse.json({ ...after, canEdit: true })
  } catch (error) {
    return safeSupabaseError("fx/rates", error)
  }
}
