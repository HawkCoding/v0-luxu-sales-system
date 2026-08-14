"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Clipboard, PenLine } from "lucide-react"
import {
  parseEmailDraft,
  STAFF_LEAD_SOURCE_OPTIONS,
  type ParsedDraft,
  type StaffLeadSource,
} from "@/lib/import/parseEmailDraft"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import { ReviewImportedDraftModal } from "@/components/review-imported-draft-modal"
import { ProgressDialog } from "@/components/progress-dialog"
import { useSuppliers } from "@/lib/use-data"

interface PresetCustomer {
  id: string
  title?: string | null
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  country?: string | null
  province?: string | null
}

interface NewEnquiryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (jobId: string) => void
  presetCustomer?: PresetCustomer
}

const ENQUIRY_SAVE_STEPS = [
  "Reading customer details",
  "Saving customer record",
  "Creating job",
  "Saving travel details",
  "Finalising enquiry",
  "Opening job",
]

function emptyDraft(): ParsedDraft {
  return {
    customer: { title: "", firstName: "", surname: "", email: "", phone: "", country: "", province: "" },
    trip: { supplier: "", route: "", departureDate: "", purpose: "quote", packageOption: "", hotelOption: "", hotelPhase: "", extendStay: null, flightBooking: "", flightDepartureDate: "" },
    guests: { adults: 0, children: 0, childAges: [], suites: 0, suitePhrases: [], suiteType: "" },
    additionalServices: { requested: false, details: "" },
    termsAccepted: true,
    notes: "",
    formFields: { title: "", country: "", province: "", packageOption: "", hotelOption: "", flightBooking: "", flightDepartureDate: "", direction: "", supplier: "", departureDateRaw: "", suitePhrases: [], childAges: [], hotelPhase: "", extendStay: null, additionalServicesDetails: "" },
    confidence: {},
    rawText: "",
  }
}

function draftFromPresetCustomer(preset: PresetCustomer): ParsedDraft {
  const base = emptyDraft()
  return {
    ...base,
    customer: {
      title: preset.title ?? "",
      firstName: preset.firstName ?? "",
      surname: preset.lastName ?? "",
      email: preset.email ?? "",
      phone: preset.phone ?? "",
      country: preset.country ?? "",
      province: preset.province ?? "",
    },
    formFields: {
      ...base.formFields,
      title: preset.title ?? "",
      country: preset.country ?? "",
      province: preset.province ?? "",
    },
    linkedCustomerId: preset.id,
  }
}

type Screen = "tabs" | "review" | "saving"

export function NewEnquiryDialog({ open, onOpenChange, onSaved, presetCustomer }: NewEnquiryDialogProps) {
  const [screen, setScreen] = useState<Screen>("tabs")
  const [activeTab, setActiveTab] = useState<"paste" | "manual">("paste")
  const [pasteText, setPasteText] = useState("")
  // No default: a staff-typed enquiry recorded as a web form submission is what made lead-source
  // reporting wrong, and guessing a source is no better than the wrong one.
  const [manualSource, setManualSource] = useState<StaffLeadSource | "">("")
  const [parsedDraft, setParsedDraft] = useState<ParsedDraft | null>(null)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveStepIndex, setSaveStepIndex] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [failedDraft, setFailedDraft] = useState<ParsedDraft | null>(null)
  const { data: suppliers } = useSuppliers()
  const trainOperatorNames = (suppliers ?? [])
    .filter((supplier) => supplier.kind === "train_operator" && supplier.active)
    .map((supplier) => supplier.name)

  useEffect(() => {
    if (!open) return
    if (presetCustomer) {
      setParsedDraft(draftFromPresetCustomer(presetCustomer))
      setScreen("review")
    } else {
      setScreen("tabs")
    }
  }, [open, presetCustomer])

  useEffect(() => {
    if (screen !== "saving" || saveError) return
    const timer = window.setInterval(() => {
      setSaveProgress((c) => Math.min(c + 14, 94))
      setSaveStepIndex((c) => {
        const max = ENQUIRY_SAVE_STEPS.length - 2
        return c < max ? c + 1 : c
      })
    }, 450)
    return () => window.clearInterval(timer)
  }, [screen, saveError])

  const resetAndClose = () => {
    onOpenChange(false)
    window.setTimeout(() => {
      setPasteText("")
      setManualSource("")
      setParsedDraft(null)
      setSaveError(null)
      setFailedDraft(null)
      setScreen("tabs")
    }, 300)
  }

  const handlePasteImport = () => {
    if (!pasteText.trim()) return
    setParsedDraft(parseEmailDraft(pasteText, { trainOperatorNames }))
    setScreen("review")
  }

  const handleManualEntry = () => {
    if (!manualSource) return
    setParsedDraft({ ...emptyDraft(), source: manualSource })
    setScreen("review")
  }

  const handleBackFromReview = () => {
    if (presetCustomer) {
      resetAndClose()
      return
    }
    setScreen("tabs")
  }

  const handleSaveAndOpen = async (draft: ParsedDraft) => {
    setParsedDraft(draft)
    setSaveError(null)
    setFailedDraft(null)
    setSaveProgress(5)
    setSaveStepIndex(0)
    setScreen("saving")

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEnquiryImportPayload(draft)),
      })

      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Please review the enquiry and try again."
        throw new Error(message)
      }

      const jobId =
        payload && typeof payload === "object" && "jobId" in payload && typeof payload.jobId === "string"
          ? payload.jobId
          : null

      if (!jobId) throw new Error("The enquiry was saved, but the new job could not be opened.")

      setSaveStepIndex(ENQUIRY_SAVE_STEPS.length - 1)
      setSaveProgress(100)
      window.setTimeout(() => {
        onOpenChange(false)
        onSaved(jobId)
      }, 350)
    } catch (error) {
      setFailedDraft(draft)
      setSaveError(error instanceof Error ? error.message : "Please review the enquiry and try again.")
    }
  }

  const handleBackToReviewAfterError = () => {
    if (failedDraft) setParsedDraft(failedDraft)
    setSaveError(null)
    setScreen("review")
  }

  const handleDismissError = () => {
    setSaveError(null)
    setFailedDraft(null)
    setParsedDraft(null)
    setPasteText("")
    setScreen("tabs")
  }

  return (
    <>
      <Dialog open={open && screen === "tabs"} onOpenChange={(next) => { if (!next) resetAndClose() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Enquiry</DialogTitle>
            <DialogDescription>Choose how to capture this enquiry.</DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "paste" | "manual")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste">
                <Clipboard className="w-4 h-4 mr-1.5" />
                Paste Email
              </TabsTrigger>
              <TabsTrigger value="manual">
                <PenLine className="w-4 h-4 mr-1.5" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Paste an email or enquiry text. The system will extract customer and trip details for you to review.
              </p>
              <Textarea
                placeholder="Paste the email or text content here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="text-sm field-sizing-fixed h-48 resize-none overflow-y-auto"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetAndClose}>Cancel</Button>
                <Button size="sm" onClick={handlePasteImport} disabled={!pasteText.trim()}>
                  Review &amp; Import
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Skip email paste and fill in all enquiry fields directly. All sections will start blank.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="manual-enquiry-source">How did this enquiry reach us?</Label>
                <Select
                  value={manualSource}
                  onValueChange={(value) => setManualSource(value as StaffLeadSource)}
                >
                  <SelectTrigger id="manual-enquiry-source">
                    <SelectValue placeholder="Select a lead source" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_LEAD_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Recorded on the booking so lead-source reporting reflects where the enquiry
                  actually came from.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetAndClose}>Cancel</Button>
                <Button size="sm" onClick={handleManualEntry} disabled={!manualSource}>
                  Start Manual Enquiry
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ReviewImportedDraftModal
        open={open && screen === "review"}
        onOpenChange={(next) => { if (!next) resetAndClose() }}
        parsedDraft={parsedDraft}
        onBack={handleBackFromReview}
        onSaveAndOpen={handleSaveAndOpen}
      />

      <ProgressDialog
        open={open && screen === "saving"}
        title="Preparing enquiry"
        description="The new job will open automatically when it is ready."
        progress={saveProgress}
        currentMessage={ENQUIRY_SAVE_STEPS[saveStepIndex] ?? ENQUIRY_SAVE_STEPS[0]}
        completedMessages={ENQUIRY_SAVE_STEPS.slice(0, saveStepIndex)}
        errorMessage={saveError}
        onDismiss={handleDismissError}
        onRetry={handleBackToReviewAfterError}
      />
    </>
  )
}
