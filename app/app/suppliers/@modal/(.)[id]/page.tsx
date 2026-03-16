"use client"

import { useParams, useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SupplierDetailView } from "@/components/supplier-detail-view"

export default function SupplierDetailModalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return (
    <Dialog open onOpenChange={() => router.back()}>
      <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Supplier details</DialogTitle>
          <DialogDescription>
            View and edit supplier information and pricing.
          </DialogDescription>
        </DialogHeader>
        <SupplierDetailView supplierId={id} presentation="modal" />
      </DialogContent>
    </Dialog>
  )
}
