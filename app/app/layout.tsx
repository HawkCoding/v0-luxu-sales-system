import type { ReactNode } from "react"
import AppClientLayout from "./client-layout"

export const dynamic = "force-dynamic"

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppClientLayout>{children}</AppClientLayout>
}
