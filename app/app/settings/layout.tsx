import type { ReactNode } from "react"

// The Settings pages are visible to every role; write access is enforced
// per-card via can("edit:settings") and by each API route.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children
}
