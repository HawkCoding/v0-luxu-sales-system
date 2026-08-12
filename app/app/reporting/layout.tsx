import type { ReactNode } from "react"
import { requirePageRole } from "@/lib/page-access"

// Mirrors "view:reporting" in lib/role-context.tsx. Without this the page is
// reachable by direct URL and renders full revenue/outstanding figures.
export default async function ReportingLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["admin", "manager"])
  return children
}
