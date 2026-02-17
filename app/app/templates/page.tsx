"use client"

import { useTemplates } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Edit3, Eye } from "lucide-react"
import type { Template } from "@/lib/types"

export default function TemplatesPage() {
  const { data: templates, isLoading, mutate } = useTemplates()
  const { can } = useRole()
  const [editing, setEditing] = useState<Template | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Template | null>(null)

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
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Email Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">{(templates as Template[]).length} templates</p>
      </div>

      <div className="space-y-3">
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
      </div>

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
    </div>
  )
}
