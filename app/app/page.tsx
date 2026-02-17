"use client"

import { useAllData } from "@/lib/use-data"
import { PIPELINE_STAGES } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Briefcase, Users, FileText, CreditCard, MessageSquare, Clock } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { data, isLoading } = useAllData()

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-secondary rounded-lg" />)}</div></div>
  }

  const stageCount = PIPELINE_STAGES.map(s => ({
    ...s,
    count: data.jobs.filter((j: { stage: string }) => j.stage === s.key).length,
  }))

  const totalPayments = data.payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0)
  const openJobs = data.jobs.filter((j: { stage: string }) => !["closed", "lost"].includes(j.stage)).length
  const recentJobs = [...data.jobs].sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your sales operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} label="Open Jobs" value={openJobs} />
        <StatCard icon={Users} label="Customers" value={data.customers.length} />
        <StatCard icon={FileText} label="Quotes" value={data.quotes.length} />
        <StatCard icon={CreditCard} label="Revenue" value={`R ${totalPayments.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stageCount.map(s => (
              <div key={s.key} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <Badge variant="secondary" className="text-xs">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {recentJobs.map((job: { id: string; jobNumber: string; customerId: string; stage: string; purpose: string; createdAt: string }) => {
              const customer = data.customers.find((c: { id: string }) => c.id === job.customerId)
              return (
                <Link key={job.id} href={`/app/jobs/${job.id}`} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 hover:bg-secondary/30 -mx-2 px-2 rounded transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{job.jobNumber}</p>
                    <p className="text-xs text-muted-foreground">{customer?.firstName} {customer?.lastName}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-[10px]">{job.stage.replace(/_/g, " ")}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(job.createdAt).toLocaleDateString()}</p>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Recent Correspondence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {data.correspondences.slice(0, 4).map((cor: { id: string; subject: string; status: string; sentAt?: string; scheduledAt?: string }) => (
              <div key={cor.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <p className="text-sm text-foreground truncate max-w-[200px]">{cor.subject}</p>
                <Badge variant={cor.status === "sent" ? "secondary" : "outline"} className="text-[10px]">{cor.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Upcoming Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {data.correspondences.filter((c: { status: string }) => c.status === "scheduled").map((cor: { id: string; subject: string; scheduledAt?: string; jobId: string }) => (
              <div key={cor.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <p className="text-sm text-foreground truncate max-w-[200px]">{cor.subject}</p>
                <span className="text-xs text-muted-foreground">{cor.scheduledAt ? new Date(cor.scheduledAt).toLocaleDateString() : "-"}</span>
              </div>
            ))}
            {data.correspondences.filter((c: { status: string }) => c.status === "scheduled").length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No scheduled follow-ups</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
