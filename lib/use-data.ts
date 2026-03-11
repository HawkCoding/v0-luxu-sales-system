"use client"

import useSWR from "swr"
import type { Booking, Customer, Location, Supplier, SupplierDetail } from "@/lib/types"

type ApiError = Error & { status?: number }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const body = isJson ? await response.json() : null
  // #region agent log
  fetch("http://127.0.0.1:7760/ingest/190e3c6f-5c67-4716-9b18-f74edd436915",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"ea6961"},body:JSON.stringify({sessionId:"ea6961",runId:"run1",hypothesisId:"H4",location:"lib/use-data.ts:14",message:"fetcher response received",data:{url,status:response.status,ok:response.ok,isJson},timestamp:Date.now()})}).catch(()=>{})
  // #endregion

  if (!response.ok) {
    // #region agent log
    fetch("http://127.0.0.1:7760/ingest/190e3c6f-5c67-4716-9b18-f74edd436915",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"ea6961"},body:JSON.stringify({sessionId:"ea6961",runId:"run1",hypothesisId:"H4",location:"lib/use-data.ts:18",message:"fetcher throwing non-ok",data:{url,status:response.status,errorMessage:typeof body === "object" && body !== null && "error" in body ? String(body.error) : null},timestamp:Date.now()})}).catch(()=>{})
    // #endregion
    const error = new Error(
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : response.statusText || "Request failed"
    ) as ApiError
    error.status = response.status
    throw error
  }

  return body
}

export function useAllData() {
  return useSWR("/api/data", fetcher, { revalidateOnFocus: false })
}

export function usePipeline() {
  return useSWR("/api/pipeline", fetcher, { revalidateOnFocus: false })
}

export function useJobDetail(id: string) {
  return useSWR(id ? `/api/jobs/${id}` : null, fetcher, { revalidateOnFocus: false })
}

export function useTemplates() {
  return useSWR("/api/templates", fetcher, { revalidateOnFocus: false })
}

export function useSuppliers() {
  return useSWR<Supplier[]>("/api/suppliers", fetcher, {
    revalidateOnFocus: false,
  })
}

export function useSupplierDetail(id: string) {
  return useSWR<SupplierDetail | { error: string }>(
    id ? `/api/suppliers/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
}

export function useCustomerDetail(id: string) {
  return useSWR<
    | {
        customer: Customer
        bookings: Array<
          Pick<Booking, "id" | "bookingNumber" | "stage" | "consultant" | "departureDate" | "createdAt"> & {
            direction: string | null
          }
        >
      }
    | { error: string }
  >(id ? `/api/customers/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  })
}

export function useLocations() {
  return useSWR<Location[]>("/api/locations", fetcher, {
    revalidateOnFocus: false,
  })
}
