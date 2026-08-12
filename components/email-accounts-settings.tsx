"use client"

import { InboundEmailSettings } from "@/components/inbound-email-settings"
import { SalespersonCredentialsSettings } from "@/components/salesperson-credentials-settings"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface EmailAccountsSettingsProps {
  canManageOutbound: boolean
  canManageInbound: boolean
}

export function EmailAccountsSettings({
  canManageOutbound,
  canManageInbound,
}: EmailAccountsSettingsProps) {
  if (!canManageOutbound && !canManageInbound) return null

  // Single permitted panel: render it directly, no tab bar. The blurb has to
  // follow, or a manager (outbound only) is told about inbound IMAP accounts
  // they cannot see or reach.
  if (canManageOutbound && !canManageInbound) {
    return (
      <Section description="Outbound sending mailboxes per salesperson.">
        <SalespersonCredentialsSettings />
      </Section>
    )
  }
  if (canManageInbound && !canManageOutbound) {
    return (
      <Section description="Inbound IMAP intake accounts.">
        <InboundEmailSettings />
      </Section>
    )
  }

  return (
    <Section description="Outbound sending mailboxes per salesperson and inbound IMAP intake accounts.">
      <Tabs defaultValue="outbound">
        <TabsList>
          <TabsTrigger value="outbound">Outbound</TabsTrigger>
          <TabsTrigger value="inbound">Inbound</TabsTrigger>
        </TabsList>
        <TabsContent value="outbound">
          <SalespersonCredentialsSettings />
        </TabsContent>
        <TabsContent value="inbound">
          <InboundEmailSettings />
        </TabsContent>
      </Tabs>
    </Section>
  )
}

function Section({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">Email Accounts</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
