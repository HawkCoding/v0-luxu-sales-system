"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { RoleProvider, useRole } from "@/lib/role-context"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  LayoutDashboard, Kanban, MessageSquare, Briefcase, Users,
  FileText, CreditCard, FolderOpen, Mail, Package,
  FileCode, BarChart3, ClipboardList, Settings, Search,
  ChevronLeft, Menu,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

const navItems = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, permission: "view:dashboard" },
  { label: "Pipeline", href: "/app/pipeline", icon: Kanban, permission: "view:pipeline" },
  { label: "Enquiries", href: "/app/enquiries", icon: MessageSquare, permission: "view:enquiries" },
  { label: "Jobs", href: "/app/jobs", icon: Briefcase, permission: "view:jobs" },
  { label: "Customers", href: "/app/customers", icon: Users, permission: "view:customers" },
  { label: "Quotes", href: "/app/quotes", icon: FileText, permission: "view:quotes" },
  { label: "Payments", href: "/app/payments", icon: CreditCard, permission: "view:payments" },
  { label: "Documents", href: "/app/documents", icon: FolderOpen, permission: "view:documents" },
  { label: "Correspondence", href: "/app/correspondence", icon: Mail, permission: "view:correspondence" },
  { type: "separator" as const, label: "Admin" },
  { label: "Products & Rates", href: "/app/products", icon: Package, permission: "view:products" },
  { label: "Templates", href: "/app/templates", icon: FileCode, permission: "view:templates" },
  { type: "separator" as const, label: "Manager" },
  { label: "Reporting", href: "/app/reporting", icon: BarChart3, permission: "view:reporting" },
  { label: "Audit Log", href: "/app/audit", icon: ClipboardList, permission: "view:audit" },
  { type: "separator" as const, label: "System" },
  { label: "Settings", href: "/app/settings", icon: Settings, permission: "view:settings" },
]

function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { role, setRole, can } = useRole()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "h-screen bg-card border-r border-border flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-16" : "w-60",
        mobileOpen ? "fixed inset-y-0 left-0 w-60" : "hidden lg:flex",
      )}>
        <div className="h-14 flex items-center px-4 border-b border-border">
          {!collapsed && (
            <Link href="/app" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-card" style={{ fontFamily: "var(--font-inter)" }}>LT</span>
              </div>
              <span className="text-sm font-semibold text-foreground tracking-tight">Luxu</span>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center mx-auto">
              <span className="text-xs font-bold text-card" style={{ fontFamily: "var(--font-inter)" }}>L</span>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-0.5">
            {navItems.map((item, i) => {
              if ("type" in item && item.type === "separator") {
                return (
                  <div key={i} className="pt-4 pb-1 px-2">
                    {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</p>}
                    {collapsed && <Separator />}
                  </div>
                )
              }
              if (!("href" in item) || !item.permission || !can(item.permission)) return null
              const Icon = item.icon!
              const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href!))
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                    active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>
        <div className="border-t border-border p-2 hidden lg:block">
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)} className="w-full">
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="w-4 h-4" />
            </Button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search jobs, customers..." className="pl-8 w-64 h-8 text-sm bg-secondary border-0" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:block">Role:</span>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="consultant">Consultant</SelectItem>
                  <SelectItem value="readonly">ReadOnly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <span className="text-xs font-medium text-foreground" style={{ fontFamily: "var(--font-inter)" }}>
                {role[0].toUpperCase()}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <AppShell>{children}</AppShell>
    </RoleProvider>
  )
}
