import { describe, expect, it } from "vitest"
import { isUploadedDocument, UPLOADABLE_DOCUMENT_KINDS } from "./uploaded-documents"

describe("isUploadedDocument", () => {
  it("treats a received row as an upload", () => {
    expect(isUploadedDocument({ status: "received" })).toBe(true)
  })

  it.each(["generated", "sent", "required", null, undefined])("does not treat status %s as an upload", (status) => {
    expect(isUploadedDocument({ status })).toBe(false)
  })
})

describe("UPLOADABLE_DOCUMENT_KINDS", () => {
  it("offers no kind the stage gates count as a generated document", () => {
    expect(UPLOADABLE_DOCUMENT_KINDS).toEqual(["other", "proof_of_payment"])
  })
})
