"use client"

import { useParams } from "next/navigation"
import { SupplierDetailView } from "@/components/supplier-detail-view"

export default function SupplierDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  return <SupplierDetailView supplierSlug={slug} presentation="page" />
}
