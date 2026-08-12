import type { ReactNode } from "react"
import { requirePageRole } from "@/lib/page-access"

// Mirrors "view:templates" in lib/role-context.tsx.
export default async function TemplatesLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["admin", "manager"])
  return children
}
