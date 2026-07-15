import { execSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Page } from "@playwright/test"

export const SMOKE_USER = {
  email: "dirk@luxustravel.co.za",
  password: "password123",
  userId: "00000000-0000-0000-0000-0000000000a3",
  role: "manager" as const,
} as const

export const SMOKE_STORAGE_STATE = resolve(process.cwd(), "tests/qa/.auth/smoke.json")
const SCREENSHOT_DIR = resolve(process.cwd(), "tests/qa/screenshots")
const REPORT_PATH = resolve(process.cwd(), "tests/qa/reports/smoke-qa.md")

export type CriterionStatus = "PASS" | "FAIL" | "BLOCKED"

interface CriterionRow {
  num: number
  title: string
  status: CriterionStatus
  evidence: string[]
  screenshots: string[]
}

export interface Finding {
  severity: "Critical" | "Major" | "Minor" | "Cosmetic"
  title: string
  repro: string
  expected: string
  actual: string
  screenshot?: string
  fixScope: string
}

// ---------------------------------------------------------------------------
// Report aggregator — accumulates per-criterion results + findings, then writes
// the markdown deliverable at tests/qa/reports/smoke-qa.md.
// ---------------------------------------------------------------------------
class SmokeReport {
  private readonly rows = new Map<number, CriterionRow>()
  private readonly findings: Finding[] = []
  private readonly recommendations: string[] = []

  criterion(num: number, title: string): CriterionRow {
    let row = this.rows.get(num)
    if (!row) {
      row = { num, title, status: "FAIL", evidence: [], screenshots: [] }
      this.rows.set(num, row)
    } else if (title && !row.title) {
      row.title = title
    }
    return row
  }

  record(num: number, title: string, status: CriterionStatus, evidence: string | string[]): void {
    const row = this.criterion(num, title)
    row.status = status
    row.evidence.push(...(Array.isArray(evidence) ? evidence : [evidence]))
  }

  addEvidence(num: number, title: string, evidence: string): void {
    this.criterion(num, title).evidence.push(evidence)
  }

  finding(finding: Finding): void {
    this.findings.push(finding)
  }

  recommend(text: string): void {
    this.recommendations.push(text)
  }

  async shot(page: Page, num: number, label: string): Promise<string> {
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const file = `s${num}-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`
    const abs = resolve(SCREENSHOT_DIR, file)
    await page.screenshot({ path: abs, fullPage: true }).catch(() => undefined)
    const rel = `screenshots/${file}`
    this.criterion(num, "").screenshots.push(rel)
    return rel
  }

  private git(cmd: string): string {
    try {
      return execSync(cmd, { encoding: "utf8" }).trim()
    } catch {
      return "unknown"
    }
  }

  write(): string {
    mkdirSync(resolve(process.cwd(), "tests/qa/reports"), { recursive: true })
    const branch = this.git("git rev-parse --abbrev-ref HEAD")
    const sha = this.git("git rev-parse --short HEAD")
    const rows = [...this.rows.values()].sort((a, b) => a.num - b.num)

    const L: string[] = []
    L.push("# Phase 35 Cross-Cutting Smoke — QA Findings")
    L.push("")
    L.push(`- **Run date:** ${new Date().toISOString()}`)
    L.push(`- **Branch:** ${branch}`)
    L.push(`- **Commit SHA:** ${sha}`)
    L.push(`- **Browser:** Chromium (Playwright \`Desktop Chrome\`)`)
    L.push(`- **Acting role:** Manager — ${SMOKE_USER.email} (clearance_level=manager)`)
    L.push(`- **Base URL:** http://localhost:3000 (local dev + local Supabase)`)
    L.push("")
    const pass = rows.filter((r) => r.status === "PASS").length
    const fail = rows.filter((r) => r.status === "FAIL").length
    const blocked = rows.filter((r) => r.status === "BLOCKED").length
    L.push(`**Result:** ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED (of ${rows.length} criteria)`)
    L.push("")

    L.push("## Per-criterion results")
    L.push("")
    L.push("| # | Title | Result | Evidence |")
    L.push("|---|-------|--------|----------|")
    for (const r of rows) {
      const ev = [...r.evidence, ...r.screenshots.map((s) => `\`${s}\``)].join("; ").replace(/\|/g, "\\|")
      L.push(`| ${r.num} | ${r.title} | ${r.status} | ${ev || "—"} |`)
    }
    L.push("")

    L.push("## Findings")
    L.push("")
    if (this.findings.length === 0) {
      L.push("_No findings recorded._")
    } else {
      const order = { Critical: 0, Major: 1, Minor: 2, Cosmetic: 3 }
      const sorted = [...this.findings].sort((a, b) => order[a.severity] - order[b.severity])
      sorted.forEach((f, i) => {
        L.push(`### ${i + 1}. [${f.severity}] ${f.title}`)
        L.push("")
        L.push(`- **Repro:** ${f.repro}`)
        L.push(`- **Expected:** ${f.expected}`)
        L.push(`- **Actual:** ${f.actual}`)
        if (f.screenshot) L.push(`- **Screenshot:** \`${f.screenshot}\``)
        L.push(`- **Suggested fix scope:** ${f.fixScope}`)
        L.push("")
      })
    }

    L.push("## Improvement recommendations (prioritised)")
    L.push("")
    if (this.recommendations.length === 0) {
      L.push("_None._")
    } else {
      this.recommendations.forEach((r, i) => L.push(`${i + 1}. ${r}`))
    }
    L.push("")

    L.push("## Coverage map — Phase 35 smoke acceptance criteria")
    L.push("")
    L.push("| Acceptance criterion | # | Result |")
    L.push("|---------------------|---|--------|")
    const map: [string, number][] = [
      ["Dashboard stat cards — no NaN, no perpetual loading, Unresolved Errors card", 1],
      ["Settings nav badge appears when unresolved errors exist; disappears when resolved", 2],
      ["Quote PDF — magic bytes, QUOTATION, line items, validity", 3],
      ["Invoice PDF — structural assertions", 4],
      ["Voucher PDF — magic bytes, TRAVEL VOUCHERS, service blocks, End of Services footer", 5],
      ["File upload — small PDF accepted, oversized rejected, disallowed MIME rejected", 6],
      ["Signed URL — 200 + correct content-type; expiry test", 7],
      ["Loading skeleton, empty state, API error state", 8],
    ]
    for (const [bullet, n] of map) {
      const r = this.rows.get(n)
      const icon = r?.status === "PASS" ? "✅ PASS" : r?.status === "BLOCKED" ? "⛔ BLOCKED" : "❌ FAIL"
      L.push(`| ${bullet} | ${n} | ${icon} |`)
    }
    L.push("")

    writeFileSync(REPORT_PATH, `${L.join("\n")}\n`, "utf8")
    return REPORT_PATH
  }
}

export const report = new SmokeReport()
export const REPORT_FILE = REPORT_PATH
