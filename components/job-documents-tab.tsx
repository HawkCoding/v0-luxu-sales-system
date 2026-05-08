"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DocRecord, Enquiry, Job, Customer } from "@/lib/types"
import { FileText } from "lucide-react"
import { GenerateVoucherDialog } from "@/components/generate-voucher-dialog"
import { formatDisplayDateTime } from "@/lib/date-format"

interface JobDocumentsTabProps {
  documents: DocRecord[]
  job?: Job
  enquiry?: Enquiry
  customer?: Customer
  onChange?: () => Promise<void> | void
}

export function JobDocumentsTab({ documents, job, enquiry, customer, onChange }: JobDocumentsTabProps) {
  const canGenerateVoucher = job && enquiry && customer &&
    (job.stage === "final_paid" || job.stage === "voucher_sent" || job.stage === "closed")

  return (
    <div className="space-y-3">
      {canGenerateVoucher && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Generate Travel Voucher</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create, preview, and send the PDF voucher</p>
              </div>
              <GenerateVoucherDialog
                jobId={job.id}
                bookingNumber={job.jobNumber}
                onGenerated={onChange}
                onSent={async () => {
                  await onChange?.()
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}
      
      {documents.length === 0 && !canGenerateVoucher && (
        <div className="text-center py-8 text-sm text-muted-foreground">No documents generated</div>
      )}
      
      {documents.map(d => (
        <Card key={d.id}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{d.kind.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Generated: {formatDisplayDateTime(d.generatedAt)}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">PDF</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
