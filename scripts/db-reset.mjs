#!/usr/bin/env node
/**
 * `pnpm db:reset`: resets the local Supabase database (migrations + seed.sql),
 * then refills it with anonymised copies of the real production bookings.
 *
 * The booking refill needs .env.production.local (read-only production key).
 * Without it, or if the pull fails, the reset still succeeds and a warning
 * says how to run the refill later (`pnpm db:seed:prod-bookings`).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function run(command, args) {
  return spawnSync(command, args, { cwd: repoRoot, stdio: "inherit", shell: true }).status ?? 1
}

// Prefer an installed CLI: `npx supabase` downloads the newest release, which can
// reject this repo's config.toml (3.x dropped [inbucket]).
const hasInstalledCli =
  spawnSync("supabase", ["--version"], { cwd: repoRoot, stdio: "ignore", shell: true }).status === 0
const resetStatus = hasInstalledCli
  ? run("supabase", ["db", "reset", ...process.argv.slice(2)])
  : run("npx", ["supabase", "db", "reset", ...process.argv.slice(2)])
if (resetStatus !== 0) process.exit(resetStatus)

if (!existsSync(path.join(repoRoot, ".env.production.local"))) {
  console.warn(
    "\n[db:reset] No .env.production.local, so no bookings were loaded. " +
      "Add it and run `pnpm db:seed:prod-bookings` to get real (anonymised) bookings."
  )
  process.exit(0)
}

const seedStatus = run("node", [path.join("scripts", "seed-bookings-from-prod.mjs")])
if (seedStatus !== 0) {
  console.warn(
    "\n[db:reset] Database was reset, but loading production bookings failed. " +
      "Fix the error above and run `pnpm db:seed:prod-bookings`."
  )
}
process.exit(0)
