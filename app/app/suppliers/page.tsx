"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
} from "lucide-react"
import { AddSupplierDialog } from "@/components/add-supplier-dialog"
import { ManageLocationsDialog } from "@/components/manage-locations-dialog"
import { SupplierDetailView } from "@/components/supplier-detail-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useRole } from "@/lib/role-context"
import { cn } from "@/lib/utils"
import { useSuppliers } from "@/lib/use-data"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

function getSupplierIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/suppliers\/([^/]+)\/?$/)
  return match ? match[1] : null
}

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers()
  const { can } = useRole()
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const canEdit = can("edit:suppliers")

  useEffect(() => {
    const handlePopState = () => {
      setSelectedSupplierId(getSupplierIdFromPath(window.location.pathname))
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const openSupplierModal = (supplierId: string) => {
    setSelectedSupplierId(supplierId)
    const nextPath = `/app/suppliers/${supplierId}`
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath)
    }
  }

  const closeSupplierModal = () => {
    if (!selectedSupplierId) return
    window.history.back()
  }

  const filteredSuppliers = useMemo(() => {
    if (!Array.isArray(suppliers)) return []

    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return suppliers

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        SUPPLIER_KIND_LABELS[supplier.kind],
        supplier.email ?? "",
        supplier.phone ?? "",
        supplier.location ?? "",
        supplier.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [search, suppliers])

  const suppliersByKind = useMemo(
    () =>
      Object.keys(SUPPLIER_KIND_LABELS).reduce((grouped, kind) => {
        grouped[kind] = filteredSuppliers.filter((supplier) => supplier.kind === kind)
        return grouped
      }, {} as Record<string, typeof filteredSuppliers>),
    [filteredSuppliers],
  )

  if (isLoading || !suppliers) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg bg-secondary" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Suppliers
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            Open a supplier to review pricing and company information.{" "}
            {canEdit
              ? "Managers and admins can edit supplier details and pricing."
              : "Editing is restricted to managers and admins."}{" "}
            {suppliers.length} suppliers loaded.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
            <Button size="default" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
            <Button
              variant="outline"
              className="border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted"
              onClick={() => setLocationsOpen(true)}
            >
              <MapPin className="mr-2 h-4 w-4" />
              Manage Locations
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search suppliers by name, category, location, or contact..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-6">
        {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => {
          const group = suppliersByKind[kind] ?? []
          if (group.length === 0) return null

          return (
            <section key={kind} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-semibold">
                  {label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {group.length} supplier{group.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {group.map((supplier) => (
                  <Link
                    key={supplier.id}
                    href={`/app/suppliers/${supplier.id}`}
                    onClick={(event) => {
                      if (
                        event.defaultPrevented ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return
                      }

                      event.preventDefault()
                      openSupplierModal(supplier.id)
                    }}
                  >
                    <Card
                      className={cn(
                        "h-full border-2 transition-colors hover:border-primary/40 hover:bg-secondary/20",
                        supplier.status === "draft" && "border-dashed",
                        !supplier.active && "opacity-50 grayscale",
                      )}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base font-semibold">
                                {supplier.name}
                              </CardTitle>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {supplier.status === "draft" && (
                                  <Badge variant="outline">Draft</Badge>
                                )}
                                <Badge
                                  variant={supplier.active ? "default" : "outline"}
                                >
                                  {supplier.active ? "Active" : "Inactive"}
                                </Badge>
                                {supplier.location && (
                                  <Badge variant="secondary">{supplier.location}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span>{supplier.email || "No email on file"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{supplier.phone || "No phone on file"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{supplier.location || "No location on file"}</span>
                          </div>
                        </div>

                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {supplier.notes || "Open this supplier to view or update pricing and notes."}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}

        {filteredSuppliers.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="space-y-2 text-center">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40" />
                <p className="text-base font-medium text-foreground">
                  No suppliers found
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a different search term to find a supplier.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(selectedSupplierId)} onOpenChange={(open) => !open && closeSupplierModal()}>
        <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Supplier details</DialogTitle>
            <DialogDescription>
              View and edit supplier information and pricing.
            </DialogDescription>
          </DialogHeader>
          {selectedSupplierId ? (
            <SupplierDetailView supplierId={selectedSupplierId} presentation="modal" />
          ) : null}
        </DialogContent>
      </Dialog>

      <ManageLocationsDialog open={locationsOpen} onOpenChange={setLocationsOpen} />
      <AddSupplierDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
