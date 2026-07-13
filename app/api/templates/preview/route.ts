import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
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
  const auth = await requireUser()
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
  const composed = await composeFromTemplate({ subject, bodyHtml }, getSampleTokens(key))

  return Response.json({
    subject: composed.subject,
    html: composed.bodyHtml,
    warnings: composed.warnings,
  })
}
