"use client"

import useSWR from "swr"
import type { Supplier, SupplierDetail } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then(r => r.json())

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
