/**
 * Slim "preview / in development" notice.
 *
 * Hidden by default; only shown where NEXT_PUBLIC_PREVIEW_BANNER === "true"
 * (e.g. the prospect demo portal). Keeps the codebase identical across branches.
 */
const SHOW_BANNER = process.env.NEXT_PUBLIC_PREVIEW_BANNER?.trim() === "true"
const BANNER_TEXT =
  process.env.NEXT_PUBLIC_PREVIEW_BANNER_TEXT?.trim() ||
  "Preview environment — this product is in active development and uses sample data only."

export function PreviewBanner() {
  if (!SHOW_BANNER) return null
  return (
    <div
      role="status"
      className="w-full bg-amber-500 text-amber-950 text-xs sm:text-sm font-medium text-center px-4 py-1.5 shadow-sm"
    >
      {BANNER_TEXT}
    </div>
  )
}
