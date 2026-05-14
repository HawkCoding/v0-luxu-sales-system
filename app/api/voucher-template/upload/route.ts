import { NextResponse } from "next/server"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { createSessionClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"

const ALLOWED_KINDS = ["logo", "banner"] as const
type UploadKind = (typeof ALLOWED_KINDS)[number]

const BUCKET = "voucher-assets"
const DIRECT_UPLOAD_MIME = "image/svg+xml"
const CROPPED_MIME_BY_KIND: Record<UploadKind, "image/png" | "image/webp"> = {
  logo: "image/png",
  banner: "image/webp",
}
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
}

function isUploadKind(value: string | null): value is UploadKind {
  return Boolean(value && (ALLOWED_KINDS as readonly string[]).includes(value))
}

function isAllowedVoucherAsset(file: File, kind: UploadKind): boolean {
  if (file.type === DIRECT_UPLOAD_MIME) return true
  return file.type === CROPPED_MIME_BY_KIND[kind]
}

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (!profile || profile.clearance_level !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const kind = formData.get("kind") as string | null

  if (!file || !isUploadKind(kind)) {
    return NextResponse.json({ error: "Missing or invalid file/kind" }, { status: 400 })
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: `File too large. Maximum image size is ${MAX_IMAGE_MB} MB.` }, { status: 413 })
  }

  if (!isAllowedVoucherAsset(file, kind)) {
    return NextResponse.json(
      {
        error:
          kind === "banner"
            ? "Banner uploads must be cropped to WebP or provided as SVG."
            : "Logo uploads must be cropped to PNG or provided as SVG.",
      },
      { status: 400 },
    )
  }

  const ext = EXTENSION_BY_MIME[file.type]
  const path = `${kind}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Bust the browser cache by appending a timestamp query param
  const url = `${publicUrl}?t=${Date.now()}`

  // Persist URL back to voucher_template row
  const column = kind === "logo" ? "logo_url" : "banner_url"
  const { data: existing, error: templateLookupError } = await supabase
    .from("voucher_template")
    .select(`id, ${column}`)
    .limit(1)
    .single()

  if (templateLookupError || !existing) {
    return NextResponse.json({ error: "Template record not found" }, { status: 500 })
  }

  const { error: templateUpdateError } = await supabase
    .from("voucher_template")
    .update({ [column]: url, updated_at: new Date().toISOString() })
    .eq("id", existing.id)

  if (templateUpdateError) {
    return NextResponse.json({ error: templateUpdateError.message }, { status: 500 })
  }

  const actorName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email || user.email || "system"
  const previousUrl = ((existing as Record<string, unknown>)[column] ?? null) as Json
  const auditResult = await writeAuditLog(supabase, {
    actor: actorName,
    actorUserId: user.id,
    entityType: "Settings",
    entityId: "voucher_template",
    action: "settings_changed",
    before: { [column]: previousUrl },
    after: { [column]: url },
    meta: {
      ...settingAuditMeta("voucher_template"),
      asset_kind: kind,
      file_name: file.name,
      file_size: file.size,
    },
  })
  if (auditResult.error) {
    return NextResponse.json({ error: "Failed to write settings audit log" }, { status: 500 })
  }

  return NextResponse.json({ url })
}
