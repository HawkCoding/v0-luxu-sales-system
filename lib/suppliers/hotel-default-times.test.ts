import { describe, expect, it, vi } from "vitest"
import {
  FALLBACK_HOTEL_CHECK_IN_TIME,
  FALLBACK_HOTEL_CHECK_OUT_TIME,
  HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY,
  HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY,
  getHotelDefaultTimes,
  parseTimeOfDay,
} from "./hotel-default-times"

function mockSupabase(result: { data: unknown; error: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => result),
      })),
    })),
  } as any
}

describe("parseTimeOfDay", () => {
  it("accepts valid HH:MM values", () => {
    expect(parseTimeOfDay("14:00", "09:00")).toBe("14:00")
    expect(parseTimeOfDay("00:00", "09:00")).toBe("00:00")
    expect(parseTimeOfDay("23:59", "09:00")).toBe("23:59")
    expect(parseTimeOfDay(" 11:30 ", "09:00")).toBe("11:30")
  })

  it.each(["", "9:00", "24:00", "14:60", "14:00:00", "2pm", null, undefined])(
    "falls back on invalid value %#",
    (value) => {
      expect(parseTimeOfDay(value, "09:00")).toBe("09:00")
    },
  )
})

describe("getHotelDefaultTimes", () => {
  it("returns stored settings", async () => {
    const supabase = mockSupabase({
      data: [
        { key: HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY, value: "15:00" },
        { key: HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY, value: "10:00" },
      ],
      error: null,
    })
    await expect(getHotelDefaultTimes(supabase)).resolves.toEqual({
      checkIn: "15:00",
      checkOut: "10:00",
    })
  })

  it("falls back per key when settings are missing or malformed", async () => {
    const supabase = mockSupabase({
      data: [{ key: HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY, value: "garbage" }],
      error: null,
    })
    await expect(getHotelDefaultTimes(supabase)).resolves.toEqual({
      checkIn: FALLBACK_HOTEL_CHECK_IN_TIME,
      checkOut: FALLBACK_HOTEL_CHECK_OUT_TIME,
    })
  })

  it("falls back entirely on query error", async () => {
    const supabase = mockSupabase({ data: null, error: { message: "boom" } })
    await expect(getHotelDefaultTimes(supabase)).resolves.toEqual({
      checkIn: FALLBACK_HOTEL_CHECK_IN_TIME,
      checkOut: FALLBACK_HOTEL_CHECK_OUT_TIME,
    })
  })
})
