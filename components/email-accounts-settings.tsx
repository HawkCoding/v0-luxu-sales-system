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

  // Single permitted panel: render it directly, no tab bar.
  if (canManageOutbound && !canManageInbound) {
    return <Section>{<SalespersonCredentialsSettings />}</Section>
  }
  if (canManageInbound && !canManageOutbound) {
    return <Section>{<InboundEmailSettings />}</Section>
  }

  return (
    <Section>
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

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">Email Accounts</h2>
        <p className="text-xs text-muted-foreground">
          Outbound sending mailboxes per salesperson and inbound IMAP intake accounts.
        </p>
      </div>
      {children}
    </div>
  )
}
