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

  const openJobs = data.jobs.filter((j: { stage: string }) => !["closed", "lost"].includes(j.stage)).length
  const recentJobs = [...data.jobs].sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="pb-2">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-base text-muted-foreground mt-2">Overview of your sales operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard icon={Briefcase} label="Open Jobs" value={openJobs} />
        <StatCard icon={Users} label="Customers" value={data.customers.length} />
        <StatCard icon={FileText} label="Quotes" value={data.quotes.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground">Jobs by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCount.map(s => (
              <div key={s.key} className="flex items-center justify-between py-2">
                <span className="text-sm text-foreground">{s.label}</span>
                <Badge variant="secondary" className="text-sm font-semibold min-w-[2.5rem] justify-center">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {recentJobs.map((job: { id: string; jobNumber: string; customerId: string; stage: string; purpose: string; createdAt: string }) => {
              const customer = data.customers.find((c: { id: string }) => c.id === job.customerId)
              return (
                <Link key={job.id} href={`/app/jobs/${job.id}`} className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-secondary/50 -mx-3 px-3 rounded transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{job.jobNumber}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{customer?.firstName} {customer?.lastName}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">{job.stage.replace(/_/g, " ")}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Recent Correspondence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {data.correspondences.slice(0, 4).map((cor: { id: string; subject: string; status: string; sentAt?: string; scheduledAt?: string }) => (
              <div key={cor.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <p className="text-sm text-foreground truncate max-w-[200px]">{cor.subject}</p>
                <Badge variant={cor.status === "sent" ? "secondary" : "outline"} className="text-xs">{cor.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5" /> Upcoming Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {data.correspondences.filter((c: { status: string }) => c.status === "scheduled").map((cor: { id: string; subject: string; scheduledAt?: string; jobId: string }) => (
              <div key={cor.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <p className="text-sm text-foreground truncate max-w-[200px]">{cor.subject}</p>
                <span className="text-sm text-muted-foreground">{cor.scheduledAt ? new Date(cor.scheduledAt).toLocaleDateString() : "-"}</span>
              </div>
            ))}
            {data.correspondences.filter((c: { status: string }) => c.status === "scheduled").length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No scheduled follow-ups</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
