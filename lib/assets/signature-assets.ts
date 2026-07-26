import { createHash } from "node:crypto"

/**
 * Signature banners/badges share the footer logo's public bucket so every
 * asset resolves to an absolute URL email clients can load, but live under
 * their own prefix, hashed by content — a rebrand never retroactively
 * changes the image inside an already-sent email, and `upsert`/cache-busting
 * query params become unnecessary since the URL itself is immutable.
 */
export const SIGNATURE_ASSET_BUCKET = "voucher-assets"

export function signatureAssetObjectPath(kind: "banner" | "badge", brandSlug: string, bytes: Uint8Array): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16)
  return `signature/${brandSlug}/${kind}-${hash}.png`
}

/**
 * Reads a PNG's intrinsic width/height straight from its IHDR chunk — no
 * dependency needed. PNG signature is 8 bytes; the IHDR chunk follows as
 * 4-byte length + 4-byte type + width (uint32 BE) + height (uint32 BE).
 * Returns null for anything that isn't a well-formed PNG.
 */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunkType !== "IHDR") return null

  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (width <= 0 || height <= 0) return null

  return { width, height }
}
