interface AppLogoProps {
  logoUrl?: string | null
  businessName?: string | null
  size?: number
  className?: string
}

const DEFAULT_BUSINESS_NAME = "Luxus Travel"

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

/**
 * The app's own logo — sidebar mark and login screen. Renders the uploaded
 * logo (Settings > Company Information) when present, otherwise falls back
 * to the company name's initials so the app never shows a broken image.
 *
 * Uses a plain <img>, not next/image: the source is a remote Supabase Storage
 * URL, and next/image would require a next.config remotePatterns change for
 * an asset that already goes through the storage CDN.
 */
export function AppLogo({ logoUrl, businessName, size = 64, className }: AppLogoProps) {
  const name = businessName?.trim() || DEFAULT_BUSINESS_NAME

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={`${name} logo`}
        style={{ width: size, height: size }}
        className={
          (className ? `${className} ` : "") + "object-contain flex-shrink-0"
        }
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={`${name} logo`}
      title={name}
      style={{ width: size, height: size }}
      className={
        (className ? `${className} ` : "") +
        "flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold flex-shrink-0"
      }
    >
      <span style={{ fontSize: Math.max(size * 0.32, 10) }}>{initialsFor(name)}</span>
    </div>
  )
}
