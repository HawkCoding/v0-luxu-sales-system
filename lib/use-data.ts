"use client"

import useSWR from "swr"
import type { Booking, Customer, Location, Supplier, SupplierDetail } from "@/lib/types"

type ApiError = Error & { status?: number }

export interface SupplierEmailLabel {
  id: string
  name: string
  sortOrder: number
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const body = isJson ? await response.json() : null

  if (!response.ok) {
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

const swrOptions = {
  revalidateOnFocus: false,
  onErrorRetry: (
    error: ApiError,
    _key: string,
    _config: unknown,
    revalidate: (options?: { retryCount?: number }) => void,
    context: { retryCount: number },
  ) => {
    if (error.status === 401) return
    if (context.retryCount >= 3) return

    setTimeout(() => {
      revalidate({ retryCount: context.retryCount + 1 })
    }, 3000)
  },
}

export function useAllData() {
  return useSWR("/api/data", fetcher, swrOptions)
}

export function usePipeline() {
  return useSWR("/api/pipeline", fetcher, swrOptions)
}

export function useJobDetail(id: string) {
  return useSWR(id ? `/api/jobs/${id}` : null, fetcher, swrOptions)
}

export function useTemplates() {
  return useSWR("/api/templates", fetcher, swrOptions)
}

export function useSuppliers() {
  return useSWR<Supplier[]>("/api/suppliers?includeDrafts=true", fetcher, swrOptions)
}

export function useActiveSuppliers() {
  return useSWR<Supplier[]>("/api/suppliers", fetcher, swrOptions)
}

export function useSupplierDetail(slug: string) {
  return useSWR<SupplierDetail | { error: string }>(
    slug ? `/api/suppliers/${slug}` : null,
    fetcher,
    swrOptions,
  )
}

export function useCustomerDetail(id: string) {
  return useSWR<
    | {
        customer: Customer
        bookings: Array<
          Pick<Booking, "id" | "bookingNumber" | "stage" | "consultant" | "departureDate" | "createdAt"> & {
            direction: string | null
            supplierName: string | null
            packageName: string | null
          }
        >
      }
    | { error: string }
  >(id ? `/api/customers/${id}` : null, fetcher, {
    ...swrOptions,
  })
}

export function useLocations() {
  return useSWR<Location[]>("/api/locations", fetcher, swrOptions)
}

export function useSupplierEmailLabels() {
  return useSWR<SupplierEmailLabel[]>("/api/supplier-email-labels", fetcher, swrOptions)
}
