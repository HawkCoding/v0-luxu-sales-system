import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { createSessionClient } from "@/lib/supabase/server"
import { composeFromTemplate } from "@/lib/templates/compose-email"
import { getSampleTokens } from "@/lib/templates/registry"

const previewSchema = z.object({
  key: z.string().min(1).max(120),
  subject: z.string().max(500),
  bodyHtml: z.string().max(200_000),
})

// Render a full branded preview of a template using the registry's sample
// token values, so managers see what the customer will receive — including
// warnings for tokens the send flow will not supply.
export async function POST(req: Request) {
  // Mirrors "view:templates" — a preview renders template content, so it needs
  // the same gate as GET /api/templates.
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = previewSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { key, subject, bodyHtml } = parsed.data
  const sample = getSampleTokens(key)

  // Sample values are static, so the supplier token would otherwise show a
  // spelling that exists nowhere in Suppliers. Preview with a real record so
  // managers see the exact name, spacing and capitalisation customers get.
  if (sample.tokens.supplierName) {
    const supabase = await createSessionClient()
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("kind", "train_operator")
      .eq("active", true)
      .order("name")
      .limit(1)
      .maybeSingle()
    if (supplier?.name) sample.tokens.supplierName = supplier.name
  }

  const composed = await composeFromTemplate(
    { subject, bodyHtml },
    { ...sample, senderProfileId: auth.value.user.id },
  )

  return Response.json({
    subject: composed.subject,
    html: composed.bodyHtml,
    warnings: composed.warnings,
  })
}
