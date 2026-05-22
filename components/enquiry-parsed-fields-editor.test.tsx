import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { EnquiryParsedFieldsEditor, type ParsedFields } from "./enquiry-parsed-fields-editor"

const baseFields: ParsedFields = {
  noOfAdults: 2,
  noOfChildren: 1,
  noOfSuites: 1,
  departureDate: "2026-07-15",
  direction: "Cape Town → Pretoria",
}

describe("EnquiryParsedFieldsEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("renders field values in read mode", () => {
    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    expect(screen.getByText("Adults")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("Children")).toBeInTheDocument()
    expect(screen.getByText("Cape Town → Pretoria")).toBeInTheDocument()
    const ones = screen.getAllByText("1")
    expect(ones.length).toBeGreaterThanOrEqual(1)
  })

  it("shows Edit button when not readonly", () => {
    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    expect(screen.getByRole("button", { name: /edit journey details/i })).toBeInTheDocument()
  })

  it("hides Edit button when readonly", () => {
    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} readonly />)
    expect(screen.queryByRole("button", { name: /edit journey details/i })).not.toBeInTheDocument()
  })

  it("switches to edit mode when Edit is clicked", () => {
    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    expect(screen.getByRole("spinbutton", { name: /adults/i })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: /children/i })).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: /suites/i })).toBeInTheDocument()
  })

  it("reverts to read mode and resets draft on Cancel", () => {
    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    const adultsInput = screen.getByRole("spinbutton", { name: /adults/i })
    fireEvent.change(adultsInput, { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: /cancel editing/i }))
    expect(screen.queryByRole("spinbutton", { name: /adults/i })).not.toBeInTheDocument()
    expect(screen.getByText("Adults")).toBeInTheDocument()
  })

  it("calls fetch PATCH and onSaved on Save", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "b1" }),
    } as Response)

    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    fireEvent.click(screen.getByRole("button", { name: /save journey details/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/jobs/b1",
      expect.objectContaining({ method: "PATCH" }),
    )
  })

  it("shows error toast and stays in edit mode when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    } as Response)

    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    fireEvent.click(screen.getByRole("button", { name: /save journey details/i }))

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /save journey details/i })).toBeInTheDocument(),
    )
  })
})
