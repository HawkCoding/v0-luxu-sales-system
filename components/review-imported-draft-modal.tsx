"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
import {
  countRequiredComplete,
  nightsBetween,
  validateDraft,
  type ParsedDraft,
} from "@/lib/import/parseEmailDraft"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import {
  applySuiteResolutions,
  getDraftSuiteUnits,
  normalizeDraftSuiteUnits,
  updateDraftSuiteAxisAtIndex,
  updateDraftSuiteCount,
} from "@/lib/import/suite-selections"
import { suiteVocabularyFromSupplierDetail, type SuiteAxis } from "@/lib/suites/suite-vocabulary"
import { useActiveSuppliers, useSupplierDetail } from "@/lib/use-data"
import { resolveDraftSupplierId } from "@/lib/import/resolve-draft-supplier"
import {
  SUPPLIER_KIND_LABELS,
  getSupplierVocabulary,
  type SupplierKind,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  draftStorageKey,
  readDraftEnvelope,
  readRawDraft,
  removeDraft,
  serializeDraft,
  writeDraft,
} from "@/lib/drafts/draft-storage"
import { useUnloadGuard } from "@/hooks/use-unload-guard"
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"

/** Bump whenever the persisted shape below changes -- see lib/drafts/draft-storage.ts. */
const ENQUIRY_DRAFT_SCHEMA_VERSION = 2
const ENQUIRY_DRAFT_KEY = draftStorageKey("enquiry", "new")
const ENQUIRY_DRAFT_DEBOUNCE_MS = 1500

interface EnquiryDraftPayload {
  draft: ParsedDraft
  dirtyFields: string[]
}

function isEnquiryDraftPayload(data: unknown): data is EnquiryDraftPayload {
  if (!data || typeof data !== "object") return false
  const candidate = data as Partial<EnquiryDraftPayload>
  return (
    !!candidate.draft &&
    typeof candidate.draft === "object" &&
    Array.isArray(candidate.dirtyFields)
  )
}

const CONFIG_AXES: ReadonlyArray<{
  axis: Exclude<SuiteAxis, "suiteType">
  label: string
  idField: "bedroomTypeId" | "bedroomLayoutId" | "bathroomTypeId"
  vocabKey: "bedroomTypes" | "bedroomLayouts" | "bathroomTypes"
  allowedKey: "bedroomTypeIds" | "bedroomLayoutIds" | "bathroomTypeIds"
}> = [
  { axis: "bedroomType", label: "Bedroom Type", idField: "bedroomTypeId", vocabKey: "bedroomTypes", allowedKey: "bedroomTypeIds" },
  { axis: "bedroomLayout", label: "Bedroom Layout", idField: "bedroomLayoutId", vocabKey: "bedroomLayouts", allowedKey: "bedroomLayoutIds" },
  { axis: "bathroomType", label: "Bathroom Type", idField: "bathroomTypeId", vocabKey: "bathroomTypes", allowedKey: "bathroomTypeIds" },
]

interface FieldFlagsProps {
  confidence?: "high" | "low"
  dirty?: boolean
  learned?: boolean
}

/**
 * Per-field status badge. A field the consultant has edited shows nothing -- the parser's
 * confidence for it is stale the moment a human overrides it, which is why the old inline
 * `confidence === 'low'` checks left a "Check" badge stuck on corrected fields forever.
 */
function FieldFlags({ confidence, dirty, learned }: FieldFlagsProps) {
  if (dirty) return null
  if (learned) {
    return (
      <Badge variant="secondary" className="text-[10px] h-4" title="Filled from a previously learned phrase — confirm or correct it">
        Learned
      </Badge>
    )
  }
  if (confidence === "low") {
    return (
      <Badge variant="outline" className="text-[10px] h-4" title="Parsed with low confidence — please check">
        Check
      </Badge>
    )
  }
  return null
}

interface ReviewImportedDraftModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parsedDraft: ParsedDraft | null
  onBack: () => void
  onSaveAndOpen: (draft: ParsedDraft) => void
}

export function ReviewImportedDraftModal({ open, onOpenChange, parsedDraft, onBack, onSaveAndOpen }: ReviewImportedDraftModalProps) {
  const [draft, setDraft] = useState<ParsedDraft | null>(null)
  const [saving, setSaving] = useState(false)
  /** Field paths the consultant has edited -- suppresses stale parser-confidence badges. */
  const [dirtyFields, setDirtyFields] = useState<ReadonlySet<string>>(new Set())
  const [customerExpanded, setCustomerExpanded] = useState(true)
  const [tripExpanded, setTripExpanded] = useState(true)
  const [guestsExpanded, setGuestsExpanded] = useState(true)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [validationExpanded, setValidationExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('review-validation-expanded')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })

  // Save validation expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('review-validation-expanded', validationExpanded.toString())
    }
  }, [validationExpanded])

  useEffect(() => {
    if (parsedDraft) {
      setDraft(normalizeDraftSuiteUnits(parsedDraft))
      setDirtyFields(new Set())
    }
  }, [parsedDraft])

  // A draft found on disk from a previous, unsaved session -- offered via the banner below rather
  // than applied automatically, since it could belong to a completely different paste than whatever
  // was just parsed. `hasEdits` gates the offer so it never appears once the consultant has actually
  // started correcting the fresh parse.
  const [storedDraftOffer, setStoredDraftOffer] = useState<EnquiryDraftPayload | null>(null)
  const hasEdits = dirtyFields.size > 0

  useEffect(() => {
    if (!open) return
    const envelope = readDraftEnvelope<EnquiryDraftPayload>(readRawDraft(ENQUIRY_DRAFT_KEY), {
      version: ENQUIRY_DRAFT_SCHEMA_VERSION,
      isValid: isEnquiryDraftPayload,
    })
    setStoredDraftOffer(envelope?.data ?? null)
  }, [open])

  // Debounced autosave of whatever the consultant has actually corrected -- system reconciliation
  // (supplier id backfill, suite axis resolution) doesn't touch `dirtyFields`, so it never triggers
  // a write on its own.
  useEffect(() => {
    if (!open || !draft || !hasEdits) return
    const timeout = window.setTimeout(() => {
      writeDraft(
        ENQUIRY_DRAFT_KEY,
        serializeDraft<EnquiryDraftPayload>(
          { draft, dirtyFields: Array.from(dirtyFields) },
          { version: ENQUIRY_DRAFT_SCHEMA_VERSION, recordUpdatedAt: null },
        ),
      )
    }, ENQUIRY_DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [open, draft, dirtyFields, hasEdits])

  function restoreStoredDraft() {
    if (!storedDraftOffer) return
    setDraft(storedDraftOffer.draft)
    setDirtyFields(new Set(storedDraftOffer.dirtyFields))
    setStoredDraftOffer(null)
    toast.success("Restored your unsaved enquiry draft.")
  }

  function discardStoredDraft() {
    removeDraft(ENQUIRY_DRAFT_KEY)
    setStoredDraftOffer(null)
  }

  // Two ways out of this modal need the same guard: the dialog's own close (backdrop/Escape/X) and
  // the "Back" button, which bypasses `onOpenChange` entirely. `pendingAction` tracks which one is
  // waiting on confirmation so a single confirm dialog covers both.
  const [pendingAction, setPendingAction] = useState<"close" | "back" | null>(null)

  function guardDismiss(event: { preventDefault: () => void }) {
    if (!hasEdits) return
    event.preventDefault()
    setPendingAction("close")
  }

  function requestClose() {
    if (!hasEdits) {
      removeDraft(ENQUIRY_DRAFT_KEY)
      onOpenChange(false)
      return
    }
    setPendingAction("close")
  }

  function requestBack() {
    if (!hasEdits) {
      onBack()
      return
    }
    setPendingAction("back")
  }

  function confirmPendingAction() {
    const action = pendingAction
    setPendingAction(null)
    removeDraft(ENQUIRY_DRAFT_KEY)
    if (action === "back") onBack()
    else onOpenChange(false)
  }

  useUnloadGuard(open && hasEdits)

  const { data: suppliers = [] } = useActiveSuppliers()
  // Suppliers that may head a booking of their own -- every train operator, plus a hotel sold
  // standalone (Kruger Shalati, a stationary train carriage let per room per night). The add-on
  // hotels a rail journey hangs a stay off are excluded: they are legs, never the booking.
  const primarySuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.sellsStandalone && supplier.active),
    [suppliers],
  )
  const primarySupplierGroups = useMemo(() => {
    const groups = new Map<SupplierKind, typeof primarySuppliers>()
    for (const supplier of primarySuppliers) {
      groups.set(supplier.kind, [...(groups.get(supplier.kind) ?? []), supplier])
    }
    return [...groups.entries()]
  }, [primarySuppliers])
  const selectedSupplier = useMemo(() => {
    if (!draft) return null

    const supplierId = draft.trip.supplierId
    if (supplierId) {
      return primarySuppliers.find((supplier) => supplier.id === supplierId) ?? null
    }

    // The parser only ever produces wording ("Blue Train"), never an id, so fall back to the same
    // never-guess matcher the server uses. An exact-string comparison here silently failed on every
    // real-world variant ("The Blue Train"), leaving the required Supplier select empty.
    const matchedId = resolveDraftSupplierId(draft.trip.supplier, primarySuppliers)
    return matchedId ? primarySuppliers.find((supplier) => supplier.id === matchedId) ?? null : null
  }, [draft, primarySuppliers])
  // A stay is a different shape of enquiry, not a different screen: check-in/check-out instead of
  // route + departure, rooms instead of suites. The vocabulary supplies every label so a future
  // standalone kind needs no further branching here.
  const isStay = selectedSupplier?.kind === "hotel_property"
  const vocabulary = getSupplierVocabulary(selectedSupplier?.kind ?? "train_operator")
  const unitNounPluralLabel =
    vocabulary.unitNounPlural.charAt(0).toUpperCase() + vocabulary.unitNounPlural.slice(1)
  const { data: supplierDetailPayload, isLoading: supplierDetailLoading } = useSupplierDetail(selectedSupplier?.slug ?? "")
  const supplierDetail = supplierDetailPayload && !("error" in supplierDetailPayload) ? supplierDetailPayload : null
  const activeSuiteTypes = useMemo(
    () => supplierDetail?.suiteTypes.filter((suiteType) => suiteType.active) ?? [],
    [supplierDetail],
  )
  // The matcher is pure, so running it here against the same vocabulary the server uses means
  // client and server agree by construction -- no extra endpoint, and it re-runs live when the
  // consultant switches supplier.
  const suiteVocabulary = useMemo(
    () => (supplierDetail ? suiteVocabularyFromSupplierDetail(supplierDetail) : null),
    [supplierDetail],
  )
  const suiteUnits = draft ? getDraftSuiteUnits(draft) : []
  const hasSuiteSelectorData = Boolean(selectedSupplier) && !supplierDetailLoading && activeSuiteTypes.length > 0
  const unresolvedSuiteCount = suiteUnits.filter((unit) => !unit.suiteTypeId).length

  useEffect(() => {
    if (!draft || !selectedSupplier || draft.trip.supplierId === selectedSupplier.id) return

    setDraft((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        trip: {
          ...prev.trip,
          supplier: selectedSupplier.name,
          supplierId: selectedSupplier.id,
          // The kind decides the whole shape of this form -- journey or stay -- so it must travel
          // with the selection, not be re-derived by every reader.
          supplierKind: selectedSupplier.kind,
        },
      }
    })
    // Deliberately setDraft, not mutateDraft: this is system reconciliation, not a consultant
    // edit, so it must not mark the supplier field dirty and suppress its badge.
  }, [draft?.trip.supplierId, selectedSupplier])

  // Resolve the raw suite wording once the supplier's vocabulary is available. Axes the
  // consultant has already edited are preserved by applySuiteResolutions.
  useEffect(() => {
    if (!suiteVocabulary || !draft) return
    setDraft((prev) => (prev ? applySuiteResolutions(prev, suiteVocabulary) : prev))
  }, [suiteVocabulary, draft?.guests.suitePhrases, draft?.guests.suites])

  if (!draft) return null

  // The modal holds the supplier vocabulary, so here an unresolved supplier is a genuine blocker --
  // parsed wording with no id behind it cannot link the booking to anything.
  const validation = validateDraft(draft, { requireResolvedSupplier: true })
  const progress = countRequiredComplete(draft, { requireResolvedSupplier: true })

  /**
   * The single mutation point for the draft. Every edit records its field path so FieldFlags can
   * drop a stale badge, and so suite axis edits can be told apart from accepted suggestions.
   */
  const mutateDraft = (paths: string | string[], update: (prev: ParsedDraft) => ParsedDraft) => {
    const touched = Array.isArray(paths) ? paths : [paths]
    setDirtyFields((prev) => new Set([...prev, ...touched]))
    setDraft((prev) => (prev ? update(prev) : prev))
  }

  const updateDraft = (path: string, value: any) => {
    mutateDraft(path, (prev) => {
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
    // An unidentified suite no longer blocks the save. The hard gate stays at quote build, which
    // refuses to price a leg without a suite type; blocking here just stranded the enquiry.
    if (!validation.isValid || saving) return

    const draftToSave = draft

    if (openAfterSave) {
      removeDraft(ENQUIRY_DRAFT_KEY)
      onSaveAndOpen(draftToSave)
      return
    }

    setSaving(true)

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEnquiryImportPayload(draftToSave)),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        toast.error(typeof body?.error === "string" ? body.error : "Failed to save enquiry")
        return
      }

      removeDraft(ENQUIRY_DRAFT_KEY)
      onOpenChange(false)
      window.location.reload()
    } catch {
      toast.error("Failed to save enquiry. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onInteractOutside={guardDismiss}
        onPointerDownOutside={guardDismiss}
        onEscapeKeyDown={guardDismiss}
      >
        <DiscardChangesDialog
          open={pendingAction !== null}
          onKeepEditing={() => setPendingAction(null)}
          onDiscard={confirmPendingAction}
        />
        {storedDraftOffer && !hasEdits && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>You have unsaved edits to an enquiry draft from a previous session.</span>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={discardStoredDraft}>
                Discard
              </Button>
              <Button type="button" size="sm" onClick={restoreStoredDraft}>
                Restore my draft
              </Button>
            </div>
          </div>
        )}
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
                        Title
                        <FieldFlags confidence={draft.confidence['customer.title']} dirty={dirtyFields.has('customer.title')} />
                      </Label>
                      <Input
                        value={draft.customer.title}
                        onChange={(e) => updateDraft('customer.title', e.target.value)}
                        placeholder="Mr, Ms, Mrs..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Country <span className="text-destructive">*</span>
                        <FieldFlags confidence={draft.confidence['customer.country']} dirty={dirtyFields.has('customer.country')} />
                      </Label>
                      <Input
                        value={draft.customer.country}
                        onChange={(e) => updateDraft('customer.country', e.target.value)}
                        placeholder="Country"
                        className={!draft.customer.country ? 'border-destructive' : ''}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        First name <span className="text-destructive">*</span>
                        <FieldFlags confidence={draft.confidence['customer.firstName']} dirty={dirtyFields.has('customer.firstName')} />
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
                        <FieldFlags confidence={draft.confidence['customer.surname']} dirty={dirtyFields.has('customer.surname')} />
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
                      <FieldFlags confidence={draft.confidence['customer.email']} dirty={dirtyFields.has('customer.email')} />
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
                      <FieldFlags confidence={draft.confidence['customer.phone']} dirty={dirtyFields.has('customer.phone')} />
                    </Label>
                    <Input
                      value={draft.customer.phone}
                      onChange={(e) => updateDraft('customer.phone', e.target.value)}
                      placeholder="+27 XX XXX XXXX"
                      className={!draft.customer.email && !draft.customer.phone ? 'border-destructive' : ''}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Province / Region
                      <FieldFlags confidence={draft.confidence['customer.province']} dirty={dirtyFields.has('customer.province')} />
                    </Label>
                    <Input
                      value={draft.customer.province}
                      onChange={(e) => updateDraft('customer.province', e.target.value)}
                      placeholder="Province or region"
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
                  {!draft.trip.supplierId ||
                  !draft.trip.departureDate ||
                  (isStay ? !draft.trip.checkOutDate : !draft.trip.route) ? (
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
                      <FieldFlags confidence={draft.confidence['trip.supplier']} dirty={dirtyFields.has('trip.supplier')} />
                    </Label>
                    <Select
                      value={selectedSupplier?.slug ?? ""}
                      onValueChange={(slug) => {
                        const supplier = primarySuppliers.find((item) => item.slug === slug)
                        if (!supplier) return

                        setDraft((prev) => {
                          if (!prev) return prev

                          return {
                            ...prev,
                            trip: {
                              ...prev.trip,
                              supplier: supplier.name,
                              supplierId: supplier.id,
                              supplierKind: supplier.kind,
                              // Switching between a journey and a stay drops the fields the other
                              // shape owns, so a half-filled route can't ride along on a hotel
                              // enquiry (or a check-out on a train one) and reach the API.
                              route: supplier.kind === "hotel_property" ? "" : prev.trip.route,
                              checkOutDate: supplier.kind === "hotel_property" ? prev.trip.checkOutDate : "",
                              nights: supplier.kind === "hotel_property" ? prev.trip.nights : null,
                            },
                          }
                        })
                      }}
                    >
                      <SelectTrigger className={!draft.trip.supplierId ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {primarySupplierGroups.map(([kind, group]) => (
                          <SelectGroup key={kind}>
                            <SelectLabel>{SUPPLIER_KIND_LABELS[kind]}</SelectLabel>
                            {group.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.slug}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isStay && (
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Route / Direction <span className="text-destructive">*</span>
                        <FieldFlags confidence={draft.confidence['trip.route']} dirty={dirtyFields.has('trip.route')} />
                      </Label>
                      <Input
                        value={draft.trip.route}
                        onChange={(e) => updateDraft('trip.route', e.target.value)}
                        placeholder="e.g., Pretoria to Cape Town"
                        className={!draft.trip.route ? 'border-destructive' : ''}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      {isStay ? 'Check-in Date' : 'Departure Date'} <span className="text-destructive">*</span>
                      <FieldFlags confidence={draft.confidence['trip.departureDate']} dirty={dirtyFields.has('trip.departureDate')} />
                    </Label>
                    <DatePicker
                      value={draft.trip.departureDate}
                      onChange={(value) =>
                        mutateDraft(['trip.departureDate', 'trip.nights'], (prev) => ({
                          ...prev,
                          trip: {
                            ...prev.trip,
                            departureDate: value ?? '',
                            nights: nightsBetween(value ?? '', prev.trip.checkOutDate),
                          },
                        }))
                      }
                      buttonClassName={!draft.trip.departureDate ? 'border-destructive' : ''}
                    />
                  </div>
                  {isStay && (
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Check-out Date <span className="text-destructive">*</span>
                        <FieldFlags confidence={draft.confidence['trip.checkOutDate']} dirty={dirtyFields.has('trip.checkOutDate')} />
                      </Label>
                      <DatePicker
                        value={draft.trip.checkOutDate}
                        onChange={(value) =>
                          mutateDraft(['trip.checkOutDate', 'trip.nights'], (prev) => ({
                            ...prev,
                            trip: {
                              ...prev.trip,
                              checkOutDate: value ?? '',
                              nights: nightsBetween(prev.trip.departureDate, value ?? ''),
                            },
                          }))
                        }
                        buttonClassName={!draft.trip.checkOutDate ? 'border-destructive' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        {draft.trip.nights
                          ? `${draft.trip.nights} ${draft.trip.nights === 1 ? 'night' : 'nights'} - the stay is priced per room per night.`
                          : 'Check-out must fall after check-in.'}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Package Option</Label>
                    <Input
                      value={draft.trip.packageOption}
                      onChange={(e) => updateDraft('trip.packageOption', e.target.value)}
                      placeholder="Package option"
                    />
                  </div>
                  {!isStay && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Hotel Option</Label>
                      <Input
                        value={draft.trip.hotelOption}
                        onChange={(e) => updateDraft('trip.hotelOption', e.target.value)}
                        placeholder="Hotel option"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Flight Booking</Label>
                      <Input
                        value={draft.trip.flightBooking}
                        onChange={(e) => updateDraft('trip.flightBooking', e.target.value)}
                        placeholder="Flight route"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Flight Departure Date</Label>
                      <Input
                        value={draft.trip.flightDepartureDate}
                        onChange={(e) => updateDraft('trip.flightDepartureDate', e.target.value)}
                        placeholder="Flight date"
                      />
                    </div>
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
                        <FieldFlags confidence={draft.confidence['guests.adults']} dirty={dirtyFields.has('guests.adults')} />
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
                      <Label className="text-sm">Children &amp; infants</Label>
                      <Input
                        type="number"
                        min="0"
                        value={draft.guests.children || ''}
                        onChange={(e) => updateDraft('guests.children', parseInt(e.target.value) || 0)}
                        placeholder="Total minors"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Child ages
                      <FieldFlags confidence={draft.confidence['guests.childAges']} dirty={dirtyFields.has('guests.childAges')} />
                    </Label>
                    <Input
                      value={draft.guests.childAges.join(', ')}
                      onChange={(e) =>
                        updateDraft(
                          'guests.childAges',
                          e.target.value
                            .split(',')
                            .map((part) => parseInt(part.trim(), 10))
                            .filter((age) => Number.isInteger(age) && age >= 0 && age <= 30),
                        )
                      }
                      placeholder="e.g. 5, 6"
                    />
                    <p className="text-xs text-muted-foreground">
                      Which of these are infants is decided by age, not by how the customer labelled them.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm flex items-center gap-1.5">
                      Number of {unitNounPluralLabel} <span className="text-destructive">*</span>
                      <FieldFlags confidence={draft.confidence['guests.suites']} dirty={dirtyFields.has('guests.suites')} />
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={draft.guests.suites || ''}
                      onChange={(e) => {
                        const suiteCount = parseInt(e.target.value) || 0
                        mutateDraft('guests.suites', (prev) => updateDraftSuiteCount(prev, suiteCount))
                      }}
                      placeholder={`Number of ${vocabulary.unitNounPlural}`}
                      className={!draft.guests.suites ? 'border-destructive' : ''}
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm flex items-center gap-1.5">
                        {vocabulary.suiteTypePlural} &amp; Configuration
                      </Label>
                      {supplierDetailLoading && selectedSupplier ? (
                        <Badge variant="secondary" className="text-xs">Loading suites</Badge>
                      ) : null}
                    </div>

                    {!selectedSupplier ? (
                      <p className="text-xs text-muted-foreground">
                        Select a supplier before choosing {vocabulary.suiteTypePlural.toLowerCase()}.
                      </p>
                    ) : !supplierDetailLoading && activeSuiteTypes.length === 0 ? (
                      <p className="text-xs text-destructive">
                        This supplier has no active {vocabulary.suiteTypePlural.toLowerCase()} configured.
                      </p>
                    ) : null}

                    {suiteUnits.map((unit, index) => {
                      const suiteType = activeSuiteTypes.find((entry) => entry.id === unit.suiteTypeId)
                      const suiteTypeCandidates = unit.match.suiteType.candidates
                      const suiteTypeLearned = unit.match.suiteType.source === "alias"
                      const vocabSuiteType = suiteVocabulary?.suiteTypes.find((entry) => entry.id === unit.suiteTypeId)

                      return (
                        <div key={index} className="space-y-2 rounded-md border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium">Suite {index + 1}</Label>
                            {!unit.suiteTypeId && selectedSupplier && !supplierDetailLoading ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-4 border-yellow-600 text-yellow-700"
                                title="We could not identify this suite from the enquiry wording — please choose it"
                              >
                                Not identified
                              </Badge>
                            ) : null}
                          </div>

                          {/* Always show what the customer actually asked for. */}
                          {unit.rawPhrase ? (
                            <p className="text-xs text-muted-foreground">
                              Requested: &ldquo;{unit.rawPhrase}&rdquo;
                            </p>
                          ) : null}

                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                              Suite Type
                              <FieldFlags
                                learned={suiteTypeLearned}
                                dirty={unit.editedAxes?.includes("suiteType")}
                              />
                            </Label>
                            <Select
                              value={unit.suiteTypeId ?? ""}
                              onValueChange={(value) => {
                                const name = activeSuiteTypes.find((entry) => entry.id === value)?.name ?? null
                                mutateDraft(`guests.suiteUnits.${index}.suiteType`, (prev) =>
                                  updateDraftSuiteAxisAtIndex(prev, index, "suiteType", value, name),
                                )
                              }}
                              disabled={!hasSuiteSelectorData}
                            >
                              <SelectTrigger
                                className={cn(
                                  // Yellow, not destructive: an unidentified suite is an open
                                  // question for the consultant, not an error.
                                  !unit.suiteTypeId && selectedSupplier && !supplierDetailLoading
                                    ? "border-yellow-500"
                                    : "",
                                )}
                              >
                                <SelectValue placeholder="Select suite type" />
                              </SelectTrigger>
                              <SelectContent>
                                {suiteTypeCandidates.length > 0 && !unit.suiteTypeId ? (
                                  <>
                                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Suggested from &ldquo;{unit.rawPhrase}&rdquo;
                                    </div>
                                    {suiteTypeCandidates.map((candidate) => (
                                      <SelectItem key={`suggested-${candidate.id}`} value={candidate.id}>
                                        {candidate.name}
                                      </SelectItem>
                                    ))}
                                    <Separator className="my-1" />
                                  </>
                                ) : null}
                                {activeSuiteTypes.map((entry) => (
                                  <SelectItem key={entry.id} value={entry.id}>
                                    {entry.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Configuration axes. Each is hidden entirely when this suite type
                              offers no vocabulary for it, so e.g. Blue Train shows no layout
                              dropdown rather than an empty one. */}
                          {suiteType && suiteVocabulary
                            ? CONFIG_AXES.map(({ axis, label, idField, vocabKey, allowedKey }) => {
                                const allowedIds = vocabSuiteType?.[allowedKey]
                                if (!allowedIds || allowedIds.size === 0) return null

                                const options = suiteVocabulary[vocabKey].filter((entry) => allowedIds.has(entry.id))
                                if (options.length === 0) return null

                                const selectedId = unit[idField]
                                const candidates = unit.match[axis].candidates

                                return (
                                  <div key={axis} className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                      {label}
                                      <FieldFlags
                                        learned={unit.match[axis].source === "alias"}
                                        dirty={unit.editedAxes?.includes(axis)}
                                      />
                                    </Label>
                                    <Select
                                      value={selectedId ?? ""}
                                      onValueChange={(value) => {
                                        mutateDraft(`guests.suiteUnits.${index}.${axis}`, (prev) =>
                                          updateDraftSuiteAxisAtIndex(prev, index, axis, value),
                                        )
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {candidates.length > 0 && !selectedId ? (
                                          <>
                                            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                              Suggested
                                            </div>
                                            {candidates.map((candidate) => (
                                              <SelectItem key={`suggested-${candidate.id}`} value={candidate.id}>
                                                {candidate.name}
                                              </SelectItem>
                                            ))}
                                            <Separator className="my-1" />
                                          </>
                                        ) : null}
                                        {options.map((entry) => (
                                          <SelectItem key={entry.id} value={entry.id}>
                                            {entry.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )
                              })
                            : null}
                        </div>
                      )
                    })}
                  </div>
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
              <div 
                className="flex items-center justify-between mb-2 cursor-pointer hover:bg-secondary/50 rounded px-2 py-1 -mx-2"
                onClick={() => setValidationExpanded(!validationExpanded)}
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {validationExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Validation Status
                </h3>
              </div>
              {validationExpanded && (<div className="space-y-2">
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

                {unresolvedSuiteCount > 0 && (
                  <Card className="border-yellow-500/50 bg-yellow-50">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-yellow-700">
                        <AlertCircle className="w-4 h-4" />
                        {unresolvedSuiteCount === 1 ? "Suite not identified" : `${unresolvedSuiteCount} suites not identified`}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This enquiry will still save. A suite type must be chosen before a quote can be built.
                      </p>
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

                {validation.isValid && unresolvedSuiteCount === 0 && validation.warnings.length === 0 && (
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
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={requestBack} disabled={saving}>
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
