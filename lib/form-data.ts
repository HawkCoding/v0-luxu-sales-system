export const DIRECTIONS = [
  "Pretoria to Cape Town",
  "Cape Town to Pretoria",
  "Pretoria to Durban",
  "Durban to Pretoria",
  "Pretoria to Victoria Falls",
  "Victoria Falls to Pretoria",
  "Cape Town to Dar es Salaam",
  "Dar es Salaam to Cape Town",
  "Pretoria to Swakopmund",
  "Swakopmund to Pretoria",
]

export const DEPARTURE_DATES: Record<string, string[]> = {
  "Pretoria to Cape Town": ["2026-03-15", "2026-04-12", "2026-05-10", "2026-06-07", "2026-07-01", "2026-08-15", "2026-09-12", "2026-10-15", "2026-11-14", "2026-12-20"],
  "Cape Town to Pretoria": ["2026-03-18", "2026-04-15", "2026-05-13", "2026-06-10", "2026-07-08", "2026-08-18", "2026-09-05", "2026-10-18", "2026-11-17"],
  "Pretoria to Durban": ["2026-02-14", "2026-05-30", "2026-08-22", "2026-11-07"],
  "Durban to Pretoria": ["2026-02-16", "2026-06-01", "2026-08-24", "2026-11-09"],
  "Pretoria to Victoria Falls": ["2026-04-05", "2026-05-15", "2026-07-20", "2026-09-25", "2026-11-01"],
  "Victoria Falls to Pretoria": ["2026-04-09", "2026-05-19", "2026-07-24", "2026-09-29", "2026-11-05"],
  "Cape Town to Dar es Salaam": ["2026-06-10", "2026-09-15"],
  "Dar es Salaam to Cape Town": ["2026-06-25", "2026-09-30"],
  "Pretoria to Swakopmund": ["2026-04-10", "2026-06-20", "2026-08-20", "2026-10-25"],
  "Swakopmund to Pretoria": ["2026-04-15", "2026-06-25", "2026-08-25", "2026-10-30"],
}

export const SUITE_TYPES = [
  "Pullman Twin Suite",
  "Pullman Double Suite",
  "Deluxe Twin Suite",
  "Deluxe Double Suite",
  "Royal Twin Suite",
  "Royal Double Suite",
]

export const TITLES = ["Dr", "Prof", "Mr", "Mrs", "Ms"]
export const TRAVELLER_PREFIXES = ["Mr", "Mrs", "Miss", "Mast", "Dr", "Prof"]
export const CHILD_PREFIXES = ["Miss", "Mast"]

export const COUNTRIES = [
  "South Africa", "United Kingdom", "United States", "Germany", "France",
  "Italy", "Australia", "Canada", "Netherlands", "Sweden", "Switzerland",
  "UAE", "India", "Japan", "Brazil", "New Zealand", "Spain", "Portugal",
  "Austria", "Belgium", "Denmark", "Norway", "Singapore", "China", "Other",
]

export const HOTEL_OPTIONS: Record<string, string[]> = {
  "TZN": ["Serena Hotel, Dar Es Salaam"],
  "NAM": ["Swakopmund Hotel", "Strand Hotel"],
  "CPT": ["Commodore Hotel - Waterfront", "President Hotel - Bantry Bay", "15 on Orange - City", "TAJ Hotel - City"],
  "DBN": ["The Capital Pearls - Umhlanga"],
  "Vic Falls": ["The Victoria Falls Hotel"],
  "PTY": ["Irene Country Lodge - Pretoria", "Apogee Hotel & Spa - Pretoria", "Ivory Manor Boutique Hotel - Pretoria", "The Capital Menlyn Maine - Pretoria", "DaVinci Hotel - Sandton"],
}

export function getHotelRegionForDirection(direction: string): string {
  if (direction.includes("Dar es Salaam")) return "TZN"
  if (direction.includes("Swakopmund")) return "NAM"
  if (direction.endsWith("Cape Town")) return "CPT"
  if (direction.endsWith("Durban")) return "DBN"
  if (direction.includes("Victoria Falls")) return "Vic Falls"
  return "PTY"
}

export const OVERRIDE_REASONS = [
  "Alternative hotel",
  "Upgrade required",
  "Supplier special case",
  "Manual correction",
  "Other",
]
