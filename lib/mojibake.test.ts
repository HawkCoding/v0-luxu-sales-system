import { describe, expect, it } from "vitest"
import { findMojibake } from "./mojibake"

/**
 * Test strings are built from code points rather than typed as literals so this
 * file never contains real mojibake or the correctly-encoded characters it's
 * meant to distinguish from - keeping the corpus unambiguous under review.
 */
function cp(...codePoints: number[]): string {
  return String.fromCodePoint(...codePoints)
}

describe("findMojibake", () => {
  it("detects a double-encoded em dash", () => {
    const text = `Pretoria ${cp(0x00e2, 0x20ac, 0x201d)} Victoria Falls`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded left-right arrow", () => {
    const text = `Pretoria ${cp(0x00e2, 0x2020, 0x201d)} Victoria Falls`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded en dash", () => {
    const text = `6${cp(0x00e2, 0x20ac, 0x201c)}12 months`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded bullet", () => {
    const text = `BLUE TRAIN ${cp(0x00e2, 0x20ac, 0x2022)} ROVOS RAIL`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded e-acute", () => {
    const text = `canap${cp(0x00c3, 0x00a9)}s`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded a-grave followed by NBSP", () => {
    const text = `an${cp(0x00c3, 0x00a0)}la carte lunch`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded a-tilde", () => {
    const text = `S${cp(0x00c3, 0x00a3)}o Paulo`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded multiplication sign", () => {
    const text = `route ${cp(0x00c3, 0x2014)} type`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("detects a double-encoded almost-equal sign", () => {
    const text = `revenue ${cp(0x00e2, 0x2030, 0x02c6)} R 1.43M`
    expect(findMojibake(text)).toHaveLength(1)
  })

  it("finds multiple occurrences with correct indices", () => {
    const emDash = cp(0x00e2, 0x20ac, 0x201d)
    const text = `${emDash} start, middle ${emDash}, end`
    const matches = findMojibake(text)
    expect(matches).toHaveLength(2)
    expect(matches[0].index).toBe(0)
    expect(matches[1].match).toBe(emDash)
  })

  it("does not flag correctly-encoded punctuation", () => {
    const clean = [
      `Pretoria ${cp(0x2194)} Victoria Falls`,
      `rose petals ${cp(0x2014)} champagne`,
      `S${cp(0x00e3)}o Paulo`,
      `canap${cp(0x00e9)}s`,
      `a${cp(0x00e0)} la carte`,
      `route ${cp(0x00d7)} type`,
      `infant max ${cp(0x2264)} child`,
      `6${cp(0x2013)}12 months`,
      cp(0x00b7),
      `revenue ${cp(0x2248)} R 1.43M`,
    ]

    for (const text of clean) {
      expect(findMojibake(text)).toHaveLength(0)
    }
  })

  it("does not flag plain ASCII text", () => {
    expect(findMojibake("Pretoria to Victoria Falls, 2 adults")).toHaveLength(0)
  })
})
