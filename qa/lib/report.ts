import { mkdirSync, writeFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import type { Page } from "@playwright/test"

type StepStatus = "pass" | "fail" | "warn"

interface StepDetails {
  status?: StepStatus
  screenshot?: string
  notes?: string[]
  evidence?: Record<string, unknown>
}

interface ReportStep {
  title: string
  status: StepStatus
  screenshot?: string
  notes: string[]
  evidence?: Record<string, unknown>
}

export interface BrowserDiagnostics {
  consoleErrors: string[]
  failedResponses: string[]
  [key: string]: unknown
}

const STATUS_ICON: Record<StepStatus, string> = {
  pass: "OK",
  fail: "FAIL",
  warn: "WARN",
}

function reportDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function formatEvidence(evidence: Record<string, unknown>): string {
  return `\n\n\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\``
}

export function attachBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    failedResponses: [],
  }

  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text())
    }
  })

  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.failedResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  return diagnostics
}

export class ReportBuilder {
  private readonly slug: string
  private readonly title: string
  private readonly steps: ReportStep[] = []
  private readonly issues: string[] = []
  private readonly dbEvidence: Record<string, unknown>[] = []
  private goal = ""
  private environment: Record<string, unknown> = {}

  constructor(slug: string, title = slug) {
    this.slug = slug
    this.title = title
  }

  setGoal(goal: string): void {
    this.goal = goal
  }

  setEnvironment(environment: Record<string, unknown>): void {
    this.environment = environment
  }

  addDbEvidence(evidence: Record<string, unknown>): void {
    this.dbEvidence.push(evidence)
  }

  addIssue(issue: string): void {
    this.issues.push(issue)
  }

  step(title: string, details: StepDetails = {}): void {
    const status = details.status ?? "pass"
    this.steps.push({
      title,
      status,
      screenshot: details.screenshot,
      notes: details.notes ?? [],
      evidence: details.evidence,
    })

    if (status !== "pass") {
      this.issues.push(title)
    }
  }

  async screenshot(page: Page, label: string): Promise<string> {
    const dir = resolve(process.cwd(), "qa", "screenshots", reportDate())
    mkdirSync(dir, { recursive: true })
    const filename = `${this.slug}-${sanitizeFilePart(label)}-${Date.now()}.png`
    const path = resolve(dir, filename)
    await page.screenshot({ path, fullPage: true })
    return relative(process.cwd(), path).replace(/\\/g, "/")
  }

  write(): string {
    const dir = resolve(process.cwd(), "qa", "reports")
    mkdirSync(dir, { recursive: true })
    const path = resolve(dir, `${reportDate()}-${this.slug}.md`)
    const lines: string[] = []
    const passCount = this.steps.filter((step) => step.status === "pass").length
    const warnCount = this.steps.filter((step) => step.status === "warn").length
    const failCount = this.steps.filter((step) => step.status === "fail").length

    lines.push(`# ${this.title}`)
    lines.push("")
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push("")
    lines.push("## Goal")
    lines.push(this.goal || "Not specified.")
    lines.push("")
    lines.push("## Environment")
    lines.push(formatEvidence(this.environment || {}))
    lines.push("")
    lines.push("## Steps")

    for (const step of this.steps) {
      lines.push(`- ${STATUS_ICON[step.status]} ${step.title}`)
      for (const note of step.notes) {
        lines.push(`  - ${note}`)
      }
      if (step.screenshot) {
        lines.push(`  - Screenshot: [${step.screenshot}](../${step.screenshot.replace(/^qa\//, "")})`)
      }
      if (step.evidence) {
        lines.push(formatEvidence(step.evidence))
      }
    }

    lines.push("")
    lines.push("## Database Evidence")
    if (this.dbEvidence.length === 0) {
      lines.push("No database evidence recorded.")
    } else {
      for (const evidence of this.dbEvidence) {
        lines.push(formatEvidence(evidence))
      }
    }

    lines.push("")
    lines.push("## Issues Found")
    if (this.issues.length === 0) {
      lines.push("No issues found.")
    } else {
      for (const issue of Array.from(new Set(this.issues))) {
        lines.push(`- ${issue}`)
      }
    }

    lines.push("")
    lines.push("## Severity Summary")
    lines.push(`- Pass: ${passCount}`)
    lines.push(`- Warning: ${warnCount}`)
    lines.push(`- Fail: ${failCount}`)

    writeFileSync(path, `${lines.join("\n")}\n`, "utf8")
    return path
  }
}
