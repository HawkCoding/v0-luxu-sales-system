/**
 * Syncs the hosted Supabase auth settings that password recovery depends on.
 *
 * Two things live in Supabase's own database rather than this repo, so a code
 * deploy cannot carry them (QA 02, F02-7):
 *
 *  1. `uri_allow_list` must contain `<site_url>/auth/confirm`. Supabase silently
 *     ignores a return URL that is not on the list and substitutes `site_url`,
 *     which would drop a user resetting their password on the app root instead
 *     of the "choose a new password" screen.
 *  2. The recovery email template must link with `token_hash`, not the default
 *     PKCE `code`. A `code` link only works in the browser that requested it,
 *     because the verifier is a cookie there — "request on desktop, open on
 *     phone" fails.
 *
 * Patches only those fields. Everything else on the hosted auth config —
 * rate limits, external providers, JWT expiry — is read but never written, which
 * is why this exists instead of `supabase config push` (that would carry this
 * repo's local-only `[auth]` values into a hosted project).
 *
 * Usage:
 *   node scripts/sync-auth-recovery-config.mjs --target dev
 *   node scripts/sync-auth-recovery-config.mjs --target dev --apply
 *   ALLOW_PRODUCTION_AUTH_CONFIG_PUSH=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION \
 *     node scripts/sync-auth-recovery-config.mjs --target prod --apply
 *
 * Dry run is the default. Reads SUPABASE_ACCESS_TOKEN and the project ref from
 * .env.local / .env.sync.local; neither is ever printed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const MANAGEMENT_API = "https://api.supabase.com"
const RECOVERY_TEMPLATE_PATH = path.join(repoRoot, "supabase", "templates", "recovery.html")
const RECOVERY_SUBJECT = "Reset your Luxus Sales password"
const CONFIRM_PATH = "/auth/confirm"
const PRODUCTION_OPT_IN = "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"

// Where each hosted environment's app actually lives. `site_url` is what Supabase
// falls back to for every auth email link, and only origins on the allow-list may
// be used as a return URL — both projects shipped with an empty allow-list and a
// localhost site_url, so every hosted reset link pointed at localhost.
// Override per run with SUPABASE_DEV_APP_URL / SUPABASE_PROD_APP_URL.
const TARGETS = {
  dev: {
    label: "development",
    refEnv: "SUPABASE_DEV_PROJECT_REF",
    appUrlEnv: "SUPABASE_DEV_APP_URL",
    appUrl: "https://v0-luxu-sales-system-git-dev-hawkcoding-projects.vercel.app",
    // Local dev sometimes runs against the hosted dev project. Harmless to allow
    // here — a localhost return URL is only reachable from the user's own machine.
    // Never on production.
    extraOrigins: ["http://localhost:3000"],
    isProduction: false,
  },
  prod: {
    label: "production",
    refEnv: "SUPABASE_PROD_PROJECT_REF",
    appUrlEnv: "SUPABASE_PROD_APP_URL",
    appUrl: "https://tools.luxustravel.co.za",
    isProduction: true,
  },
}

/** Paths that may be used as an auth return URL. */
const REDIRECT_PATHS = [
  CONFIRM_PATH, // token_hash recovery links
  "/auth/callback", // legacy PKCE links and Microsoft OAuth
]

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue

    const [name, ...valueParts] = line.split("=")
    if (process.env[name]) continue

    let value = valueParts.join("=").trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

function parseArgs(argv) {
  const args = { target: null, apply: false, skipTemplate: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--skip-template") {
      // For an environment whose deployed code predates /auth/confirm: fix the
      // allow-list and site_url now, switch the email template after the deploy.
      args.skipTemplate = true
    } else if (arg === "--target") {
      args.target = argv[i + 1]
      i += 1
    } else if (arg.startsWith("--target=")) {
      args.target = arg.slice("--target=".length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!args.target || !TARGETS[args.target]) {
    throw new Error("Pass --target dev or --target prod.")
  }

  return args
}

function requireEnv(name, hint) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. ${hint}`)
  return value
}

async function callManagementApi(pathname, token, init = {}) {
  const response = await fetch(`${MANAGEMENT_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  const body = await response.text()
  if (!response.ok) {
    // Never echo the request headers — the token is in there.
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${response.status} ${body.slice(0, 400)}`)
  }

  return body ? JSON.parse(body) : {}
}

function snapshotPath(target) {
  const scratchRoot =
    process.env.CLAUDE_SCRATCHPAD_DIR ?? path.join(os.tmpdir(), "supabase-auth-config-snapshots")
  mkdirSync(scratchRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(scratchRoot, `auth-config-${target}-${stamp}.json`)
}

function normalizeAllowList(rawAllowList) {
  if (Array.isArray(rawAllowList)) return rawAllowList.filter(Boolean)
  if (typeof rawAllowList === "string") {
    return rawAllowList
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function summarizeTemplate(value) {
  if (!value) return "(empty)"
  const usesTokenHash = value.includes("{{ .TokenHash }}") || value.includes("{{.TokenHash}}")
  const usesConfirmationUrl =
    value.includes("{{ .ConfirmationURL }}") || value.includes("{{.ConfirmationURL}}")
  const shape = usesTokenHash
    ? "token_hash link (device-independent)"
    : usesConfirmationUrl
      ? "default ConfirmationURL link (PKCE code, same browser only)"
      : "custom, no recognised link placeholder"
  return `${value.length} chars, ${shape}`
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"))
  loadEnvFile(path.join(repoRoot, ".env.sync.local"))

  const args = parseArgs(process.argv.slice(2))
  const target = TARGETS[args.target]

  const token = requireEnv(
    "SUPABASE_ACCESS_TOKEN",
    "Create a personal access token at https://supabase.com/dashboard/account/tokens and add it to .env.local."
  )
  const projectRef = requireEnv(
    target.refEnv,
    `Add ${target.refEnv} to .env.sync.local (the ${target.label} project ref).`
  )

  if (!existsSync(RECOVERY_TEMPLATE_PATH)) {
    throw new Error(`Recovery template not found at ${RECOVERY_TEMPLATE_PATH}`)
  }
  const templateBody = readFileSync(RECOVERY_TEMPLATE_PATH, "utf8").trim()
  if (!templateBody.includes("{{ .TokenHash }}")) {
    throw new Error("supabase/templates/recovery.html does not contain {{ .TokenHash }} — refusing to push it.")
  }

  const appUrl = (process.env[target.appUrlEnv] ?? target.appUrl ?? "").trim().replace(/\/$/, "")
  if (!appUrl) {
    throw new Error(`No app URL for ${target.label}. Set ${target.appUrlEnv}.`)
  }
  if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    throw new Error(`App URL for ${target.label} is ${appUrl}. A hosted project needs a real domain.`)
  }

  console.log(`Target:  ${target.label} (project ${projectRef})`)
  console.log(`App URL: ${appUrl}`)
  console.log(args.apply ? "Mode:    APPLY" : "Mode:    dry run (pass --apply to write)")

  const current = await callManagementApi(`/v1/projects/${projectRef}/config/auth`, token)

  const snapshot = snapshotPath(args.target)
  writeFileSync(snapshot, JSON.stringify(current, null, 2), "utf8")
  console.log(`Snapshot written to ${snapshot}`)
  console.log("  (contains provider secrets — keep it out of the repo)")

  // The email link is built from {{ .SiteURL }}, so a wrong site_url produces
  // dead links with no error anywhere.
  const currentSiteUrl = (current.site_url ?? "").trim()
  const siteUrlNeedsChange = currentSiteUrl.replace(/\/$/, "") !== appUrl

  console.log("\nsite_url:")
  console.log(`  now   ${currentSiteUrl || "(empty)"}`)
  if (siteUrlNeedsChange) console.log(`  SET   ${appUrl}`)
  else console.log("  ok    already correct")

  const redirectOrigins = [appUrl, ...(target.extraOrigins ?? [])]
  const requiredRedirects = redirectOrigins.flatMap((origin) =>
    REDIRECT_PATHS.map((redirectPath) => `${origin.replace(/\/$/, "")}${redirectPath}`)
  )
  const currentAllowList = normalizeAllowList(current.uri_allow_list)
  const missingRedirects = requiredRedirects.filter((entry) => !currentAllowList.includes(entry))
  const nextAllowList = [...currentAllowList, ...missingRedirects]

  console.log("\nRedirect allow-list:")
  if (currentAllowList.length === 0) console.log("  (currently empty — every return URL is rejected)")
  for (const entry of currentAllowList) console.log(`  keep  ${entry}`)
  for (const entry of missingRedirects) console.log(`  ADD   ${entry}`)
  if (missingRedirects.length === 0) console.log("  ok    all required entries present")

  const currentSubject = current.mailer_subjects_recovery ?? ""
  const currentTemplate = current.mailer_templates_recovery_content ?? ""
  const subjectNeedsChange = !args.skipTemplate && currentSubject !== RECOVERY_SUBJECT
  const templateNeedsChange = !args.skipTemplate && currentTemplate.trim() !== templateBody

  console.log("\nRecovery email:")
  if (args.skipTemplate) {
    console.log("  --skip-template: leaving the subject and body alone")
  }
  console.log(`  subject  now: ${currentSubject || "(default)"}`)
  if (subjectNeedsChange) console.log(`           new: ${RECOVERY_SUBJECT}`)
  console.log(`  body     now: ${summarizeTemplate(currentTemplate)}`)
  if (templateNeedsChange) {
    console.log(`           new: ${summarizeTemplate(templateBody)} (supabase/templates/recovery.html)`)
  }

  const changes = {}
  if (siteUrlNeedsChange) changes.site_url = appUrl
  if (missingRedirects.length > 0) changes.uri_allow_list = nextAllowList.join(",")
  if (subjectNeedsChange) changes.mailer_subjects_recovery = RECOVERY_SUBJECT
  if (templateNeedsChange) changes.mailer_templates_recovery_content = templateBody

  const changedFields = Object.keys(changes)
  if (changedFields.length === 0) {
    console.log("\nNothing to change — this project is already in sync.")
    return
  }

  console.log(`\nFields to patch: ${changedFields.join(", ")}`)

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write these changes.")
    return
  }

  if (target.isProduction && process.env.ALLOW_PRODUCTION_AUTH_CONFIG_PUSH !== PRODUCTION_OPT_IN) {
    throw new Error(
      `Production write blocked. Set ALLOW_PRODUCTION_AUTH_CONFIG_PUSH=${PRODUCTION_OPT_IN} to proceed.`
    )
  }

  await callManagementApi(`/v1/projects/${projectRef}/config/auth`, token, {
    method: "PATCH",
    body: JSON.stringify(changes),
  })

  console.log(`\nPatched ${changedFields.length} field(s) on ${target.label}.`)
  console.log("Verify: request a password reset and open the email on a different device.")
  console.log(`Rollback: PATCH the same fields back from ${snapshot}`)
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
