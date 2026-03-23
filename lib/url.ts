export function shortenUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return trimmed
  }

  try {
    const normalizedInput = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsedUrl = new URL(normalizedInput)
    return `${parsedUrl.origin}/`
  } catch {
    return trimmed
  }
}
