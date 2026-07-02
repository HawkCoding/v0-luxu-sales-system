import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY = "hotel_default_check_in_time"
export const HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY = "hotel_default_check_out_time"

export const FALLBACK_HOTEL_CHECK_IN_TIME = "14:00"
export const FALLBACK_HOTEL_CHECK_OUT_TIME = "11:00"

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface HotelDefaultTimes {
  checkIn: string
  checkOut: string
}

/** Validates an HH:MM time-of-day string, returning the fallback on bad input. */
export function parseTimeOfDay(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return TIME_OF_DAY_PATTERN.test(trimmed) ? trimmed : fallback
}

export async function getHotelDefaultTimes(
  supabase: SupabaseClient<Database>,
): Promise<HotelDefaultTimes> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY, HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY])

  if (error) {
    return { checkIn: FALLBACK_HOTEL_CHECK_IN_TIME, checkOut: FALLBACK_HOTEL_CHECK_OUT_TIME }
  }

  const valueByKey = new Map((data ?? []).map((row) => [row.key, row.value]))
  return {
    checkIn: parseTimeOfDay(
      valueByKey.get(HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY),
      FALLBACK_HOTEL_CHECK_IN_TIME,
    ),
    checkOut: parseTimeOfDay(
      valueByKey.get(HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY),
      FALLBACK_HOTEL_CHECK_OUT_TIME,
    ),
  }
}
