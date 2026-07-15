/**
 * SVG assets render unreliably in both react-pdf (sized from the intrinsic
 * viewBox) and email clients (Gmail/Outlook strip them), so raster-only checks
 * guard every place a stored asset URL is embedded.
 */
export function isRasterAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false
  return !url.split("?")[0].toLowerCase().endsWith(".svg")
}
