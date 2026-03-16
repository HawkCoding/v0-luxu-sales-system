"use client"

import { useParams, useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CustomerDetailView } from "@/components/customer-detail-view"

export default function CustomerDetailModalPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return (
    <Dialog open onOpenChange={() => router.back()}>
      <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Customer details</DialogTitle>
          <DialogDescription>
            View customer details, bookings, and notes.
          </DialogDescription>
        </DialogHeader>
        <CustomerDetailView customerId={id} presentation="modal" />
      </DialogContent>
    </Dialog>
  )
}
