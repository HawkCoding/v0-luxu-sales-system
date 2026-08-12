"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { useData } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import { formatDisplayDate } from "@/lib/date-format"
import { getCanonicalPipelineStage, getPipelineStageLabel, PIPELINE_STAGES, type PipelineStage } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PreviewAndSendDialog } from "@/components/preview-and-send-dialog"
import { AlertTriangle, Briefcase, Clock, CreditCard, FileText, Loader2, Send, X } from "lucide-react"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ScheduledEmailDetail {
  id: string
  bookingId: string
  bookingNumber: string | null
  kind: string | null
  subject: string
  bodyHtml: string | null
  to: string
  error?: string
}

export default function DashboardPage() {
  const { data, isLoading, mutate } = useData(["bookings", "correspondences", "customers"])
  const { can } = useRole()
  // /api/error-logs is admin+manager only — consultants and readonly would just get a 403.
  const canViewErrorLogs = can("view:error_logs")
  const { data: errorLogCountData } = useSWR<{ count: number }>(
    canViewErrorLogs ? "/api/error-logs?resolved=false&count=true" : null,
    fetcher,
  )
  const unresolvedErrors = errorLogCountData?.count ?? 0
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sendTarget, setSendTarget] = useState<ScheduledEmailDetail | null>(null)
  const [sendOpen, setSendOpen] = useState(false)

  async function openScheduledSend(correspondenceId: string) {
    setBusyId(correspondenceId)
    try {
      const res = await fetch(`/api/correspondence/${correspondenceId}`)
      const payload = (await res.json()) as ScheduledEmailDetail
      if (!res.ok) throw new Error(payload.error ?? "Scheduled email could not be loaded")
      setSendTarget(payload)
      setSendOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scheduled email could not be loaded")
    } finally {
      setBusyId(null)
    }
  }

  async function dismissScheduled(correspondenceId: string) {
    setBusyId(correspondenceId)
    try {
      const res = await fetch(`/api/correspondence/${correspondenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(payload.error ?? "Scheduled email could not be dismissed")
      toast.success("Scheduled email dismissed")
      await mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scheduled email could not be dismissed")
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-bg-raised rounded-lg" />)}</div></div>
  }

  const stageCount = PIPELINE_STAGES.map(s => ({
    ...s,
    count: data.bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === s.key).length,
  }))

  const openJobs = data.bookings.filter((b: { stage: PipelineStage }) => {
    const canonical = getCanonicalPipelineStage(b.stage)
    return canonical !== "closed" && canonical !== "lost"
  }).length
  const quotedJobs = data.bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === "quote_sent").length
  const depositsPaid = data.bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === "deposit_paid").length
  const fullPayments = data.bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === "final_paid").length

  const recentJobs = [...data.bookings].sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  const upcomingFollowups = data.correspondences
    .filter((c: { status: string; scheduledAt?: string }) => c.status === "scheduled" && c.scheduledAt)
    .sort((a: { scheduledAt?: string }, b: { scheduledAt?: string }) =>
      new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
    )
    .slice(0, 5)

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="pb-1">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-base text-muted-foreground mt-2">Overview of your sales operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        <StatCard icon={Briefcase} label="Open Jobs" value={openJobs} href="/app/bookings" />
        <StatCard icon={FileText} label="Quotes Sent" value={quotedJobs} href="/app/pipeline" />
        <StatCard icon={CreditCard} label="Deposits Paid" value={depositsPaid} href="/app/payments" />
        <StatCard icon={CreditCard} label="Full Payment" value={fullPayments} href="/app/payments" />
        {canViewErrorLogs && (
          <StatCard icon={AlertTriangle} label="Unresolved Errors" value={unresolvedErrors} href="/app/settings/error-log" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg border-2 border-stroke-strong bg-bg-white">
          <CardHeader className="pb-4 bg-bg-inset">
            <CardTitle className="text-xl font-semibold text-text-heading">Jobs by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCount.map(s => (
              <div key={s.key} className="flex items-center justify-between py-2.5">
                <span className="text-base text-text-body font-medium">{s.label}</span>
                <Badge variant="secondary" className="text-base font-bold min-w-[3rem] justify-center h-8">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-lg border-2 border-stroke-strong bg-bg-white">
          <CardHeader className="pb-4 bg-bg-inset">
            <CardTitle className="text-xl font-semibold text-text-heading">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {recentJobs.map((booking: { id: string; bookingNumber: string; customerId: string; stage: string; createdAt: string }) => {
              const customer = data.customers.find((c: { id: string }) => c.id === booking.customerId)
              return (
                <Link key={booking.id} href={`/app/bookings/${booking.id}`} className="flex items-center justify-between py-4 border-b border-stroke last:border-0 hover:bg-bg-raised -mx-4 px-4 rounded transition-colors group">
                  <div>
                    <p className="font-medium text-text-heading group-hover:text-accent-link transition-colors">{booking.bookingNumber}</p>
                    <p className="text-text-muted mt-1">{customer?.firstName} {customer?.lastName}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-sm">{getPipelineStageLabel(booking.stage)}</Badge>
                    <p className="text-sm text-text-muted mt-1">{formatDisplayDate(booking.createdAt)}</p>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-2 border-stroke-strong bg-bg-white">
        <CardHeader className="pb-4 bg-bg-inset">
          <CardTitle className="text-xl font-semibold text-text-heading flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
              <Clock className="w-6 h-6 text-accent-hover" />
            </div>
            <span>Upcoming Follow-ups</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {upcomingFollowups.length > 0 ? (
            upcomingFollowups.map((cor: { id: string; subject: string; scheduledAt?: string; bookingId: string }) => {
              const booking = data.bookings.find((b: { id: string }) => b.id === cor.bookingId)
              const customer = booking ? data.customers.find((c: { id: string }) => c.id === booking.customerId) : null
              const busy = busyId === cor.id

              return (
                <div
                  key={cor.id}
                  className="flex items-center justify-between gap-3 py-4 border-b border-stroke last:border-0 -mx-4 px-4"
                >
                  <Link href={`/app/bookings/${cor.bookingId}`} className="space-y-1 flex-1 min-w-0 group">
                    <p className="font-medium text-text-heading group-hover:text-accent-link transition-colors truncate">
                      {cor.subject}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-text-muted">
                      <span className="font-medium">{booking?.bookingNumber || "N/A"}</span>
                      <span>•</span>
                      <span>{customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-sm font-medium">
                      {cor.scheduledAt ? formatDisplayDate(cor.scheduledAt) : "-"}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => openScheduledSend(cor.id)}
                      disabled={busy}
                      aria-label={`Send scheduled email: ${cor.subject}`}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissScheduled(cor.id)}
                      disabled={busy}
                      aria-label={`Dismiss scheduled email: ${cor.subject}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-text-muted-extra/40 mx-auto mb-3" />
              <p className="text-text-muted">No scheduled follow-ups</p>
            </div>
          )}
        </CardContent>
      </Card>

      {sendTarget ? (
        <PreviewAndSendDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          title="Send scheduled email"
          description={`${sendTarget.bookingNumber ?? "Booking"} — review before sending.`}
          bookingId={sendTarget.bookingId}
          initialSubject={sendTarget.subject}
          bodyHtml={sendTarget.bodyHtml ?? ""}
          to={sendTarget.to}
          kind={sendTarget.kind ?? "email"}
          scheduledCorrespondenceId={sendTarget.id}
          onSent={async () => {
            setSendTarget(null)
            await mutate()
          }}
        />
      ) : null}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; href?: string }) {
  const content = (
    <CardContent className="p-5 h-full flex items-center">
      <div className="flex items-center gap-4 w-full">
        <div className="w-12 h-12 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-accent-hover" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-text-muted mb-1 leading-tight">{label}</p>
          <p className="text-3xl font-bold text-text-heading">{value}</p>
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="h-full block">
        <Card className="h-full shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 border-stroke-strong bg-bg-white hover:border-accent">
          {content}
        </Card>
      </Link>
    )
  }

  return (
    <Card className="h-full shadow-lg border-2 border-stroke-strong bg-bg-white">
      {content}
    </Card>
  )
}
