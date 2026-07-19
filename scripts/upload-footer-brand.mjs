#!/usr/bin/env node
/**
 * Uploads the committed SARAIL footer logo into the public `voucher-assets`
 * bucket, where the email layout reads it from (emails need an absolute URL;
 * the PDFs read the same file straight off disk).
 *
 * The bucket is storage, not schema, so migrations do not carry this asset to
 * dev or production — this script is how it gets there. Run it once per
 * environment, and again after replacing the logo:
 *
 *   # local (reads .env.local)
 *   pnpm assets:brand:push
 *
 *   # dev / production — point the env at that project for the one command
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   pnpm assets:brand:push
 *
 * Idempotent: uploads with upsert, so re-running is the whole swap procedure —
 * no code change and no deploy needed to change the logo.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

// Keep in sync with lib/assets/footer-brand.ts.
const BUCKET = "voucher-assets"
const OBJECT_PATH = "brand/sarail-footer-logo.png"
const LOCAL_PATH = "assets/brand/sarail-footer-logo.png"

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const contents = readFileSync(filePath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue
    const [name, ...valueParts] = line.split("=")
    // Ambient env wins, so a caller can target dev/prod without editing files.
    if (process.env[name]) continue
    let value = valueParts.join("=").trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

loadEnvFile(path.join(repoRoot, ".env.local"))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.")
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set.")

const logoFile = path.join(repoRoot, ...LOCAL_PATH.split("/"))
if (!existsSync(logoFile)) {
  fail(`No logo at ${LOCAL_PATH}. Commit the PNG there first.`)
}

const body = readFileSync(logoFile)

console.log(`→ Uploading ${LOCAL_PATH} (${(body.length / 1024).toFixed(1)} KB) to ${supabaseUrl}`)

const response = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "image/png",
    "Cache-Control": "max-age=31536000",
    "x-upsert": "true",
  },
  body,
})

if (!response.ok) {
  const detail = await response.text().catch(() => "")
  fail(`Upload failed (${response.status}): ${detail || response.statusText}`)
}

const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`
console.log(`✓ Uploaded. Verify it loads in a browser:\n  ${publicUrl}`)
