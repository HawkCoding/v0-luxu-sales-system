"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DocRecord } from "@/lib/types"
import { FileText } from "lucide-react"

export function JobDocumentsTab({ documents }: { documents: DocRecord[] }) {
  if (documents.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No documents generated</div>
  }

  return (
    <div className="space-y-2">
      {documents.map(d => (
        <Card key={d.id}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{d.kind.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Generated: {new Date(d.generatedAt).toLocaleString()}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">PDF</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
