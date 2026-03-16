"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CustomerBulkImportPanel } from "@/components/customer-import-dialog"
import { useRole } from "@/lib/role-context"

export default function CustomerImportSettingsPage() {
  const { can } = useRole()

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
      <Button asChild variant="outline" size="sm">
        <Link href="/app/settings" className="inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
      </Button>

      <Card>
        <CardContent className="pt-6">
          <CustomerBulkImportPanel />
        </CardContent>
      </Card>
    </div>
  )
}
