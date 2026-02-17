"use client"

import { useState } from "react"
import { RovosEnquiryForm } from "@/components/rovos-enquiry-form"
import { CheckCircle } from "lucide-react"

export default function RovosEnquirePage() {
  const [submitted, setSubmitted] = useState<{ jobNumber: string } | null>(null)

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-payment-green/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-payment-green" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            Enquiry Submitted
          </h1>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Thank you for your enquiry. Our team will be in touch shortly.
          </p>
          <div className="bg-card border border-border rounded-lg p-6 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Your Reference Number</p>
            <p className="text-2xl font-semibold text-foreground tracking-wide">{submitted.jobNumber}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Please save this reference number for your records. You can quote it in any correspondence with our team.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Luxus Travel & Tours</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Rovos Rail Enquiry</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center">
            <span className="text-sm font-semibold text-card" style={{ fontFamily: "var(--font-inter)" }}>LT</span>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <RovosEnquiryForm onSuccess={(data) => setSubmitted(data)} />
      </main>
    </div>
  )
}
