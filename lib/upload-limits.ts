// Vercel rejects any request body over 4.5 MB before it reaches the route, with a plain-text 413
// the client can't read. Images go through an API route as multipart form data, so the cap sits
// at 4 MB to leave room for the form overhead -- a file the UI accepts must also clear Vercel.
export const MAX_IMAGE_MB = 4
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

export const MAX_DOCUMENT_MB = 10
export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024

export const IMAGE_TOO_LARGE_MESSAGE = `File too large. The maximum image size is ${MAX_IMAGE_MB} MB.`

/** Listed under every logo upload: the app logo and the document brand logo. */
export const LOGO_UPLOAD_REQUIREMENTS: readonly string[] = [
  "PNG file only",
  `${MAX_IMAGE_MB} MB maximum`,
  "Square, e.g. 512 × 512 px",
  "Transparent background works best",
]

/**
 * Client-side pre-check for a PNG logo upload, so a file the server would refuse never leaves
 * the browser. Returns the message to show, or null when the file is fine to send.
 */
export function pngLogoUploadError(file: Pick<File, "type" | "size">): string | null {
  if (file.type !== "image/png") return "The logo must be a PNG image."
  if (file.size > MAX_IMAGE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return `This file is ${sizeMb} MB. The maximum image size is ${MAX_IMAGE_MB} MB.`
  }
  return null
}

/**
 * Reads the error message from a failed upload response. A 413 from Vercel's own body limit is
 * plain text, not JSON, so it gets the size message rather than a bare "upload failed".
 */
export async function uploadErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null)
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error) {
    return body.error
  }
  if (res.status === 413) return IMAGE_TOO_LARGE_MESSAGE
  return fallback
}
