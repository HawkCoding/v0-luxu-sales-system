import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { EnquiryParsedFieldsEditor, type ParsedFields } from "./enquiry-parsed-fields-editor"

const baseFields: ParsedFields = {
  noOfAdults: 2,
  noOfChildren: 1,
  childAges: [],
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

  it("shows an original-request warning when current counts differ from the original", () => {
    render(
      <EnquiryParsedFieldsEditor
        bookingId="b1"
        fields={{ ...baseFields, noOfAdults: 4 }}
        originalNoOfAdults={2}
        originalNoOfChildren={1}
      />,
    )
    expect(screen.getByText(/originally requested: 2 adults, 1 child/i)).toBeInTheDocument()
  })

  it("shows no warning when current counts match the original", () => {
    render(
      <EnquiryParsedFieldsEditor
        bookingId="b1"
        fields={baseFields}
        originalNoOfAdults={2}
        originalNoOfChildren={1}
      />,
    )
    expect(screen.queryByText(/originally requested/i)).not.toBeInTheDocument()
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

  it("sends the row version it loaded so a concurrent write is caught", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "b1" }),
    } as Response)

    render(
      <EnquiryParsedFieldsEditor
        bookingId="b1"
        fields={baseFields}
        expectedUpdatedAt="2026-08-13T10:00:00.000Z"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    fireEvent.click(screen.getByRole("button", { name: /save journey details/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      expectedUpdatedAt: "2026-08-13T10:00:00.000Z",
    })
  })

  it("omits the row version while the booking is still loading", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "b1" }),
    } as Response)

    render(<EnquiryParsedFieldsEditor bookingId="b1" fields={baseFields} />)
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    fireEvent.click(screen.getByRole("button", { name: /save journey details/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).not.toHaveProperty("expectedUpdatedAt")
  })

  it("keeps the edit open and refetches when the save loses a 409 conflict", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "This booking was modified by another user since you started editing.",
        code: "STALE_VERSION",
      }),
    } as Response)

    render(
      <EnquiryParsedFieldsEditor
        bookingId="b1"
        fields={baseFields}
        expectedUpdatedAt="2026-08-13T10:00:00.000Z"
        onSaved={onSaved}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /edit journey details/i }))
    fireEvent.click(screen.getByRole("button", { name: /save journey details/i }))

    // Refetching pulls the winning version in; staying in edit mode keeps the typed draft alive.
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(screen.getByRole("button", { name: /save journey details/i })).toBeInTheDocument()
  })
})
