import type { ReactNode } from "react"
import { requirePageRole } from "@/lib/page-access"

// Mirrors "view:settings" in lib/role-context.tsx, which includes consultant
// (read-only cards) but excludes readonly. Also covers the settings sub-pages;
// their APIs keep their own, tighter gates.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["admin", "manager", "consultant"])
  return children
}
