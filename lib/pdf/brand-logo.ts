import fs from "fs"
import path from "path"
import { FOOTER_BRAND_LOCAL_PATH } from "@/lib/assets/footer-brand"

// Server-only module: the brand logo is resolved to bytes at render time, then
// handed to the PDF document as a prop. react-pdf renders synchronously, so the
// async resolution below must complete before the document is rendered.

export interface BrandLogoImage {
  data: Buffer
  format: "png"
}

/**
 * Read as a buffer, not a path or URL string: react-pdf's <Image src> treats a
 * string as a URL to fetch during render, which fails silently for a Windows
 * path and races the render for a remote URL. Passing the bytes with an explicit
 * format is the only form that reliably embeds the image.
 *
 * Every failure degrades to null — callers render their text lines alone —
 * because throwing here would take down quote and invoice generation entirely.
 */

// Resolved logos are cached by source (URL, or the disk sentinel) for the life
// of the process. The committed asset never changes; an uploaded logo lands at a
// cache-busted URL (?t=...), so a replacement is a new key rather than a stale hit.
const cache = new Map<string, BrandLogoImage | null>()
const DISK_KEY = "\0disk"

function readCommittedLogo(): BrandLogoImage | null {
  if (cache.has(DISK_KEY)) return cache.get(DISK_KEY) ?? null
  let result: BrandLogoImage | null
  try {
    const file = path.join(process.cwd(), ...FOOTER_BRAND_LOCAL_PATH.split("/"))
    result = { data: fs.readFileSync(file), format: "png" }
  } catch {
    result = null
  }
  cache.set(DISK_KEY, result)
  return result
}

async function fetchLogo(url: string): Promise<BrandLogoImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer())
    return { data, format: "png" }
  } catch {
    return null
  }
}

/**
 * Resolve the brand logo to embeddable bytes. Prefers the uploaded logo at
 * `url`; on any failure (unset URL, network error, non-200) falls back to the
 * committed asset, then to null.
 */
export async function loadBrandLogo(url: string | null): Promise<BrandLogoImage | null> {
  if (!url) return readCommittedLogo()

  const cached = cache.get(url)
  if (cached !== undefined) return cached ?? readCommittedLogo()

  const fetched = await fetchLogo(url)
  cache.set(url, fetched)
  return fetched ?? readCommittedLogo()
}
