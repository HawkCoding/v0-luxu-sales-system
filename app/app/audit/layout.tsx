import type { ReactNode } from "react"
import { requirePageRole } from "@/lib/page-access"

export default async function AuditLayout({ children }: { children: ReactNode }) {
  await requirePageRole(["admin", "manager"])
  return children
}
