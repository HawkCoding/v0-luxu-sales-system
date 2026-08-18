import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Page } from "@playwright/test"

// Screenshot capture for the Luxus Travel and Tours handbook.
//
// Images land in docs/handbook/screenshots/<slug>.png and are referenced from
// the Markdown chapters as [[shot:<slug>]]. scripts/build-handbook.mjs fails the
// build on a marker with no image, and warns on an image no marker uses — so the
// slugs here and the markers in the prose have to stay in step.
//
// Deliberately NOT full-page by default: a full-page capture of a long booking
// screen scales down to something unreadable in print. Viewport captures at the
// size below print legibly on A4. Pass { full: true } only where the whole page
// genuinely has to be seen at once.

export const SHOT_DIR = resolve(process.cwd(), "docs/handbook/screenshots")

export const AUTH_DIR = resolve(process.cwd(), "tests/qa/.auth")

export const HANDBOOK_USERS = {
  consultant: {
    email: "leonie@luxustravel.co.za",
    password: "password123",
    clearance: "consultant",
    storageState: resolve(AUTH_DIR, "handbook-consultant.json"),
  },
  manager: {
    email: "dirk@luxustravel.co.za",
    password: "password123",
    clearance: "manager",
    storageState: resolve(AUTH_DIR, "handbook-manager.json"),
  },
  admin: {
    email: "carmen@luxustravel.co.za",
    password: "password123",
    clearance: "admin",
    storageState: resolve(AUTH_DIR, "handbook-admin.json"),
  },
} as const

export type HandbookRole = keyof typeof HANDBOOK_USERS

/** Viewport used for every capture. 16:10 at a width that keeps the sidebar and
 *  the main pane both readable once scaled to the page width in print. */
export const SHOT_VIEWPORT = { width: 1440, height: 900 } as const

export interface ShotOptions {
  /** Capture the entire scrollable page rather than the viewport. */
  full?: boolean
  /** Extra settle time in ms before the capture (SWR revalidation, animations). */
  settle?: number
}

const captured: string[] = []

/**
 * Capture one handbook figure.
 *
 * @param slug kebab-case, prefixed with the chapter number — e.g. `04-build-booking-step-1`.
 */
export async function shot(page: Page, slug: string, options: ShotOptions = {}): Promise<string> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Screenshot slug must be kebab-case: received "${slug}"`)
  }
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await page.waitForTimeout(options.settle ?? 700)
  const path = resolve(SHOT_DIR, `${slug}.png`)
  await page.screenshot({ path, fullPage: options.full ?? false })
  captured.push(slug)
  return path
}

/**
 * Black out sensitive values before a capture — account numbers, branch codes, tax
 * registration numbers. The field stays visible and correctly positioned so the
 * reader still sees where it is; only the value is obscured.
 *
 * Pass anything Playwright accepts as a selector:
 *
 *   await redact(page, ['input[name="account_number"]', 'input[name="branch_code"]'])
 */
export async function redact(page: Page, selectors: readonly string[]): Promise<void> {
  if (selectors.length === 0) return
  await page.addStyleTag({
    content: `${selectors.join(",\n")} {
      color: transparent !important;
      text-shadow: none !important;
      background-image: repeating-linear-gradient(
        45deg, #2b2b2b, #2b2b2b 4px, #3d3d3d 4px, #3d3d3d 8px
      ) !important;
      background-color: #2b2b2b !important;
      caret-color: transparent !important;
    }`,
  })
}

export function capturedSlugs(): readonly string[] {
  return captured
}
