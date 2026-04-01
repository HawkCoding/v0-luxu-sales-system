"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CustomerBulkImportPanel } from "@/components/customer-import-dialog"
import { useRole } from "@/lib/role-context"

export default function CustomerImportSettingsPage() {
  const { can } = useRole()
  const router = useRouter()
  const [hasUnsavedImportData, setHasUnsavedImportData] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [discardRequestToken, setDiscardRequestToken] = useState(0)

  useEffect(() => {
    if (!hasUnsavedImportData) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [hasUnsavedImportData])

  useEffect(() => {
    if (!hasUnsavedImportData) return

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return

      const nextUrl = new URL(href, window.location.origin)
      if (nextUrl.origin !== window.location.origin) return

      const currentPathWithQuery = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const nextPathWithQuery = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      if (currentPathWithQuery === nextPathWithQuery) return

      event.preventDefault()
      setPendingHref(nextPathWithQuery)
      setLeaveDialogOpen(true)
    }

    document.addEventListener("click", handleDocumentClick, true)
    return () => {
      document.removeEventListener("click", handleDocumentClick, true)
    }
  }, [hasUnsavedImportData])

  const navigateToSettings = () => {
    if (!hasUnsavedImportData) {
      router.push("/app/settings")
      return
    }

    setPendingHref("/app/settings")
    setLeaveDialogOpen(true)
  }

  const handleDiscardAndLeave = () => {
    if (!pendingHref) return
    setLeaveDialogOpen(false)
    setDiscardRequestToken((value) => value + 1)
  }

  const handleDiscardHandled = () => {
    if (!pendingHref) return
    const destination = pendingHref
    setPendingHref(null)
    router.push(destination)
  }

  if (!can("import:customers")) {
    return (
      <div className="p-6 max-w-4xl space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/app/settings" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              You do not have permission to bulk import customers.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <Button variant="outline" size="sm" onClick={navigateToSettings} className="inline-flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Button>

      <Card>
        <CardContent className="pt-6">
          <CustomerBulkImportPanel
            discardRequestToken={discardRequestToken}
            onDiscardHandled={handleDiscardHandled}
            onDirtyStateChange={setHasUnsavedImportData}
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          setLeaveDialogOpen(open)
          if (!open) setPendingHref(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave bulk import?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose the extracted rows and all import progress from this session. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardAndLeave}>Leave and discard progress</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
