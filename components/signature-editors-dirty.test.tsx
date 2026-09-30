// Runs both signature editors with the REAL rich-text editor (their own test files stub it with a
// textarea). The data-loss bug lived in the interaction: the editor emitted its normalised copy of
// every field on mount, so a fresh load read as "Unsaved changes" and Save wrote fields nobody had
// touched — blanks, on the Shared defaults form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { EmailSignatureSettingsEditor } from "./email-signature-settings-editor"
import { SignatureBrandEditor, type AdminSignatureBrand } from "./signature-brand-editor"

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
  useAssignableUsers: () => ({ data: { users: [] } }),
  useEmailAppearanceSettings: () => ({ data: undefined }),
}))

vi.mock("@/components/signature-badge-list", () => ({ SignatureBadgeList: () => null }))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** Stored exactly as the server keeps it — deliberately not in the editor's own serialisation. */
const STYLED = '<p><span style="color:rgb(68, 80, 90)">SA Rail (Pty) Ltd</span></p>'

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as Response
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/email-signature/render") return jsonResponse({ html: "<p>preview</p>" })
  if (init?.method === "PATCH") return jsonResponse(JSON.parse(String(init.body)))
  throw new Error(`unexpected fetch ${url}`)
})

function patchBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PATCH")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
}

/** Waits long enough for any mount-time emit (Tiptap creates the editor after mount). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

/** Edits one field through its HTML-source textarea — the reliable way to type into it in jsdom. */
function editField(fieldId: string, html: string) {
  const editorRoot = document.getElementById(fieldId)?.closest(".rounded-md")
  if (!(editorRoot instanceof HTMLElement)) throw new Error(`no editor for ${fieldId}`)
  fireEvent.click(within(editorRoot).getByLabelText("Toggle HTML source"))
  fireEvent.change(within(editorRoot).getByRole("textbox"), { target: { value: html } })
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

describe("Shared defaults editor with the real rich-text editor", () => {
  beforeEach(() => {
    settingsState.data = {
      signature_enabled: "true",
      signature_sender_layout: "<strong>{{fullName}}</strong><br>{{jobTitle}}",
      signature_company_line: STYLED,
      signature_registration_line: "Reg. 2001/000001/07",
      signature_trading_hours: "<p>Mon–Fri 08:00–17:00</p>",
      signature_divisions_line: "",
      signature_confidentiality: "<p>Confidential.</p>",
      signature_office_address: "<p>Cape Town</p>",
    }
  })

  it("is not dirty on a fresh load", async () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror").length).toBe(7))
    await settle()
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved")
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled()
  })

  it("saves only the field that was edited, never blanking the others", async () => {
    render(<EmailSignatureSettingsEditor canEdit />)
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror").length).toBe(7))
    await settle()

    editField("signature_office_address", "<p>Johannesburg</p>")
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes")
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => expect(patchBodies()).toHaveLength(1))
    expect(patchBodies()[0]).toEqual({ signature_office_address: "<p>Johannesburg</p>" })
  })
})

describe("Brand editor with the real rich-text editor", () => {
  const BRAND: AdminSignatureBrand = {
    id: "brand-1",
    name: "SA Rail",
    sortOrder: 0,
    enabled: true,
    bannerUrl: null,
    bannerWidth: null,
    bannerHeight: null,
    badges: [],
    companyLine: STYLED,
    registrationLine: "Plain registration text",
    tradingHours: null,
    divisionsLine: null,
    confidentiality: null,
    officeAddress: "<p>Cape Town</p>",
    senderLayout: "<strong>{{fullName}}</strong>",
  }

  function renderBrand() {
    render(<SignatureBrandEditor brand={BRAND} defaults={undefined} canEdit onUpdated={() => {}} />)
  }

  it("is not dirty on a fresh load, even where the editor re-serialises the stored HTML", async () => {
    renderBrand()
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror").length).toBe(7))
    await settle()
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("All changes saved")
  })

  it("saves only the field that was edited", async () => {
    renderBrand()
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror").length).toBe(7))
    await settle()

    editField("brand-officeAddress", "<p>Johannesburg</p>")
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => expect(patchBodies()).toHaveLength(1))
    expect(patchBodies()[0]).toEqual({ officeAddress: "<p>Johannesburg</p>" })
  })
})
