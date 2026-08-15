import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

// Every field on enquiryBodySchema is nullish + .catch(), so Zod alone can never reject a body
// for what it leaves out. These guards run after the role gate and before the service client is
// built, which is what lets a mocked service client double as the "the guard let this through"
// assertion.

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockIsAuthorizedWebhookRequest = vi.fn()

const SERVICE_CLIENT_REACHED = "service client reached"

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
  createServiceClient: vi.fn(() => {
    throw new Error(SERVICE_CLIENT_REACHED)
  }),
}))

vi.mock("@/lib/api/webhook-secret", () => ({
  isAuthorizedWebhookRequest: (...args: unknown[]) => mockIsAuthorizedWebhookRequest(...args),
}))

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/enquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json()) as { error?: string }
  return payload.error ?? ""
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthorizedWebhookRequest.mockReturnValue(true)
  mockGetUser.mockResolvedValue({ data: { user: null } })
})

describe("POST /api/enquiries intake guards", () => {
  it("rejects a body with nothing identifying in it", async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(await errorMessage(res)).toMatch(/at least a name, email, contact number/i)
  })

  it("rejects a body whose identifying fields are all blank", async () => {
    const res = await POST(makeRequest({ name: "   ", surname: "", email: "  ", contactNumber: "" }))

    expect(res.status).toBe(400)
  })

  it.each([
    ["a contact number alone", { contactNumber: "+27 82 000 0000" }],
    ["an email alone", { email: "qa@example.com" }],
    ["a surname alone", { surname: "Testcase" }],
    ["pasted text alone", { rawText: "Blue Horizon Rail, Alpha to Beta, 2 adults" }],
  ])("accepts %s", async (_label, body) => {
    await expect(POST(makeRequest(body))).rejects.toThrow(SERVICE_CLIENT_REACHED)
  })

  it("rejects an enquiry with nobody travelling", async () => {
    const res = await POST(
      makeRequest({ email: "qa@example.com", noOfAdults: 0, noOfChildren: 0 }),
    )

    expect(res.status).toBe(400)
    expect(await errorMessage(res)).toMatch(/at least one traveller/i)
  })

  it("accepts children travelling without an adult on the booking", async () => {
    await expect(
      POST(makeRequest({ email: "qa@example.com", noOfAdults: 0, noOfChildren: 2 })),
    ).rejects.toThrow(SERVICE_CLIENT_REACHED)
  })

  it("still defaults an omitted traveller count to one adult", async () => {
    await expect(POST(makeRequest({ email: "qa@example.com" }))).rejects.toThrow(
      SERVICE_CLIENT_REACHED,
    )
  })

  it("drops a source the public webhook is not allowed to claim", async () => {
    // "email" gates the reject-import DELETE, so it must never be settable from a request body.
    const res = await POST(makeRequest({ source: "email" }))

    // Nothing identifying either, so it stops at the first guard -- the point is that the
    // unrecognised source was .catch()-ed to null rather than accepted.
    expect(res.status).toBe(400)
  })
})
