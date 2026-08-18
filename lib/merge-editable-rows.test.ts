import { describe, expect, it } from "vitest"
import { mergeEditableRows } from "./merge-editable-rows"

interface Row {
  id: string
  value: string
}

describe("mergeEditableRows", () => {
  it("takes the server value for a row nobody is editing", () => {
    const local: Row[] = [{ id: "a", value: "local" }]
    const server: Row[] = [{ id: "a", value: "server" }]
    expect(mergeEditableRows(local, server, new Set())).toEqual([{ id: "a", value: "server" }])
  })

  it("keeps the local value for a row currently being edited instead of the server's", () => {
    const local: Row[] = [{ id: "a", value: "still typing" }]
    const server: Row[] = [{ id: "a", value: "someone else's realtime update" }]
    expect(mergeEditableRows(local, server, new Set(["a"]))).toEqual([{ id: "a", value: "still typing" }])
  })

  it("keeps a locally-added row that has never been saved, regardless of editingIds", () => {
    const local: Row[] = [{ id: "new-1", value: "not saved yet" }]
    const server: Row[] = []
    expect(mergeEditableRows(local, server, new Set())).toEqual([{ id: "new-1", value: "not saved yet" }])
  })

  it("adopts a new row that appeared on the server and nobody is editing locally", () => {
    const local: Row[] = []
    const server: Row[] = [{ id: "a", value: "added by someone else" }]
    expect(mergeEditableRows(local, server, new Set())).toEqual([{ id: "a", value: "added by someone else" }])
  })

  it("mixes edited, untouched, and local-only rows correctly in one pass", () => {
    const local: Row[] = [
      { id: "editing", value: "local edit" },
      { id: "untouched", value: "stale local copy" },
      { id: "unsaved", value: "brand new row" },
    ]
    const server: Row[] = [
      { id: "editing", value: "server value" },
      { id: "untouched", value: "fresh server value" },
    ]
    expect(mergeEditableRows(local, server, new Set(["editing"]))).toEqual([
      { id: "editing", value: "local edit" },
      { id: "untouched", value: "fresh server value" },
      { id: "unsaved", value: "brand new row" },
    ])
  })

  it("drops a local row once the server confirms it (no longer local-only)", () => {
    const local: Row[] = [{ id: "a", value: "just saved" }]
    const server: Row[] = [{ id: "a", value: "just saved" }]
    expect(mergeEditableRows(local, server, new Set())).toEqual([{ id: "a", value: "just saved" }])
  })
})
