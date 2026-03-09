"use client"

import { useParams } from "next/navigation"
import { SupplierDetailView } from "@/components/supplier-detail-view"

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()

  return <SupplierDetailView supplierId={id} presentation="page" />
}
