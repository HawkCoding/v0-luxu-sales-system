import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { renderSignatureFragment } from "@/lib/email/render-signature"
import { resolveEmailSignature } from "@/lib/email/signature"

const ADMIN_ROLES = ["admin", "manager"]

const bodySchema = z.object({
  brandId: z.string().uuid().nullish(),
  profileId: z.string().uuid().nullish(),
})

/**
 * Renders a signature fragment on demand so the send dialog can swap brands
 * without re-fetching or re-splicing the whole composed email. Calls the
 * same resolveEmailSignature + renderSignatureFragment pair compose uses, so
 * the swapped-in fragment is byte-identical to what was originally embedded.
 */
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { brandId, profileId } = parsed.data
  const targetProfileId = profileId ?? auth.value.user.id

  const isSelf = targetProfileId === auth.value.user.id
  const isAdmin = ADMIN_ROLES.includes(auth.value.profile.clearanceLevel)
  if (!isSelf && !isAdmin) {
    return jsonError("Forbidden", 403)
  }

  const signature = await resolveEmailSignature(targetProfileId, brandId)
  const html = signature ? await renderSignatureFragment(signature) : ""

  return Response.json({ html })
}
