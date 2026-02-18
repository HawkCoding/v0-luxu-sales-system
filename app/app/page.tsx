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
  const quotedJobs = data.jobs.filter((j: { stage: string }) => ["quoted", "re_quoted"].includes(j.stage)).length
  const depositsPaid = data.payments.filter((p: { type: string }) => p.type === "deposit").length
  const fullPayments = data.payments.filter((p: { type: string }) => p.type === "full_payment").length
  
  const recentJobs = [...data.jobs].sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  
  const upcomingFollowups = data.correspondences
    .filter((c: { status: string; scheduledAt?: string }) => c.status === "scheduled" && c.scheduledAt)
    .sort((a: { scheduledAt?: string }, b: { scheduledAt?: string }) => 
      new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
    )
    .slice(0, 5)

  return (
    <div className="p-6 space-y-8 max-w-7xl">
      <div className="pb-1">
        <h1 className="text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your sales operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Briefcase} label="Open Jobs" value={openJobs} href="/app/jobs" />
        <StatCard icon={FileText} label="Quoted" value={quotedJobs} href="/app/pipeline" />
        <StatCard icon={CreditCard} label="Deposits Paid" value={depositsPaid} href="/app/payments" />
        <StatCard icon={CreditCard} label="Full Payment" value={fullPayments} href="/app/payments" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md border-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-foreground">Jobs by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCount.map(s => (
              <div key={s.key} className="flex items-center justify-between py-2.5">
                <span className="text-base text-foreground font-medium">{s.label}</span>
                <Badge variant="secondary" className="text-base font-bold min-w-[3rem] justify-center h-8">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-md border-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-foreground">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {recentJobs.map((job: { id: string; jobNumber: string; customerId: string; stage: string; purpose: string; createdAt: string }) => {
              const customer = data.customers.find((c: { id: string }) => c.id === job.customerId)
              return (
                <Link key={job.id} href={`/app/jobs/${job.id}`} className="flex items-center justify-between py-4 border-b border-border last:border-0 hover:bg-primary/5 -mx-4 px-4 rounded transition-colors group">
                  <div>
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors">{job.jobNumber}</p>
                    <p className="text-muted-foreground mt-1">{customer?.firstName} {customer?.lastName}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-sm">{job.stage.replace(/_/g, " ")}</Badge>
                    <p className="text-sm text-muted-foreground mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-2">
        <CardHeader className="pb-4 bg-primary/5">
          <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <span>Upcoming Follow-ups</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {upcomingFollowups.length > 0 ? (
            upcomingFollowups.map((cor: { id: string; subject: string; scheduledAt?: string; jobId: string }) => {
              const job = data.jobs.find((j: { id: string }) => j.id === cor.jobId)
              const customer = job ? data.customers.find((c: { id: string }) => c.id === job.customerId) : null
              
              return (
                <Link 
                  key={cor.id} 
                  href={`/app/jobs/${cor.jobId}`}
                  className="flex items-center justify-between py-4 border-b border-border last:border-0 hover:bg-secondary/50 -mx-4 px-4 rounded transition-colors group"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors">{cor.subject}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="font-medium">{job?.jobNumber || "N/A"}</span>
                      <span>•</span>
                      <span>{customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}</span>
                      {job?.consultantId && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{job.consultantId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <Badge variant="outline" className="text-sm font-medium">
                      {cor.scheduledAt ? new Date(cor.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "-"}
                    </Badge>
                  </div>
                </Link>
              )
            })
          ) : (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No scheduled follow-ups</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; href?: string }) {
  const content = (
    <CardContent className="p-6">
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="text-base text-muted-foreground mb-1">{label}</p>
          <p className="text-4xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href}>
        <Card className="shadow-md hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-primary/20">
          {content}
        </Card>
      </Link>
    )
  }

  return (
    <Card className="shadow-md">
      {content}
    </Card>
  )
}
