#!/usr/bin/env node
// Builds the Luxus Travel and Tours handbook PDFs.
//
//   pnpm docs:build                      # every document + the combined edition
//   pnpm docs:build --only consultant-handbook
//   pnpm docs:build --html               # HTML only, skip the PDF pass (fast)
//   pnpm docs:build --allow-missing-shots
//
// Pipeline: Markdown -> HTML (marked) -> headless Chromium -> PDF.
//
// Why Chromium and not @react-pdf/renderer, which the app already uses: the
// react-pdf document components are all bound to domain-shaped props and there
// is no Markdown or HTML bridge, so long-form prose would mean hand-writing an
// AST walker, a table of contents and a page-header system. Chromium gives all
// three for free, and @playwright/test is already a devDependency. The handbook
// is built locally, never on Vercel, so the missing serverless browser does not
// matter here.

import { createRequire } from "node:module"
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const HANDBOOK = join(ROOT, "docs", "handbook")
const CONTENT = join(HANDBOOK, "content")
const SHOTS = join(HANDBOOK, "screenshots")
const DIST = join(HANDBOOK, "dist")
const FONTS = join(ROOT, "assets", "fonts")

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}

const ONLY = value("only")
const HTML_ONLY = flag("html")
const ALLOW_MISSING_SHOTS = flag("allow-missing-shots")

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const { marked } = require("marked")

marked.setOptions({ gfm: true, breaks: false })

/** Screenshot markers: [[shot:04-quote-build]] or [[shot:04-quote-build|Caption]] */
const SHOT_RE = /\[\[shot:([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g

const usedShots = new Set()
const missingShots = []

function expandShots(markdown, sourceLabel) {
  return markdown.replace(SHOT_RE, (_match, slug, caption) => {
    const file = join(SHOTS, `${slug}.png`)
    usedShots.add(`${slug}.png`)
    if (!existsSync(file)) {
      missingShots.push({ slug, source: sourceLabel })
      return `<figure class="shot-missing"><figcaption>MISSING SCREENSHOT: ${slug}.png</figcaption></figure>`
    }
    const src = pathToFileURL(file).href
    const alt = (caption ?? slug).replace(/"/g, "&quot;")
    return [
      "<figure>",
      `<img src="${src}" alt="${alt}">`,
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "",
      "</figure>",
    ].join("")
  })
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** GitHub-style callouts: a blockquote whose first line is [!NOTE] / [!WARNING] / [!STOP]. */
function applyCallouts(html) {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|WARNING|STOP|TIP)\]\s*(?:<br\s*\/?>)?\s*/gi,
    (_m, kind) => {
      const cls = { NOTE: "note", TIP: "note", WARNING: "warn", STOP: "stop" }[kind.toUpperCase()]
      const label = { NOTE: "Note", TIP: "Tip", WARNING: "Important", STOP: "Do not" }[kind.toUpperCase()]
      return `<blockquote class="${cls}"><p><strong>${label} — </strong>`
    },
  )
}

// ---------------------------------------------------------------------------
// Headings / table of contents
// ---------------------------------------------------------------------------

/** Pull h1/h2 out of the rendered HTML and give each an anchor id. */
function extractOutline(html) {
  const outline = []
  let index = 0
  const withIds = html.replace(/<h([12])>([\s\S]*?)<\/h\1>/g, (_match, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim()
    const id = `sec-${index++}`
    outline.push({ id, level: Number(level), text })
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
  return { html: withIds, outline }
}

function renderToc(outline, pageNumbers) {
  const items = outline
    .map((entry) => {
      const page = pageNumbers?.get(entry.id)
      return [
        `<li class="toc-h${entry.level}">`,
        `<span class="toc-label">${escapeHtml(entry.text)}</span>`,
        `<span class="toc-dots"></span>`,
        `<span class="toc-page">${page ?? ""}</span>`,
        "</li>",
      ].join("")
    })
    .join("\n")
  return `<nav class="toc"><h2>Contents</h2><ol>${items}</ol></nav>`
}

// ---------------------------------------------------------------------------
// Fonts + page shell
// ---------------------------------------------------------------------------

function fontFaceCss() {
  const faces = [
    ["Playfair Display", "PlayfairDisplay-Regular.ttf", 400, "normal"],
    ["Playfair Display", "PlayfairDisplay-Bold.ttf", 700, "normal"],
    ["Playfair Display", "PlayfairDisplay-Italic.ttf", 400, "italic"],
    ["Montserrat", "Montserrat-Regular.ttf", 400, "normal"],
    ["Montserrat", "Montserrat-Bold.ttf", 700, "normal"],
    // No monospace face ships in assets/fonts — code spans fall back to the
    // platform monospace, which Chromium embeds into the PDF anyway.
  ]
  return faces
    .filter(([, file]) => existsSync(join(FONTS, file)))
    .map(
      ([family, file, weight, style]) =>
        `@font-face{font-family:"${family}";src:url("${pathToFileURL(join(FONTS, file)).href}");` +
        `font-weight:${weight};font-style:${style};font-display:block;}`,
    )
    .join("\n")
}

/** The same brand mark the quote, invoice and voucher PDFs print, read straight
 *  from the committed asset — no database or authentication needed at build time. */
function coverLogoHtml() {
  const logo = join(ROOT, "assets", "brand", "sarail-footer-logo.png")
  if (!existsSync(logo)) return ""
  return `<img class="cover-logo" src="${pathToFileURL(logo).href}" alt="">`
}

function coverHtml(doc, brand, buildDate) {
  return `
<section class="cover">
  <div class="cover-top">
    ${coverLogoHtml()}
    <p class="cover-eyebrow">${escapeHtml(brand.company)}</p>
    <h1 class="cover-title">${escapeHtml(doc.title)}</h1>
    <div class="cover-rule"></div>
    <p class="cover-subtitle">${escapeHtml(doc.subtitle)}</p>
  </div>
  <div class="cover-meta">
    <dl>
      <dt>System</dt><dd>${escapeHtml(brand.product)}</dd>
      <dt>Audience</dt><dd>${escapeHtml(doc.audience)}</dd>
      <dt>Version</dt><dd>${escapeHtml(brand.version)}</dd>
      <dt>Issued</dt><dd>${escapeHtml(buildDate)}</dd>
    </dl>
  </div>
</section>`
}

function pageHtml({ doc, brand, body, toc, css, buildDate }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(brand.company)} — ${escapeHtml(doc.title)}</title>
<style>${fontFaceCss()}</style>
<style>${css}</style>
</head>
<body>
${coverHtml(doc, brand, buildDate)}
${toc}
<main class="content">
${body}
</main>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Build one document
// ---------------------------------------------------------------------------

function readChapters(doc) {
  const parts = []
  for (const rel of doc.files) {
    const abs = join(CONTENT, rel)
    if (!existsSync(abs)) {
      console.warn(`  · not written yet, skipping: content/${rel}`)
      continue
    }
    parts.push(expandShots(readFileSync(abs, "utf8").trim(), rel))
  }
  return parts.join("\n\n")
}

async function renderPdf(browser, html, outPath, brand, docTitle) {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "networkidle" })
  await page.emulateMedia({ media: "print" })
  const footer = `
    <div style="width:100%;font-family:Arial,sans-serif;font-size:7pt;color:#939ea5;
                padding:0 15mm;display:flex;justify-content:space-between;">
      <span>${brand.company} — ${docTitle}</span>
      <span class="pageNumber"></span>
    </div>`
  const buffer = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: footer,
    margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
  })
  await page.close()
  if (outPath) writeFileSync(outPath, buffer)
  return buffer
}

/** Second pass: read back the rendered PDF and map each heading to its page. */
async function resolvePageNumbers(buffer, outline) {
  let pdfParse
  try {
    pdfParse = require("pdf-parse/lib/pdf-parse.js")
  } catch {
    return undefined
  }
  const pages = []
  try {
    await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent()
        pages.push(content.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").toLowerCase())
        return ""
      },
    })
  } catch (error) {
    console.warn(`  · page numbers unavailable (${error.message}); TOC will omit them`)
    return undefined
  }
  const numbers = new Map()
  for (const entry of outline) {
    const needle = entry.text.replace(/\s+/g, " ").toLowerCase()
    const index = pages.findIndex((text) => text.includes(needle))
    if (index !== -1) numbers.set(entry.id, index + 1)
  }
  return numbers
}

async function buildDocument(browser, doc, brand, css, buildDate) {
  console.log(`\n${doc.title}`)
  const markdown = readChapters(doc)
  if (!markdown.trim()) {
    console.warn("  · no content yet — nothing to build")
    return null
  }

  const rendered = applyCallouts(marked.parse(markdown))
  const { html: body, outline } = extractOutline(rendered)

  const makeHtml = (pageNumbers) =>
    pageHtml({ doc, brand, body, toc: renderToc(outline, pageNumbers), css, buildDate })

  const htmlPath = join(DIST, `${doc.slug}.html`)
  writeFileSync(htmlPath, makeHtml(undefined), "utf8")
  if (HTML_ONLY) {
    console.log(`  · ${relative(ROOT, htmlPath)}`)
    return null
  }

  // Pass 1 lays the document out so we can read real page numbers back, pass 2
  // reprints with the table of contents filled in.
  const firstPass = await renderPdf(browser, makeHtml(undefined), null, brand, doc.title)
  const pageNumbers = await resolvePageNumbers(firstPass, outline)
  const finalHtml = makeHtml(pageNumbers)
  writeFileSync(htmlPath, finalHtml, "utf8")

  const pdfPath = join(DIST, `${doc.slug}.pdf`)
  await renderPdf(browser, finalHtml, pdfPath, brand, doc.title)
  const resolved = pageNumbers ? [...pageNumbers.values()].length : 0
  console.log(`  · ${relative(ROOT, pdfPath)} — ${outline.length} sections, ${resolved} numbered`)
  return pdfPath
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { brand, documents, combined } = await import(pathToFileURL(join(HANDBOOK, "handbook.config.mjs")).href)
  const { APP_VERSION } = await readAppVersion()
  const css = readFileSync(join(HANDBOOK, "theme", "print.css"), "utf8")
  const buildDate = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
  const brandWithVersion = { ...brand, version: APP_VERSION }

  mkdirSync(DIST, { recursive: true })
  mkdirSync(SHOTS, { recursive: true })

  const all = [...documents, combined]
  const targets = ONLY ? all.filter((doc) => doc.slug === ONLY) : all
  if (targets.length === 0) {
    console.error(`No document matches --only ${ONLY}. Known slugs: ${all.map((d) => d.slug).join(", ")}`)
    process.exit(1)
  }

  let browser = null
  if (!HTML_ONLY) {
    const { chromium } = require("@playwright/test")
    browser = await chromium.launch()
  }

  try {
    for (const doc of targets) {
      await buildDocument(browser, doc, brandWithVersion, css, buildDate)
    }
  } finally {
    if (browser) await browser.close()
  }

  reportScreenshots()
}

async function readAppVersion() {
  const source = readFileSync(join(ROOT, "lib", "version.ts"), "utf8")
  const match = source.match(/APP_VERSION\s*=\s*"([^"]+)"/)
  return { APP_VERSION: match?.[1] ?? "unknown" }
}

function reportScreenshots() {
  const onDisk = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.endsWith(".png")) : []
  const orphans = onDisk.filter((file) => !usedShots.has(file))

  console.log("")
  if (missingShots.length > 0) {
    console.error(`${missingShots.length} screenshot marker(s) have no image:`)
    for (const { slug, source } of missingShots) console.error(`  · ${slug}.png  (referenced by ${source})`)
  }
  if (orphans.length > 0) {
    console.warn(`${orphans.length} screenshot(s) on disk are never referenced:`)
    for (const file of orphans) console.warn(`  · ${file}`)
  }
  if (missingShots.length === 0 && orphans.length === 0) {
    console.log(`Screenshots: ${usedShots.size} referenced, all present.`)
  }
  if (missingShots.length > 0 && !ALLOW_MISSING_SHOTS) {
    console.error("\nBuild failed. Capture the missing screenshots (pnpm docs:shots) or pass --allow-missing-shots.")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
