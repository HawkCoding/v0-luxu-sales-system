import type { ReactNode } from "react"
import { requirePageRole } from "@/lib/page-access"

// Mirrors "view:settings" in lib/role-context.tsx — admin and manager only.
// Also covers the settings sub-pages; their APIs keep their own, tighter gates.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["admin", "manager"])
  return children
}
