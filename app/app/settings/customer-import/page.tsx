"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CustomerBulkImportPanel } from "@/components/customer-import-dialog"

export default function CustomerImportSettingsPage() {
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
