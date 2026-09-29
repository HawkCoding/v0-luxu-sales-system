import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SignatureBrandEditor, type AdminSignatureBrand } from "./signature-brand-editor"

vi.mock("@/lib/use-data", () => ({
  useAssignableUsers: () => ({ data: { users: [] } }),
  useEmailAppearanceSettings: () => ({ data: undefined }),
}))

// A plain textarea stands in for the Tiptap editor: these tests cover the draft/save logic, not rich text.
vi.mock("@/components/ui/html-body-editor", () => ({
  HtmlBodyEditor: (props: { id?: string; value: string; onChange: (html: string) => void; disabled?: boolean }) => (
    <textarea
      aria-label={props.id}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}))

vi.mock("@/components/signature-badge-list", () => ({ SignatureBadgeList: () => null }))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

const BRAND: AdminSignatureBrand = {
  id: "brand-1",
  name: "SA Rail",
  sortOrder: 0,
  enabled: true,
  bannerUrl: null,
  bannerWidth: null,
  bannerHeight: null,
  badges: [],
  companyLine: "<p>Original</p>",
  registrationLine: null,
  tradingHours: null,
  divisionsLine: null,
  confidentiality: null,
  officeAddress: null,
  senderLayout: null,
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response
}

function savedResponse(fields: Partial<AdminSignatureBrand>) {
  return jsonResponse({ ...BRAND, ...fields })
}

type PatchHandler = (body: Record<string, unknown>) => Promise<Response>

let patchHandler: PatchHandler
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/email-signature/render") return jsonResponse({ html: "<p>preview</p>" })
  if (init?.method === "PATCH") return patchHandler(JSON.parse(String(init.body)) as Record<string, unknown>)
  throw new Error(`unexpected fetch ${url}`)
})

function patchCalls() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")
}

const onUpdatedSpy = vi.fn()
const onDirtySpy = vi.fn()

/** Holds the saved copy like the page does, applying onUpdated patches functionally. */
function Harness() {
  const [brand, setBrand] = useState(BRAND)
  return (
    <SignatureBrandEditor
      brand={brand}
      defaults={undefined}
      canEdit
      onDirtyChange={onDirtySpy}
      onUpdated={(id, patch) => {
        onUpdatedSpy(id, patch)
        setBrand((current) => ({ ...current, ...patch }))
      }}
    />
  )
}

function saveButton() {
  return screen.getByRole("button", { name: /save changes|saving/i })
}

describe("SignatureBrandEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    patchHandler = async (body) => savedResponse(body as Partial<AdminSignatureBrand>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
    onUpdatedSpy.mockReset()
    onDirtySpy.mockReset()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it("starts clean with Save disabled", () => {
    render(<Harness />)
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled()
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
  })

  it("never saves while typing — not on change, not on blur", () => {
    render(<Harness />)

    const name = screen.getByLabelText("Name")
    fireEvent.change(name, { target: { value: "SA Rail Tours" } })
    fireEvent.blur(name)
    const company = screen.getByLabelText("brand-companyLine")
    fireEvent.change(company, { target: { value: "<p>Edited</p>" } })
    fireEvent.blur(company)

    expect(patchCalls()).toHaveLength(0)
    expect(onUpdatedSpy).not.toHaveBeenCalled()
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(onDirtySpy).toHaveBeenLastCalledWith(true)
  })

  it("Save sends only the edited fields, adopts the server values, and goes clean", async () => {
    patchHandler = async () => savedResponse({ name: "SA Rail Tours", companyLine: "<p>Edited (sanitized)</p>" })
    render(<Harness />)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  SA Rail Tours " } })
    fireEvent.change(screen.getByLabelText("brand-companyLine"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(saveButton())

    // Wait on the rendered result, not the toast — the toast fires before React commits the state.
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument())
    expect(toastMocks.success).toHaveBeenCalledWith("Brand saved")
    expect(patchCalls()).toHaveLength(1)
    const [url, init] = patchCalls()[0]
    expect(url).toBe("/api/settings/signature-brands/brand-1")
    expect(JSON.parse(String(init?.body))).toEqual({ name: "SA Rail Tours", companyLine: "<p>Edited</p>" })

    expect(onUpdatedSpy).toHaveBeenCalledWith("brand-1", {
      name: "SA Rail Tours",
      companyLine: "<p>Edited (sanitized)</p>",
    })
    expect(screen.getByLabelText("brand-companyLine")).toHaveValue("<p>Edited (sanitized)</p>")
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(onDirtySpy).toHaveBeenLastCalledWith(false)
  })

  it("disables Save and shows a saving label while the request is in flight", async () => {
    const pending = deferred<Response>()
    patchHandler = () => pending.promise
    render(<Harness />)

    fireEvent.change(screen.getByLabelText("brand-companyLine"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(saveButton())

    expect(await screen.findByRole("button", { name: /saving/i })).toBeDisabled()
    await act(async () => pending.resolve(savedResponse({ companyLine: "<p>Edited</p>" })))
    await waitFor(() => expect(saveButton()).toBeDisabled())
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
  })

  it("a late save response never overwrites edits made while it was in flight", async () => {
    const pending = deferred<Response>()
    patchHandler = () => pending.promise
    render(<Harness />)

    const company = screen.getByLabelText("brand-companyLine")
    fireEvent.change(company, { target: { value: "<p>First</p>" } })
    fireEvent.click(saveButton())
    // Keep typing while the save is still pending.
    fireEvent.change(company, { target: { value: "<p>First and more</p>" } })

    await act(async () => pending.resolve(savedResponse({ companyLine: "<p>First</p>" })))
    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument())
    expect(toastMocks.success).toHaveBeenCalled()

    expect(screen.getByLabelText("brand-companyLine")).toHaveValue("<p>First and more</p>")
    // The saved copy moved to what the server stored; the newer typing is still a pending change.
    expect(onUpdatedSpy).toHaveBeenCalledWith("brand-1", { companyLine: "<p>First</p>" })
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it("keeps the draft and reports the error when the save fails", async () => {
    patchHandler = async () => jsonResponse({ error: "Invalid input" }, false)
    render(<Harness />)

    fireEvent.change(screen.getByLabelText("brand-companyLine"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled())
    expect(toastMocks.error).toHaveBeenCalledWith("Invalid input")
    expect(screen.getByLabelText("brand-companyLine")).toHaveValue("<p>Edited</p>")
    expect(onUpdatedSpy).not.toHaveBeenCalled()
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it("Discard reverts the draft to the saved copy", () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } })
    fireEvent.change(screen.getByLabelText("brand-companyLine"), { target: { value: "<p>Edited</p>" } })
    fireEvent.click(screen.getByRole("button", { name: /discard/i }))

    expect(screen.getByLabelText("Name")).toHaveValue("SA Rail")
    expect(screen.getByLabelText("brand-companyLine")).toHaveValue("<p>Original</p>")
    expect(screen.getByText("All changes saved")).toBeInTheDocument()
    expect(patchCalls()).toHaveLength(0)
  })

  it("blocks saving a blank name", () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } })
    expect(screen.getByText("Name is required.")).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it("previews the draft, not the saved copy", async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText("brand-companyLine"), { target: { value: "<p>Draft only</p>" } })

    await waitFor(
      () => {
        const renderCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/email-signature/render")
        const last = renderCalls.at(-1)
        expect(last).toBeDefined()
        const body = JSON.parse(String(last?.[1]?.body)) as { brandId: string; draft: Record<string, string> }
        expect(body.brandId).toBe("brand-1")
        expect(body.draft.companyLine).toBe("<p>Draft only</p>")
      },
      { timeout: 2000 },
    )
    expect(patchCalls()).toHaveLength(0)
  })
})
