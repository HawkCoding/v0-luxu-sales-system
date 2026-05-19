#!/usr/bin/env node
/**
 * One-time data-move script: copy historical payment-proof blobs from the
 * `payment-proofs` bucket into the new general `attachments` bucket, and
 * update the corresponding `documents.storage_path` to point at the new
 * location.
 *
 * Safe to run repeatedly: skips documents whose `storage_path` already lives
 * under `/proof_of_payment/` in the attachments bucket.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-payment-proofs.mjs [--dry-run]
 *
 * Requires service-role credentials — do not run from any client context.
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, booking_id, payment_id, storage_path")
    .eq("kind", "proof_of_payment")

  if (error) {
    console.error("Failed to fetch payment_proof documents:", error)
    process.exit(1)
  }

  let migrated = 0
  let skipped = 0

  for (const doc of docs ?? []) {
    if (!doc.storage_path) {
      skipped++
      continue
    }
    if (doc.storage_path.includes("/proof_of_payment/")) {
      skipped++
      continue
    }

    const fileName = doc.storage_path.split("/").pop() ?? "proof"
    const newPath = `${doc.booking_id}/proof_of_payment/${doc.payment_id ?? doc.id}-${fileName}`

    if (DRY_RUN) {
      console.log(`[dry-run] ${doc.storage_path} -> ${newPath}`)
      migrated++
      continue
    }

    const { data: download, error: dlError } = await supabase.storage
      .from("payment-proofs")
      .download(doc.storage_path)
    if (dlError || !download) {
      console.error(`download failed for ${doc.storage_path}:`, dlError)
      continue
    }

    const buffer = Buffer.from(await download.arrayBuffer())
    const { error: upError } = await supabase.storage
      .from("attachments")
      .upload(newPath, buffer, { contentType: download.type, upsert: false })
    if (upError) {
      console.error(`upload failed for ${newPath}:`, upError)
      continue
    }

    const { error: docUpdateError } = await supabase
      .from("documents")
      .update({ storage_path: newPath })
      .eq("id", doc.id)
    if (docUpdateError) {
      console.error(`documents update failed for ${doc.id}:`, docUpdateError)
      continue
    }

    if (doc.payment_id) {
      await supabase
        .from("payments")
        .update({ proof_storage_path: newPath })
        .eq("id", doc.payment_id)
    }

    const { error: rmError } = await supabase.storage
      .from("payment-proofs")
      .remove([doc.storage_path])
    if (rmError) {
      console.warn(`(non-fatal) legacy blob remove failed for ${doc.storage_path}:`, rmError)
    }

    migrated++
    console.log(`migrated ${doc.storage_path} -> ${newPath}`)
  }

  console.log(`Done. migrated=${migrated}, skipped=${skipped}, dryRun=${DRY_RUN}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
