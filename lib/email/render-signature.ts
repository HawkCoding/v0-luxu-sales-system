import { createElement } from "react"
import { EmailSignature } from "@/emails/email-signature"
import type { ResolvedEmailSignature } from "@/lib/email/signature"

/**
 * Renders the signature block as a standalone HTML fragment. `render()` from
 * @react-email/render always prepends an XHTML doctype — even for a
 * non-`<Html>` root — and wraps in `<Suspense>`, which can emit `<!--$-->`
 * boundary comments, so it cannot produce a clean fragment. Both the compose
 * path and the render endpoint call this one function, which is what
 * guarantees the swap-in fragment is byte-identical to what compose embeds.
 *
 * Imported dynamically — @react-email/render's own node build does the same
 * — because a static `import ... from "react-dom/server"` inside a route's
 * module graph trips Next's RSC bundler ("importing a component that
 * imports react-dom/server").
 */
export async function renderSignatureFragment(signature: ResolvedEmailSignature): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server")
  return renderToStaticMarkup(createElement(EmailSignature, { signature }))
}
