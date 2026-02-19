"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { RoleProvider, useRole } from "@/lib/role-context"
import { AuthProvider, useAuth } from "@/lib/auth-context"
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
  ChevronLeft, Menu, LogOut,
} from "lucide-react"
import { useState, useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

const navItems = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, permission: "view:dashboard" },
  { label: "Pipeline", href: "/app/pipeline", icon: Kanban, permission: "view:pipeline" },
  { label: "Jobs", href: "/app/jobs", icon: Briefcase, permission: "view:jobs" },
  { label: "Customers", href: "/app/customers", icon: Users, permission: "view:customers" },
  { label: "Suppliers", href: "/app/suppliers", icon: Package, permission: "view:products" },
  { label: "Payments", href: "/app/payments", icon: CreditCard, permission: "view:payments" },
  { label: "Documents", href: "/app/documents", icon: FolderOpen, permission: "view:documents" },
  { label: "Correspondence", href: "/app/correspondence", icon: Mail, permission: "view:correspondence" },
  { type: "separator" as const, label: "Admin" },
  { label: "Templates", href: "/app/templates", icon: FileCode, permission: "view:templates" },
  { type: "separator" as const, label: "Manager" },
  { label: "Reporting", href: "/app/reporting", icon: BarChart3, permission: "view:reporting" },
  { label: "Audit Log", href: "/app/audit", icon: ClipboardList, permission: "view:audit" },
  { type: "separator" as const, label: "System" },
  { label: "Settings", href: "/app/settings", icon: Settings, permission: "view:settings" },
]

function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { role, setRole, can } = useRole()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Protect route - redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login")
    }
  }, [user, router])

  // Sync role with user's assigned role
  useEffect(() => {
    if (user && role !== user.role) {
      setRole(user.role)
    }
  }, [user, role, setRole])

  // Show loading while checking auth
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <span className="text-xl font-bold text-primary">LT</span>
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  return (
    <div 
      className="flex h-screen overflow-hidden"
      style={{
        background: `var(--app-bg-gradient)`
      }}
    >
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "h-screen bg-chrome-1 border-r border-chrome-border flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-16" : "w-60",
        mobileOpen ? "fixed inset-y-0 left-0 w-60" : "hidden lg:flex",
      )}>
        <div className="h-14 flex items-center px-4 border-b border-chrome-border">
          {!collapsed && (
            <Link href="/app" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-on-chrome-strong" style={{ fontFamily: "var(--font-inter)" }}>LT</span>
              </div>
              <span className="text-sm font-semibold text-on-chrome-strong tracking-tight">Luxu</span>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center mx-auto">
              <span className="text-xs font-bold text-on-chrome-strong" style={{ fontFamily: "var(--font-inter)" }}>L</span>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-0.5">
            {navItems.map((item, i) => {
              if ("type" in item && item.type === "separator") {
                return (
                  <div key={i} className="pt-4 pb-1 px-2">
                    {!collapsed && <p className="text-[10px] font-semibold text-on-chrome-muted uppercase tracking-widest">{item.label}</p>}
                    {collapsed && <Separator className="bg-chrome-border" />}
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
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-medium transition-all relative",
                    active 
                      ? "bg-chrome-2 text-on-chrome-strong before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-accent before:rounded-r" 
                      : "text-on-chrome-muted hover:text-on-chrome hover:bg-chrome-2/50",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </nav>
        </ScrollArea>
        <div className="border-t border-chrome-border p-2 hidden lg:block">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCollapsed(!collapsed)} 
            className="w-full text-on-chrome-muted hover:text-on-chrome hover:bg-chrome-2"
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-chrome-border bg-chrome-1 flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              className="lg:hidden text-on-chrome hover:text-on-chrome-strong hover:bg-chrome-2" 
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-chrome-muted" />
              <Input 
                placeholder="Search jobs, customers..." 
                className="pl-10 w-80 h-10 bg-white/6 border-white/10 text-on-chrome placeholder:text-on-chrome-muted hover:border-accent focus:border-accent transition-colors" 
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-chrome-2 border border-chrome-border">
              <span className="text-sm font-medium text-on-chrome-strong">{user.name}</span>
              <span className="text-xs text-on-chrome-muted">•</span>
              <span className="text-xs text-on-chrome capitalize">{role}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout} 
              className="gap-2 text-on-chrome hover:text-on-chrome-strong hover:bg-chrome-2" 
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
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
    <AuthProvider>
      <RoleProvider>
        <AppShell>{children}</AppShell>
      </RoleProvider>
    </AuthProvider>
  )
}
