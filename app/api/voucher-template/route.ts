import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"

const patchSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  banner_url: z.string().url().nullable().optional(),
  header_text: z.string().min(1).optional(),
  product_line: z.string().min(1).optional(),
  accent_colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  section_bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  font_family: z.string().min(1).optional(),
  section_order: z.array(z.enum(["guest_info", "service_provider", "footer"])).optional(),
  hidden_sections: z.array(z.enum(["guest_info", "service_provider", "footer"])).optional(),
  footer_company: z.string().optional(),
  footer_phone: z.string().optional(),
  footer_email: z.string().optional(),
  guidance_text: z.string().optional(),
})

export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("voucher_template")
    .select("id, logo_url, banner_url, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text")
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json(VOUCHER_TEMPLATE_DEFAULTS)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (!profile || profile.clearance_level !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("voucher_template")
    .select("id")
    .limit(1)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "Template record not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("voucher_template")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", existing.id)

  if (error) {
    return safeSupabaseError("voucher-template", error)
  }

  return NextResponse.json({ success: true })
}
