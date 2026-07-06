"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface SendVoucherButtonProps {
  voucherId: string | null
  bookingNumber: string
  disabled?: boolean
  onSent?: () => Promise<void> | void
}

export function SendVoucherButton({ voucherId, bookingNumber, disabled, onSent }: SendVoucherButtonProps) {
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!voucherId) {
      toast.error("Generate the voucher PDF before sending")
      return
    }
    setSending(true)
    try {
      const response = await fetch(`/api/vouchers/${voucherId}/send`, { method: "POST" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error ?? "Voucher could not be sent")
      }
      toast.success(`Voucher ${bookingNumber} sent`)
      await onSent?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be sent")
    } finally {
      setSending(false)
    }
  }

  return (
    <Button size="sm" variant="default" disabled={disabled || sending || !voucherId} onClick={handleSend}>
      {sending ? "Sending…" : "Send Voucher"}
    </Button>
  )
}
