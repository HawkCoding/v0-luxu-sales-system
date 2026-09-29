import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { renderSignatureFragment } from "@/lib/email/render-signature"
import { resolveEmailSignature, type SignatureBrandRowOverrides } from "@/lib/email/signature"
import { signatureBrandTextFieldsSchema } from "@/lib/email/signature-brands"
import { sanitizeSignatureHtml } from "@/lib/email/signature-html"

const ADMIN_ROLES = ["admin", "manager"]

/** Unsaved brand text from the Settings editor — same field limits as the brand PATCH. */
const draftSchema = signatureBrandTextFieldsSchema.pick({
  companyLine: true,
  registrationLine: true,
  tradingHours: true,
  divisionsLine: true,
  confidentiality: true,
  officeAddress: true,
  senderLayout: true,
})

const bodySchema = z.object({
  brandId: z.string().uuid().nullish(),
  profileId: z.string().uuid().nullish(),
  /** Optional draft overrides for `brandId`, so the editor can preview before saving. */
  draft: draftSchema.optional(),
})

type BrandDraft = z.infer<typeof draftSchema>

/** Map draft fields to row columns, sanitized exactly like PATCH /api/settings/signature-brands/[id]. */
function toRowOverrides(draft: BrandDraft): SignatureBrandRowOverrides {
  const clean = (value: string | null | undefined) =>
    value === null ? null : value !== undefined ? sanitizeSignatureHtml(value) : undefined
  const entries: [keyof SignatureBrandRowOverrides, string | null | undefined][] = [
    ["company_line", clean(draft.companyLine)],
    ["registration_line", clean(draft.registrationLine)],
    ["trading_hours", clean(draft.tradingHours)],
    ["divisions_line", clean(draft.divisionsLine)],
    ["confidentiality", clean(draft.confidentiality)],
    ["office_address", clean(draft.officeAddress)],
    ["sender_layout", clean(draft.senderLayout)],
  ]
  const overrides: SignatureBrandRowOverrides = {}
  for (const [column, value] of entries) {
    if (value !== undefined) overrides[column] = value
  }
  return overrides
}

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

  const { brandId, profileId, draft } = parsed.data
  const targetProfileId = profileId ?? auth.value.user.id

  const isSelf = targetProfileId === auth.value.user.id
  const isAdmin = ADMIN_ROLES.includes(auth.value.profile.clearanceLevel)
  if (!isSelf && !isAdmin) {
    return jsonError("Forbidden", 403)
  }

  const overrides = draft && brandId ? toRowOverrides(draft) : undefined
  const signature = overrides
    ? await resolveEmailSignature(targetProfileId, brandId, overrides)
    : await resolveEmailSignature(targetProfileId, brandId)
  const html = signature ? await renderSignatureFragment(signature) : ""

  return Response.json({ html })
}
