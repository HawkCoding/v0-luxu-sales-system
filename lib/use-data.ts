"use client"

import useSWR from "swr"

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
