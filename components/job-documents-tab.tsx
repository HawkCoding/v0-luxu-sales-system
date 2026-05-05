"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DocRecord, Enquiry, Job, Customer, ConsultantAbbreviation } from "@/lib/types"
import { FileText, FileOutput } from "lucide-react"
import { generateVoucherHTML, downloadVoucherPDF } from "@/lib/generate-voucher"
import { CONSULTANTS, VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { useVoucherTemplate } from "@/lib/use-data"
import { toast } from "sonner"
import { formatDisplayDateLong, formatDisplayDateTime } from "@/lib/date-format"

interface JobDocumentsTabProps {
  documents: DocRecord[]
  job?: Job
  enquiry?: Enquiry
  customer?: Customer
}

export function JobDocumentsTab({ documents, job, enquiry, customer }: JobDocumentsTabProps) {
  const { data: voucherTemplate, isLoading: voucherTemplateLoading, error: voucherTemplateError } = useVoucherTemplate()
  const canGenerateVoucher = job && enquiry && customer &&
    (job.stage === "deposit_paid" || job.stage === "final_paid" || job.stage === "voucher_sent" || job.stage === "closed")

  const handleGenerateVoucher = () => {
    if (!job || !enquiry || !customer) {
      toast.error("Missing required data for voucher generation")
      return
    }

    const consultant = CONSULTANTS.find(c => c.key === job.consultant)
    const guestNames = `${enquiry.title} ${enquiry.name} ${enquiry.surname}`
    
    const voucherData = {
      voucherNumber: job.jobNumber,
      guestNames,
      consultantName: consultant?.name || "Unknown",
      supplierName: "Rovos Rail",
      route: enquiry.direction,
      departure: formatDisplayDateLong(enquiry.departureDate),
      arrival: "",
      suiteType: enquiry.suiteTypes[0] || "Suite",
      numberOfGuests: enquiry.noOfAdults + enquiry.noOfChildren,
      specialRequests: enquiry.additionalServicesDetails || "",
      customerEmail: customer.email,
      customerPhone: customer.phone ?? "",
      enquiry,
      consultant: job.consultant
    }

    if (!voucherTemplate && voucherTemplateLoading) {
      toast.error("Voucher template is still loading. Please try again in a moment.")
      return
    }

    const html = generateVoucherHTML(voucherData, voucherTemplateError ? VOUCHER_TEMPLATE_DEFAULTS : voucherTemplate)
    downloadVoucherPDF(html, `voucher-${job.jobNumber}.html`)
    
    toast.success("Voucher generated successfully", {
      description: "The voucher will open in a new window for printing/saving as PDF"
    })
  }

  return (
    <div className="space-y-3">
      {canGenerateVoucher && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Generate Travel Voucher</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create a PDF voucher for this booking</p>
              </div>
              <Button size="sm" onClick={handleGenerateVoucher} disabled={voucherTemplateLoading}>
                <FileOutput className="w-4 h-4 mr-1.5" />
                Generate Voucher
              </Button>
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
