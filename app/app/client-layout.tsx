"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { RoleProvider, useRole } from "@/lib/role-context"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard, Kanban, Briefcase, Users,
  FolderOpen, Mail, Hotel, CalendarCheck,
  FileCode, BarChart3, ClipboardList, Settings, Search,
  ChevronDown, ChevronLeft, ChevronUp, Menu, LogOut, Sun, Moon,
} from "lucide-react"
import { useState, useEffect, useRef, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { AuthHashErrorNotice } from "@/components/auth-hash-error-notice"
import { ConnectionErrorBanner } from "@/components/connection-error-banner"
import { SessionTimeoutGuard } from "@/components/session-timeout-guard"
import { useEnquiryCount } from "@/lib/use-data"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"
import { useClientErrorReporter, usePointerEventsGuard } from "@/hooks/use-pointer-events-guard"
import { APP_VERSION } from "@/lib/version"
import type { User } from "@/lib/auth-context"
import { AppLogo } from "@/components/app-logo"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const navItems = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, permission: "view:dashboard" },
  { label: "Enquiries", href: "/app/enquiries", icon: ClipboardList, permission: "view:jobs" },
  { label: "Pipeline", href: "/app/pipeline", icon: Kanban, permission: "view:pipeline" },
  { label: "Bookings", href: "/app/bookings", icon: CalendarCheck, permission: "view:jobs" },
  { label: "Customers", href: "/app/customers", icon: Users, permission: "view:customers" },
  { label: "Suppliers", href: "/app/suppliers", icon: Hotel, permission: "view:suppliers" },
  { label: "Documents", href: "/app/documents", icon: FolderOpen, permission: "view:documents" },
  { label: "Emails Sent", href: "/app/correspondence", icon: Mail, permission: "view:correspondence" },
  { type: "separator" as const, label: "Manager" },
  { label: "Templates", href: "/app/templates", icon: FileCode, permission: "view:templates" },
  { label: "Reporting", href: "/app/reporting", icon: BarChart3, permission: "view:reporting" },
  { label: "Audit Log", href: "/app/audit", icon: Briefcase, permission: "view:audit" },
  { type: "separator" as const, label: "System" },
  { label: "Settings", href: "/app/settings", icon: Settings, permission: "view:settings" },
]

function AppShell({ children }: { children: ReactNode }) {
  useRealtimeSync()
  usePointerEventsGuard()
  useClientErrorReporter()

  const pathname = usePathname()
  const router = useRouter()
  const [headerSearch, setHeaderSearch] = useState("")
  const { user, loading: authLoading, logout } = useAuth()
  const { role, setRole, can } = useRole()
  const { theme, setTheme } = useTheme()
  const { data: enquiryCountData, error: dataError } = useEnquiryCount()
  const { data: companySettings } = useSWR("/api/settings/company", fetcher)
  const businessName: string = companySettings?.business_name || "Luxus Travel"
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [slowLoad, setSlowLoad] = useState(false)
  const [sidebarScrollState, setSidebarScrollState] = useState({
    hasOverflow: false,
    canScrollUp: false,
    canScrollDown: false,
    bottomPadding: 0,
  })
  const sidebarScrollViewportRef = useRef<HTMLDivElement | null>(null)
  const sidebarNavRef = useRef<HTMLElement | null>(null)
  const isDarkMode = theme === "dark"

  const enquiriesCount = enquiryCountData?.count ?? 0

  // /api/error-logs is admin+manager only — skip the poll for roles that would
  // only get a 403 back every 60 seconds.
  const canViewErrorLogs = can("view:error_logs")
  const { data: errorLogCountData } = useSWR<{ count: number }>(
    canViewErrorLogs ? "/api/error-logs?resolved=false&count=true" : null,
    fetcher,
    { refreshInterval: 60_000 },
  )
  const unresolvedErrorsCount = errorLogCountData?.count ?? 0

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setSlowLoad(true), 9000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (mounted && !authLoading && !user) {
      window.location.replace("/login")
    }
  }, [mounted, authLoading, user])

  useEffect(() => {
    if (user && role !== user.role) {
      setRole(user.role)
    }
  }, [user, role, setRole])

  useEffect(() => {
    const viewport = sidebarScrollViewportRef.current
    const nav = sidebarNavRef.current

    if (!viewport || !nav) {
      return
    }

    let frameId = 0

    const updateScrollState = () => {
      const viewportHeight = viewport.clientHeight
      const navChildren = Array.from(nav.children)
      const lastNavItem = [...navChildren]
        .reverse()
        .find((child) => child.tagName === "A") as HTMLAnchorElement | undefined
      const lastNavItemHeight = lastNavItem?.offsetHeight ?? 0
      const bottomPadding = Math.max(0, viewportHeight - lastNavItemHeight - 8)
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)

      setSidebarScrollState({
        hasOverflow: maxScrollTop > 4,
        canScrollUp: viewport.scrollTop > 4,
        canScrollDown: viewport.scrollTop < maxScrollTop - 4,
        bottomPadding,
      })
    }

    const scheduleScrollStateUpdate = () => {
      cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        updateScrollState()
      })
    }

    scheduleScrollStateUpdate()

    viewport.addEventListener("scroll", scheduleScrollStateUpdate, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      scheduleScrollStateUpdate()
    })

    resizeObserver.observe(viewport)
    resizeObserver.observe(nav)

    const mutationObserver = new MutationObserver(() => {
      scheduleScrollStateUpdate()
    })

    mutationObserver.observe(nav, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    window.addEventListener("resize", scheduleScrollStateUpdate)

    return () => {
      cancelAnimationFrame(frameId)
      viewport.removeEventListener("scroll", scheduleScrollStateUpdate)
      window.removeEventListener("resize", scheduleScrollStateUpdate)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [collapsed, mobileOpen, pathname, role, enquiriesCount])

  const scrollSidebarBy = (direction: "up" | "down") => {
    const viewport = sidebarScrollViewportRef.current

    if (!viewport) {
      return
    }

    const scrollStep = Math.max(120, Math.round(viewport.clientHeight * 0.45))
    const nextTop = direction === "down"
      ? viewport.scrollTop + scrollStep
      : viewport.scrollTop - scrollStep

    viewport.scrollTo({
      top: nextTop,
      behavior: "smooth",
    })
  }

  const handleLogout = async () => {
    await logout()
    window.location.replace("/login")
  }

  const handleToggleTheme = () => {
    setTheme(isDarkMode ? "light" : "dark")
  }

  if (!mounted || authLoading || !user) {
    return (
      <div
        className="flex flex-1 min-h-0 items-center justify-center overflow-hidden bg-app-canvas"
      >
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 animate-pulse">
            <span className="text-xl font-bold text-primary">LT</span>
          </div>
          <p className="text-muted-foreground">Loading...</p>
          {slowLoad && (
            <p className="text-xs text-muted-foreground">
              The service is taking longer than expected. Please check your connection.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden bg-app-canvas"
    >
      <SessionTimeoutGuard />
      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "h-full bg-bg-surface border-r border-stroke flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-16" : "w-60",
        mobileOpen ? "fixed inset-y-0 left-0 w-60" : "hidden lg:flex",
      )}>
        <div className="app-header h-14 flex items-center px-4 border-b border-stroke">
          {!collapsed && (
            <Link href="/app" className="flex items-center gap-2 w-full">
              <AppLogo
                logoUrl={companySettings?.app_logo_url}
                businessName={businessName}
                className="flex-shrink-0"
                size={36}
              />
              <span className="text-xs font-semibold text-foreground tracking-tight leading-tight text-center flex-1">
                {businessName}
              </span>
            </Link>
          )}
          {collapsed && (
            <AppLogo
              logoUrl={companySettings?.app_logo_url}
              businessName={businessName}
              className="mx-auto"
              size={32}
            />
          )}
        </div>
        <div className="relative flex-1 min-h-0 py-2">
          <div
            ref={sidebarScrollViewportRef}
            className="h-full overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <nav
              ref={sidebarNavRef}
              className="space-y-0.5 px-2"
              style={{ paddingBottom: `${sidebarScrollState.bottomPadding}px` }}
            >
            {navItems.map((item, i) => {
              if ("type" in item && item.type === "separator") {
                return (
                  <div key={i} className="sidebar-nav-section pt-4 pb-1 px-2">
                    {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</p>}
                    {collapsed && <Separator />}
                  </div>
                )
              }
              if (!("href" in item) || !item.permission || !can(item.permission)) return null
              const Icon = item.icon!
              const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href!))
              const isEnquiries = item.href === "/app/enquiries"
              const isSettings = item.href === "/app/settings"
              const showBadge = isEnquiries && enquiriesCount > 0
              const showSettingsBadge = isSettings && canViewErrorLogs && unresolvedErrorsCount > 0
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-medium transition-all",
                    active ? "bg-accent-hover text-white shadow-sm" : "text-text-muted hover:text-text-heading hover:bg-bg-raised",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {showBadge && (
                        <Badge variant="default" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                          {enquiriesCount}
                        </Badge>
                      )}
                      {showSettingsBadge && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                          {unresolvedErrorsCount}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
            </nav>
          </div>
          {sidebarScrollState.hasOverflow && (
            <>
              {sidebarScrollState.canScrollUp && (
                <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => scrollSidebarBy("up")}
                    aria-label="Scroll sidebar up"
                    className="pointer-events-auto h-6 w-7 rounded-md p-0 text-text-muted border border-stroke/40 bg-bg-surface/50 opacity-70 hover:opacity-100 transition-opacity duration-150"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {sidebarScrollState.canScrollDown && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => scrollSidebarBy("down")}
                    aria-label="Scroll sidebar down"
                    className="pointer-events-auto h-6 w-7 rounded-md p-0 text-text-muted border border-stroke/40 bg-bg-surface/50 opacity-70 hover:opacity-100 transition-opacity duration-150"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-stroke p-2 hidden lg:block space-y-2">
          <div className={cn("text-center", collapsed && "text-[10px]")}>
            <Badge variant="outline" className={cn("font-mono text-[11px] text-text-muted", collapsed && "px-1.5 py-0 h-5")}>
              v{APP_VERSION}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full border border-stroke/40 bg-bg-surface/50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <header className="app-header h-14 border-b border-stroke bg-bg-surface flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
              <Menu className="w-4 h-4" />
            </Button>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const query = headerSearch.trim()
                if (query) router.push(`/app/customers?search=${encodeURIComponent(query)}`)
              }}
              className="relative hidden sm:block"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                value={headerSearch}
                onChange={(event) => setHeaderSearch(event.target.value)}
                placeholder="Search customers..."
                aria-label="Search customers"
                className="pl-10 w-80 h-10 bg-bg-white border-stroke hover:border-accent focus:border-accent-hover transition-colors"
              />
            </form>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleTheme}
              className="relative h-8 w-14 rounded-full border border-stroke bg-bg-raised/90 px-1 hover:bg-bg-raised"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={isDarkMode}
            >
              <span
                className={cn(
                  "pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-bg-white shadow-sm transition-transform duration-200",
                  isDarkMode ? "translate-x-6" : "translate-x-0",
                )}
              />
              <Sun
                className={cn(
                  "relative z-10 w-3.5 h-3.5 transition-colors",
                  isDarkMode ? "text-text-muted" : "text-accent-hover",
                )}
              />
              <Moon
                className={cn(
                  "relative z-10 w-3.5 h-3.5 transition-colors",
                  isDarkMode ? "text-accent-hover" : "text-text-muted",
                )}
              />
            </Button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-raised">
              <span className="text-sm font-medium text-text-heading">{user.name}</span>
              <span className="text-xs text-text-muted">•</span>
              <span className="text-xs text-text-muted capitalize">{role}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 hover:text-text-heading" title="Logout">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto min-h-0">
          {dataError && dataError.status !== 401 && <ConnectionErrorBanner />}
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AppClientLayout({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: User | null
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <RoleProvider initialRole={initialUser?.role}>
        <AuthHashErrorNotice />
        <div className="flex flex-col h-svh overflow-hidden">
          <AppShell>{children}</AppShell>
        </div>
      </RoleProvider>
    </AuthProvider>
  )
}
