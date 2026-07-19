/**
 * Detects double-encoded ("mojibake") text: UTF-8 bytes that were read as
 * Windows-1252 and re-encoded as UTF-8. An em dash (bytes E2 80 94) becomes a
 * three-character sequence; the result is still valid UTF-8, so only a
 * content-level check can catch it.
 *
 * The character sets are built from numeric code points, so this file contains
 * no literal non-ASCII and the repo-wide guard that scans source with this
 * detector never flags the detector itself.
 */

/** UTF-8 lead bytes rendered as Windows-1252: C2 -> U+00C2, C3 -> U+00C3, E2 -> U+00E2. */
const LEAD_CODEPOINTS = [0x00c2, 0x00c3, 0x00e2]

/**
 * Windows-1252 decodings of UTF-8 continuation bytes 0x80-0xBF.
 *
 * Bytes 0xA0-0xBF decode to the identical code point U+00A0-U+00BF. Bytes
 * 0x80-0x9F decode to the cp1252 punctuation block below (0 marks the five
 * undefined slots 0x81, 0x8D, 0x8F, 0x90, 0x9D). This 0x80-0x9F range is exactly
 * where latin1 disagrees with cp1252, which is why a latin1 round-trip cannot
 * repair the corruption and a content-level check is required.
 */
const CP1252_80_TO_9F = [
  0x20ac, 0x0000, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x0000, 0x017d, 0x0000,
  0x0000, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x0000, 0x017e, 0x0178,
]

function codePointsToClass(codePoints: number[]): string {
  return codePoints.map((cp) => `\\u${cp.toString(16).padStart(4, "0")}`).join("")
}

const CONTINUATION_CODEPOINTS: number[] = [
  ...CP1252_80_TO_9F.filter((cp) => cp !== 0),
  ...Array.from({ length: 0xbf - 0xa0 + 1 }, (_, i) => 0xa0 + i),
]

/**
 * A 3-byte UTF-8 character (e.g. an em dash, E2 80 94) double-encodes to LEAD
 * followed by *two* continuation-range characters, not one - so the
 * continuation class is repeated with "+" to capture the whole corrupted run
 * rather than just its first two characters.
 */
export const MOJIBAKE_PATTERN = new RegExp(
  `[${codePointsToClass(LEAD_CODEPOINTS)}][${codePointsToClass(CONTINUATION_CODEPOINTS)}]+`,
  "g",
)

export interface MojibakeMatch {
  index: number
  match: string
}

export function findMojibake(text: string): MojibakeMatch[] {
  const pattern = new RegExp(MOJIBAKE_PATTERN.source, "g")
  const matches: MojibakeMatch[] = []
  let result = pattern.exec(text)

  while (result !== null) {
    matches.push({ index: result.index, match: result[0] })
    result = pattern.exec(text)
  }

  return matches
}
