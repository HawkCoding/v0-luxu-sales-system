"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <Input defaultValue="Luxus Travel & Tours" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input defaultValue="info@luxustravel.co.za" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input defaultValue="+27 12 345 6789" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">VAT Rate</label>
              <Input defaultValue="15%" className="mt-1" readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Banking Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bank</label>
              <Input defaultValue="First National Bank" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Name</label>
              <Input defaultValue="Luxus Travel & Tours" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Number</label>
              <Input defaultValue="62XXXXXXXX" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Branch Code</label>
              <Input defaultValue="250655" className="mt-1" readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Application Version</span>
            <Badge variant="outline" className="text-xs">1.0.0-demo</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Data Mode</span>
            <Badge variant="secondary" className="text-xs">In-Memory (Seeded)</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email Provider</span>
            <Badge variant="secondary" className="text-xs">Mock (90% success rate)</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
