"use client"

import { useTemplates } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRole } from "@/lib/role-context"
import { useState, useEffect } from "react"
import { Edit3, Eye, Download, FileText } from "lucide-react"
import type { Template } from "@/lib/types"

interface VoucherTemplate {
  headerText: string
  productLine: string
  guidanceText: string
  footerText: string
  placeholders: string[]
}

export default function TemplatesPage() {
  const { data: templates, isLoading, mutate } = useTemplates()
  const { can } = useRole()
  const [editing, setEditing] = useState<Template | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Template | null>(null)
  
  // Voucher template state
  const [voucherTemplate, setVoucherTemplate] = useState<VoucherTemplate>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voucher-template')
      if (saved) return JSON.parse(saved)
    }
    return {
      headerText: "A division of Luxus Travel & Tours",
      productLine: "THE BLUE TRAIN  •  ROVOS RAIL",
      guidanceText: "This voucher confirms your reservation. All services are pre-paid unless indicated. Additional services or upgrades may incur extra charges payable directly to the service provider.",
      footerText: "For any queries, please contact your consultant. Safe travels!",
      placeholders: [
        "{voucher_number}",
        "{guest_names}",
        "{consultant_name}",
        "{supplier_name}",
        "{route}",
        "{departure}",
        "{arrival}",
        "{suite_type}",
        "{number_of_guests}",
        "{special_requests}",
        "{customer_email}",
        "{customer_phone}"
      ]
    }
  })
  const [editingVoucher, setEditingVoucher] = useState(false)

  // Save voucher template to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('voucher-template', JSON.stringify(voucherTemplate))
    }
  }, [voucherTemplate])

  const downloadVoucherTemplate = () => {
    const blob = new Blob([JSON.stringify(voucherTemplate, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voucher-template-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !templates) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-secondary rounded-lg" />)}</div></div>
  }

  const startEdit = (t: Template) => {
    setEditing(t)
    setEditSubject(t.subject)
    setEditBody(t.bodyHtml)
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, subject: editSubject, bodyHtml: editBody }),
      })
      mutate()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Templates</h1>
        <p className="text-base text-muted-foreground mt-2">Email and voucher templates for customer communications</p>
      </div>

      <Tabs defaultValue="email" className="space-y-4">
        <TabsList>
          <TabsTrigger value="email">Email Templates</TabsTrigger>
          <TabsTrigger value="voucher">Voucher Template</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-3">
        {(templates as Template[]).map(t => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">{t.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">v{t.version}</Badge>
                  <Badge variant={t.active ? "default" : "outline"} className="text-[10px]">{t.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(t)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {can("edit:templates") && (
                    <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground"><span className="font-medium">Subject:</span> {t.subject}</p>
            </CardContent>
          </Card>
        ))}
        </TabsContent>

        <TabsContent value="voucher" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Voucher Template</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Configure the voucher PDF layout and placeholders</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={downloadVoucherTemplate}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Download
                  </Button>
                  {can("edit:templates") && (
                    <Button size="sm" onClick={() => setEditingVoucher(true)}>
                      <Edit3 className="w-4 h-4 mr-1.5" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Header Text</h4>
                <p className="text-sm text-muted-foreground">{voucherTemplate.headerText}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Product Line</h4>
                <p className="text-sm text-muted-foreground">{voucherTemplate.productLine}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Guidance Text</h4>
                <p className="text-sm text-muted-foreground">{voucherTemplate.guidanceText}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Footer Text</h4>
                <p className="text-sm text-muted-foreground">{voucherTemplate.footerText}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Available Placeholders</h4>
                <div className="flex flex-wrap gap-2">
                  {voucherTemplate.placeholders.map(p => (
                    <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Modify the template subject and HTML body.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Body (HTML)</label>
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="mt-1 text-xs font-mono" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>{preview?.subject}</DialogDescription>
          </DialogHeader>
          <div className="border border-border rounded-md p-4 bg-card">
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Voucher Edit Dialog */}
      <Dialog open={editingVoucher} onOpenChange={setEditingVoucher}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Voucher Template</DialogTitle>
            <DialogDescription>Customize the voucher layout and text. Use placeholders for dynamic content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label className="text-sm font-medium">Header Text</Label>
              <Input
                value={voucherTemplate.headerText}
                onChange={(e) => setVoucherTemplate({ ...voucherTemplate, headerText: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Product Line</Label>
              <Input
                value={voucherTemplate.productLine}
                onChange={(e) => setVoucherTemplate({ ...voucherTemplate, productLine: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Guidance Text</Label>
              <Textarea
                value={voucherTemplate.guidanceText}
                onChange={(e) => setVoucherTemplate({ ...voucherTemplate, guidanceText: e.target.value })}
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Footer Text</Label>
              <Textarea
                value={voucherTemplate.footerText}
                onChange={(e) => setVoucherTemplate({ ...voucherTemplate, footerText: e.target.value })}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setEditingVoucher(false)}>Cancel</Button>
            <Button size="sm" onClick={() => setEditingVoucher(false)}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
