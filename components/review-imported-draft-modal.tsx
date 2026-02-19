"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
import { type ParsedDraft, validateDraft, countRequiredComplete } from "@/lib/import/parseEmailDraft"
import { useRouter } from "next/navigation"

interface ReviewImportedDraftModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parsedDraft: ParsedDraft | null
  onBack: () => void
}

export function ReviewImportedDraftModal({ open, onOpenChange, parsedDraft, onBack }: ReviewImportedDraftModalProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<ParsedDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [customerExpanded, setCustomerExpanded] = useState(true)
  const [tripExpanded, setTripExpanded] = useState(true)
  const [guestsExpanded, setGuestsExpanded] = useState(true)
  const [notesExpanded, setNotesExpanded] = useState(false)

  useEffect(() => {
    if (parsedDraft) {
      setDraft({ ...parsedDraft })
    }
  }, [parsedDraft])

  if (!draft) return null

  const validation = validateDraft(draft)
  const progress = countRequiredComplete(draft)

  const updateDraft = (path: string, value: any) => {
    setDraft(prev => {
      if (!prev) return prev
      const keys = path.split('.')
      const updated = { ...prev }
      let current: any = updated
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] }
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
      return updated
    })
  }

  const handleSave = async (openAfterSave: boolean = false) => {
    if (!validation.isValid) return
    setSaving(true)

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: draft.rawText,
          purpose: "quote",
          title: "Mr",
          name: draft.customer.firstName,
          surname: draft.customer.surname,
          contactNumber: draft.customer.phone,
          email: draft.customer.email,
          country: "Other",
          direction: draft.trip.route || "Pretoria to Cape Town",
          departureDate: draft.trip.departureDate,
          noOfSuites: draft.guests.suites,
          noOfAdults: draft.guests.adults,
          noOfChildren: draft.guests.children,
          suiteTypes: draft.guests.suiteType ? [draft.guests.suiteType] : ["Pullman Twin Suite"],
          termsAccepted: true,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        onOpenChange(false)
        
        if (openAfterSave && data.jobId) {
          router.push(`/app/jobs/${data.jobId}`)
        } else {
          window.location.reload()
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>Review Imported Draft</DialogTitle>
              <DialogDescription className="mt-1">
                Confirm extracted details and complete missing fields
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={validation.isValid ? "default" : "secondary"} className="text-sm">
                {progress.completed} / {progress.total} required
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
          {/* Left column: Form sections */}
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Customer Section */}
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setCustomerExpanded(!customerExpanded)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {customerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Customer Details
                  </CardTitle>
                  {!draft.customer.firstName || !draft.customer.surname || (!draft.customer.email && !draft.customer.phone) ? (
                    <Badge variant="destructive" className="text-xs">Incomplete</Badge>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
              </CardHeader>
              {customerExpanded && (
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        First name <span className="text-destructive">*</span>
                        {draft.confidence['customer.firstName'] === 'low' && (
                          <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                        )}
                      </Label>
                      <Input
                        value={draft.customer.firstName}
                        onChange={(e) => updateDraft('customer.firstName', e.target.value)}
                        placeholder="Enter first name"
                        className={!draft.customer.firstName ? 'border-destructive' : ''}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Surname <span className="text-destructive">*</span>
                        {draft.confidence['customer.surname'] === 'low' && (
                          <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                        )}
                      </Label>
                      <Input
                        value={draft.customer.surname}
                        onChange={(e) => updateDraft('customer.surname', e.target.value)}
                        placeholder="Enter surname"
                        className={!draft.customer.surname ? 'border-destructive' : ''}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Email <span className="text-destructive">*</span>
                      {draft.confidence['customer.email'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Input
                      type="email"
                      value={draft.customer.email}
                      onChange={(e) => updateDraft('customer.email', e.target.value)}
                      placeholder="email@example.com"
                      className={!draft.customer.email && !draft.customer.phone ? 'border-destructive' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Phone <span className="text-destructive">*</span>
                      {draft.confidence['customer.phone'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Input
                      value={draft.customer.phone}
                      onChange={(e) => updateDraft('customer.phone', e.target.value)}
                      placeholder="+27 XX XXX XXXX"
                      className={!draft.customer.email && !draft.customer.phone ? 'border-destructive' : ''}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Trip / Supplier Section */}
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setTripExpanded(!tripExpanded)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {tripExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Trip Details
                  </CardTitle>
                  {!draft.trip.supplier || !draft.trip.departureDate ? (
                    <Badge variant="destructive" className="text-xs">Incomplete</Badge>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
              </CardHeader>
              {tripExpanded && (
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Supplier <span className="text-destructive">*</span>
                      {draft.confidence['trip.supplier'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Select value={draft.trip.supplier} onValueChange={(v) => updateDraft('trip.supplier', v)}>
                      <SelectTrigger className={!draft.trip.supplier ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Rovos Rail">Rovos Rail</SelectItem>
                        <SelectItem value="Blue Train">Blue Train</SelectItem>
                        <SelectItem value="Hotel Package">Hotel Package</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Route / Direction <span className="text-destructive">*</span>
                      {draft.confidence['trip.route'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Input
                      value={draft.trip.route}
                      onChange={(e) => updateDraft('trip.route', e.target.value)}
                      placeholder="e.g., Pretoria to Cape Town"
                      className={!draft.trip.route ? 'border-destructive' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Departure Date <span className="text-destructive">*</span>
                      {draft.confidence['trip.departureDate'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Input
                      type="date"
                      value={draft.trip.departureDate}
                      onChange={(e) => updateDraft('trip.departureDate', e.target.value)}
                      className={!draft.trip.departureDate ? 'border-destructive' : ''}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Guests Section */}
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setGuestsExpanded(!guestsExpanded)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {guestsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Guests & Accommodation
                  </CardTitle>
                  {!draft.guests.adults || !draft.guests.suites ? (
                    <Badge variant="destructive" className="text-xs">Incomplete</Badge>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
              </CardHeader>
              {guestsExpanded && (
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Adults <span className="text-destructive">*</span>
                        {draft.confidence['guests.adults'] === 'low' && (
                          <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                        )}
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={draft.guests.adults || ''}
                        onChange={(e) => updateDraft('guests.adults', parseInt(e.target.value) || 0)}
                        placeholder="Number of adults"
                        className={!draft.guests.adults ? 'border-destructive' : ''}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Children</Label>
                      <Input
                        type="number"
                        min="0"
                        value={draft.guests.children || ''}
                        onChange={(e) => updateDraft('guests.children', parseInt(e.target.value) || 0)}
                        placeholder="Number of children"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Number of Suites <span className="text-destructive">*</span>
                      {draft.confidence['guests.suites'] === 'low' && (
                        <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={draft.guests.suites || ''}
                      onChange={(e) => updateDraft('guests.suites', parseInt(e.target.value) || 0)}
                      placeholder="Number of suites"
                      className={!draft.guests.suites ? 'border-destructive' : ''}
                    />
                  </div>
                  {draft.trip.supplier !== 'Hotel Package' && (
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Suite Type
                        {draft.confidence['guests.suiteType'] === 'low' && (
                          <Badge variant="outline" className="text-[10px] h-4">Check</Badge>
                        )}
                      </Label>
                      <Select value={draft.guests.suiteType} onValueChange={(v) => updateDraft('guests.suiteType', v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select suite type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pullman Double Suite">Pullman Double Suite</SelectItem>
                          <SelectItem value="Pullman Twin Suite">Pullman Twin Suite</SelectItem>
                          <SelectItem value="Deluxe Double Suite">Deluxe Double Suite</SelectItem>
                          <SelectItem value="Deluxe Twin Suite">Deluxe Twin Suite</SelectItem>
                          <SelectItem value="Royal Double Suite">Royal Double Suite</SelectItem>
                          <SelectItem value="Royal Twin Suite">Royal Twin Suite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Notes Section */}
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setNotesExpanded(!notesExpanded)}>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {notesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Notes & Original Text
                </CardTitle>
              </CardHeader>
              {notesExpanded && (
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Additional Notes</Label>
                    <Textarea
                      value={draft.notes}
                      onChange={(e) => updateDraft('notes', e.target.value)}
                      placeholder="Any additional notes..."
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">Original Pasted Text (Preview)</Label>
                    <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                      {draft.rawText}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* Right column: Missing & Warnings */}
          <div className="space-y-4 overflow-y-auto border-l pl-4 hidden lg:block">
            <div>
              <h3 className="text-sm font-semibold mb-2">Validation Status</h3>
              <div className="space-y-2">
                {validation.missingRequired.length > 0 && (
                  <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        Missing Required
                      </div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {validation.missingRequired.map((field, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-destructive mt-0.5">•</span>
                            <span>{field}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {validation.warnings.length > 0 && (
                  <Card className="border-yellow-500/50 bg-yellow-50">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-yellow-700">
                        <AlertCircle className="w-4 h-4" />
                        Warnings
                      </div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {validation.warnings.map((warning, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-yellow-600 mt-0.5">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {validation.isValid && validation.warnings.length === 0 && (
                  <Card className="border-green-500/50 bg-green-50">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        All required fields complete
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={saving}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => handleSave(false)} disabled={!validation.isValid || saving}>
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button size="sm" variant="default" onClick={() => handleSave(true)} disabled={!validation.isValid || saving}>
              {saving ? "Saving..." : "Save & Open"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
