import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { findMojibake } from "./mojibake"

const ROOT = join(__dirname, "..")

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md"])

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  ".vercel",
])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      out.push(fullPath)
    }
  }

  return out
}

describe("repo-wide mojibake guard", () => {
  it("contains no double-encoded (mojibake) text in source files", () => {
    const offenders: string[] = []

    for (const filePath of collectFiles(ROOT)) {
      const content = readFileSync(filePath, "utf8")
      const matches = findMojibake(content)
      if (matches.length === 0) continue

      const relPath = relative(ROOT, filePath).replace(/\\/g, "/")
      for (const { index, match } of matches) {
        const line = content.slice(0, index).split("\n").length
        offenders.push(`${relPath}:${line} -> ${JSON.stringify(match)}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
