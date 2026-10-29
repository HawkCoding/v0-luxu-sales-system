import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { EmailSignatureSettingsEditor } from "./email-signature-settings-editor"

const settingsState = vi.hoisted(() => ({
  data: undefined as Record<string, string> | undefined,
  mutate: vi.fn(),
}))

vi.mock("@/lib/use-data", () => ({
  useEmailSignatureSettings: () => ({
    data: settingsState.data,
    isLoading: false,
    error: undefined,
    mutate: settingsState.mutate,
  }),
}))

// A plain textarea stands in for the Tiptap editor: these tests cover the draft/save logic, not rich text.
vi.mock("@/components/ui/html-body-editor", () => ({
  HtmlBodyEditor: (props: { id?: string; value: string; onChange: (html: string) => void }) => (
    <textarea aria-label={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
  ),
}))

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

const DATA = {
  signature_enabled: "true",
  signature_company_line: "<p>Company</p>",
  signature_registration_line: "<p>Reg</p>",
  signature_trading_hours: "",
  signature_divisions_line: "",
  signature_confidentiality: "",
  signature_office_address: "",
  signature_sender_layout: "",
}

const fetchMock = vi.fn()

function patchCalls() {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
}

describe("EmailSignatureSettingsEditor", () => {
  beforeEach(() => {
    settingsState.data = { ...DATA }
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => {
        const body = JSON.parse(String(init?.body)) as Record<string, string>
        // The server returns what it stored — sanitized, here marked visibly.
        return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, k === "signature_enabled" ? v : `${v}<!--clean-->`]))
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    settingsState.mutate.mockReset()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it("puts the save bar after the last field", () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    const status = screen.getByText("All changes saved")
    expect(status).toHaveAttribute("role", "status")
    const lastField = screen.getByLabelText("signature_office_address")
    expect(lastField.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("scrolls focused controls clear of the pinned save bar", () => {
    const { container } = render(<EmailSignatureSettingsEditor canEdit />)
    expect(screen.getByText("All changes saved").parentElement).toHaveClass("sticky", "bottom-3")
    expect(container.firstElementChild).toHaveClass("[&_*]:scroll-mb-28")
  })

  it("never saves while typing", () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    const field = screen.getByLabelText("signature_company_line")
    fireEvent.change(field, { target: { value: "<p>Edited</p>" } })
    fireEvent.blur(field)

    expect(patchCalls()).toHaveLength(0)
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
  })

  it("a refetch does not snap an edited field back, but updates untouched ones", () => {
    const { rerender } = render(<EmailSignatureSettingsEditor canEdit />)
    fireEvent.change(screen.getByLabelText("signature_company_line"), { target: { value: "<p>Typing…</p>" } })

    settingsState.data = { ...DATA, signature_company_line: "<p>Server A</p>", signature_registration_line: "<p>Server B</p>" }
    rerender(<EmailSignatureSettingsEditor canEdit />)

    expect(screen.getByLabelText("signature_company_line")).toHaveValue("<p>Typing…</p>")
    expect(screen.getByLabelText("signature_registration_line")).toHaveValue("<p>Server B</p>")
  })

  it("Save sends only edited fields and adopts the stored values", async () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    fireEvent.change(screen.getByLabelText("signature_company_line"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    // Wait on the rendered result, not the toast — the toast fires before React commits the state.
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument())
    expect(toastMocks.success).toHaveBeenCalled()
    expect(patchCalls()).toHaveLength(1)
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({
      signature_company_line: "<p>Edited</p>",
    })
    expect(screen.getByLabelText("signature_company_line")).toHaveValue("<p>Edited</p><!--clean-->")
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled()
    expect(settingsState.mutate).toHaveBeenCalled()
  })

  it("Discard reverts to the stored values", () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    fireEvent.change(screen.getByLabelText("signature_company_line"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(screen.getByRole("button", { name: /discard/i }))

    expect(screen.getByLabelText("signature_company_line")).toHaveValue("<p>Company</p>")
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
  })
})
