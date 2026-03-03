import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"

const rowSchema = z.object({
  title: z.string().trim().max(50).nullable().optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
})

const payloadSchema = z.object({
  customers: z.array(rowSchema).min(1).max(1000),
  mode: z.enum(["scan", "csv"]).optional(),
})

const allowedRoles = new Set(["admin", "manager", "consultant"])

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let parsed: z.infer<typeof payloadSchema>
  try {
    parsed = payloadSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const normalizedRows = parsed.customers.map((row) => ({
    title: row.title || null,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: row.email.trim().toLowerCase(),
    phone: row.phone?.trim() || null,
    country: row.country?.trim() || null,
  }))

  const uniqueEmails = Array.from(new Set(normalizedRows.map((row) => row.email)))
  const { data: existingRows, error: existingError } = await supabase
    .from("customers")
    .select("email")
    .in("email", uniqueEmails)

  if (existingError)
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 })

  const existingEmailSet = new Set((existingRows ?? []).map((row) => row.email.toLowerCase()))
  const duplicates = uniqueEmails.filter((email) => existingEmailSet.has(email))
  const seenPayloadEmails = new Set<string>()
  const payloadDuplicates: string[] = []

  const insertRows = normalizedRows.filter((row) => {
    if (existingEmailSet.has(row.email)) return false
    if (seenPayloadEmails.has(row.email)) {
      payloadDuplicates.push(row.email)
      return false
    }
    seenPayloadEmails.add(row.email)
    return true
  })
  const combinedDuplicates = Array.from(new Set([...duplicates, ...payloadDuplicates]))
  const actorLabel =
    [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email || "system"

  async function writeImportAudit(inserted: number) {
    await supabase.from("audit_logs").insert({
      actor: actorLabel,
      entity_type: "Customer",
      entity_id: "bulk_import",
      action: "bulk_imported",
      meta_json: {
        mode: parsed.mode ?? "unknown",
        requested_rows: normalizedRows.length,
        inserted_rows: inserted,
        duplicate_rows: combinedDuplicates.length,
        invalid_rows: 0,
      },
    })
  }

  if (insertRows.length === 0) {
    await writeImportAudit(0)
    return NextResponse.json({
      inserted: 0,
      duplicates: combinedDuplicates,
      invalidRows: 0,
    })
  }

  const { error: insertError } = await supabase.from("customers").insert(insertRows)
  if (insertError)
    return NextResponse.json({ error: "Failed to import customers" }, { status: 500 })
  await writeImportAudit(insertRows.length)

  return NextResponse.json({
    inserted: insertRows.length,
    duplicates: combinedDuplicates,
    invalidRows: 0,
  })
}
