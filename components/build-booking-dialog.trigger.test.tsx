// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Only the button that opens the dialog is under test, so everything the dialog body reaches for
// (data fetching, presence, drafts, FX rates) stands in as an inert hook. The dialog stays closed.
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }))
vi.mock("@/lib/use-data", () => ({
  useActiveSuppliers: () => ({ data: undefined }),
  useRateTypes: () => ({ data: undefined }),
}))
vi.mock("@/lib/fx/use-fx-rates", () => ({
  useFxRates: () => ({ rates: {}, asOf: null, stale: false, refresh: vi.fn(), setRate: vi.fn() }),
}))
vi.mock("@/hooks/use-record-presence", () => ({
  useRecordPresence: () => ({ others: [], setEditing: vi.fn() }),
}))
vi.mock("@/hooks/use-versioned-save", () => ({
  useVersionedSave: () => ({ save: vi.fn(), isSaving: false, conflict: null, clearConflict: vi.fn() }),
}))
vi.mock("@/hooks/use-draft-autosave", () => ({
  useDraftAutosave: () => ({
    pendingDraft: null,
    pendingDraftRecordUpdatedAt: null,
    hasLoadedDraft: true,
    isDirty: false,
    discardDraft: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-unload-guard", () => ({ useUnloadGuard: vi.fn() }))
vi.mock("@/hooks/use-dirty-close-guard", () => ({
  useDirtyCloseGuard: () => ({
    handleOpenChange: vi.fn(),
    contentProps: {},
    confirming: false,
    cancelDiscard: vi.fn(),
    confirmDiscard: vi.fn(),
  }),
}))

import { BuildBookingDialog } from "./build-booking-dialog"

type DialogProps = Parameters<typeof BuildBookingDialog>[0]

function renderDialog(props: Partial<DialogProps> = {}) {
  return render(
    <BuildBookingDialog
      jobId="job-1"
      quoteId="quote-1"
      travelDate={null}
      existingLineItemCount={0}
      onApplied={vi.fn()}
      {...props}
    />,
  )
}

describe("BuildBookingDialog trigger", () => {
  afterEach(() => cleanup())

  it("reads 'Edit Quote' by default", () => {
    renderDialog()

    expect(screen.getByRole("button", { name: "Edit Quote" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Edit Booking" })).toBeNull()
  })

  it("reads 'Edit Booking' when the Edit Booking wording is set", () => {
    renderDialog({ editBookingWording: true })

    expect(screen.getByRole("button", { name: "Edit Booking" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Edit Quote" })).toBeNull()
  })

  it("reads 'Edit Booking' for an accepted quote being edited in place", () => {
    renderDialog({ amend: { currentTotal: 1000, bookingStage: "deposit_paid", agentCommission: 0, discountAmount: 0 } })

    expect(screen.getByRole("button", { name: "Edit Booking" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Edit Quote" })).toBeNull()
  })
})
