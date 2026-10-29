import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { RoleProvider } from "@/lib/role-context"
import type { Role } from "@/lib/types"
import { SalespersonCredentialsSettings } from "./salesperson-credentials-settings"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const CREDENTIAL = {
  id: "cred-1",
  profile_id: "consultant-1",
  email_address: "carmen@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 465,
  smtp_encryption: "ssl",
  imap_host: "imap.example.com",
  imap_port: 993,
  imap_encryption: "ssl",
  imap_sent_folder: "Sent",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  signature: { full_name: "Carmen", job_title: null, tel: null, cell: null, fax: null, email: null, website: null },
}

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/settings/salesperson-credentials") return json({ credentials: [CREDENTIAL] })
    if (url === "/api/users") return json({ users: [{ userId: "consultant-1", name: "Carmen", email: "carmen@example.com" }] })
    if (init?.method === "PATCH") return json({ credential: CREDENTIAL })
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openEditAs(role: Role) {
  render(
    <RoleProvider initialRole={role}>
      <SalespersonCredentialsSettings />
    </RoleProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "Edit mailbox" }))
}

function patchBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
  expect(call).toBeDefined()
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>
}

describe("SalespersonCredentialsSettings", () => {
  it("sends a consultant's edit as signature fields only, and shows the mailbox read-only", async () => {
    await openEditAs("consultant")

    expect(screen.getByLabelText("SMTP host")).toBeDisabled()
    expect(screen.getByLabelText("IMAP host")).toBeDisabled()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete mailbox" })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Consultant" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true))
    const body = patchBody()
    expect(Object.keys(body).sort()).toEqual(["cell", "email", "fax", "full_name", "job_title", "tel", "website"])
    expect(body.job_title).toBe("Consultant")
  })

  it("sends an admin's edit with the mailbox fields", async () => {
    await openEditAs("admin")

    expect(screen.getByLabelText("SMTP host")).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText("SMTP host"), { target: { value: "smtp.new.example" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true))
    expect(patchBody()).toMatchObject({ smtp_host: "smtp.new.example", imap_host: "imap.example.com", full_name: "Carmen" })
  })
})
