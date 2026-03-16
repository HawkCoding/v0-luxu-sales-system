"use client"

import { useParams } from "next/navigation"
import { CustomerDetailView } from "@/components/customer-detail-view"

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()

  return <CustomerDetailView customerId={id} presentation="page" />
}
