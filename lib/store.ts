import type {
  Customer, Job, Enquiry, Itinerary, Quote, Payment,
  DocRecord, Template, Correspondence, AuditLog, RateCard, PipelineHistory,
} from "./types"
import * as seed from "./seed-data"

// Simple in-memory store for the server session
const store = {
  customers: [...seed.customers] as Customer[],
  jobs: [...seed.jobs] as Job[],
  enquiries: [...seed.enquiries] as Enquiry[],
  itineraries: [...seed.itineraries] as Itinerary[],
  quotes: [...seed.quotes] as Quote[],
  payments: [...seed.payments] as Payment[],
  documents: [...seed.documents] as DocRecord[],
  templates: [...seed.templates] as Template[],
  correspondences: [...seed.correspondences] as Correspondence[],
  auditLogs: [...seed.auditLogs] as AuditLog[],
  rateCards: [...seed.rateCards] as RateCard[],
  pipelineHistories: [...seed.pipelineHistories] as PipelineHistory[],
}

export function getStore() {
  return store
}

let jobCounter = 13
export function nextJobNumber(): string {
  const num = jobCounter++
  const year = new Date().getFullYear()
  return `LUX-${year}-${String(num).padStart(6, "0")}`
}

let idCounter = 100
export function nextId(prefix: string): string {
  return `${prefix}${idCounter++}`
}
