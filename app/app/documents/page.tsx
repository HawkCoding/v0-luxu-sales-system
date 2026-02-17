"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText } from "lucide-react"
import Link from "next/link"

export default function DocumentsPage() {
  const { data, isLoading } = useAllData()

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const docs = data.documents.map((d: any) => {
    const job = data.jobs.find((j: any) => j.id === d.jobId)
    const customer = data.customers.find((c: any) => c.id === job?.customerId)
    return { ...d, jobNumber: job?.jobNumber, customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown" }
  }).sort((a: any, b: any) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">{docs.length} documents</p>
      </div>

      <div className="space-y-2">
        {docs.map((d: any) => (
          <Link key={d.id} href={`/app/jobs/${d.jobId}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{d.kind.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                      <Badge variant="outline" className="text-[10px]">PDF</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{d.jobNumber} &middot; {d.customerName}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(d.generatedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
