"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Link2 as LinkIcon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { useLocations, useSuppliers } from "@/lib/use-data"
import { supplierLocationName } from "@/lib/suppliers"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

function getSupplierSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/suppliers\/([^/]+)\/?$/)
  return match ? match[1] : null
}

export default function SuppliersPage() {
  const { data: suppliers, isLoading, error, mutate } = useSuppliers()
  const { data: locations } = useLocations()
  const locationNameById = useMemo(
    () => new Map((locations ?? []).map((location) => [location.id, location.name])),
    [locations],
  )
  const { can } = useRole()
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [selectedSupplierSlug, setSelectedSupplierSlug] = useState<string | null>(null)
  const [pendingOpen, setPendingOpen] = useState(true)
  /** Only the kinds the user has explicitly closed; everything else stays open. */
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({})
  const canEdit = can("edit:suppliers")

  useEffect(() => {
    const handlePopState = () => {
      setSelectedSupplierSlug(getSupplierSlugFromPath(window.location.pathname))
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const openSupplierModal = (supplierSlug: string) => {
    setSelectedSupplierSlug(supplierSlug)
    const nextPath = `/app/suppliers/${supplierSlug}`
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath)
    }
  }

  const closeSupplierModal = () => {
    if (!selectedSupplierSlug) return
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
        supplierLocationName(supplier, locationNameById) ?? "",
        supplier.streetAddress ?? "",
        supplier.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [search, suppliers, locationNameById])

  const temporarySuppliers = useMemo(
    () => filteredSuppliers.filter((s) => s.status === "temporary"),
    [filteredSuppliers],
  )

  const mainSuppliers = useMemo(
    () => filteredSuppliers.filter((s) => s.status !== "temporary"),
    [filteredSuppliers],
  )

  const suppliersByKind = useMemo(
    () =>
      Object.keys(SUPPLIER_KIND_LABELS).reduce((grouped, kind) => {
        grouped[kind] = mainSuppliers.filter((supplier) => supplier.kind === kind)
        return grouped
      }, {} as Record<string, typeof mainSuppliers>),
    [mainSuppliers],
  )

  if (isLoading) {
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

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="space-y-2 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="text-base font-medium text-foreground">Failed to load suppliers</p>
              <p className="text-sm text-muted-foreground">
                Something went wrong while loading suppliers. Try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => mutate()}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!suppliers) {
    return null
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
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
            {(() => {
              const total = suppliers.filter((s) => s.status !== "temporary").length
              const pending = suppliers.filter((s) => s.status === "temporary").length
              return `${total} supplier${total === 1 ? "" : "s"} loaded${pending > 0 ? `, ${pending} pending activation` : ""}.`
            })()}
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

          // Open unless the user has closed this kind -- collapsing is for getting a long list out
          // of the way, so nothing should be hidden on arrival.
          const isOpen = collapsedKinds[kind] !== true

          return (
            <Collapsible
              key={kind}
              open={isOpen}
              onOpenChange={(open) =>
                setCollapsedKinds((current) => ({ ...current, [kind]: !open }))
              }
              className="space-y-3"
              asChild
            >
              <section>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${label} suppliers`}
                >
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {group.length} supplier{group.length === 1 ? "" : "s"}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="grid gap-4 lg:grid-cols-2">
                {group.map((supplier) => (
                  <Link
                    key={supplier.id}
                    href={`/app/suppliers/${supplier.slug}`}
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
                      openSupplierModal(supplier.slug)
                    }}
                  >
                    <Card
                      className={cn(
                        "h-full border-2 transition-colors hover:border-primary/40 hover:bg-secondary/20",
                        supplier.status === "draft" && "border-dashed",
                        supplier.status !== "active" && "opacity-50 grayscale",
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
                                {supplier.status === "draft" ? (
                                  <Badge variant="outline">Draft</Badge>
                                ) : (
                                  <Badge
                                    variant={supplier.status === "active" ? "default" : "outline"}
                                  >
                                    {supplier.status === "active" ? "Active" : "Inactive"}
                                  </Badge>
                                )}
                                {supplierLocationName(supplier, locationNameById) && (
                                  <Badge variant="secondary">
                                    {supplierLocationName(supplier, locationNameById)}
                                  </Badge>
                                )}
                                {supplier.parentSupplierId && (
                                  <Badge variant="outline" title="Contact details inherited from another category">
                                    <LinkIcon className="mr-1 h-3 w-3" />
                                    Linked
                                  </Badge>
                                )}
                                {supplier.parentSupplierId && (
                                  <Badge variant="outline" title="Contact details inherited from another category">
                                    <LinkIcon className="mr-1 h-3 w-3" />
                                    Linked
                                  </Badge>
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
                            <span>
                              {supplierLocationName(supplier, locationNameById) || "No location on file"}
                            </span>
                          </div>
                        </div>

                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {supplier.notes || "Open this supplier to view or update pricing and notes."}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </CollapsibleContent>
              </section>
            </Collapsible>
          )
        })}

        {mainSuppliers.length === 0 && temporarySuppliers.length === 0 && (
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

        {temporarySuppliers.length > 0 && (
          <Collapsible open={pendingOpen} onOpenChange={setPendingOpen}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-800"
                >
                  Pending Activation
                  <Badge variant="outline" className="border-amber-400 text-amber-600 text-xs">
                    {temporarySuppliers.length}
                  </Badge>
                  {pendingOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </CollapsibleTrigger>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              These suppliers were created on-the-go during a quote session.{" "}
              {canEdit
                ? "Open each one to review, complete, and activate it."
                : "A manager needs to review and activate them before they appear in the main list."}
            </p>
            <CollapsibleContent>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {temporarySuppliers.map((supplier) => (
                  <Link
                    key={supplier.id}
                    href={`/app/suppliers/${supplier.slug}`}
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
                      openSupplierModal(supplier.slug)
                    }}
                  >
                    <Card className="h-full border-2 border-dashed border-amber-300 bg-amber-50/40 transition-colors hover:border-amber-400 hover:bg-amber-50">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                              <AlertTriangle className="h-5 w-5 text-amber-600" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base font-semibold">
                                {supplier.name}
                              </CardTitle>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="border-amber-400 text-amber-600">
                                  Pending Activation
                                </Badge>
                                <Badge variant="secondary">{SUPPLIER_KIND_LABELS[supplier.kind]}</Badge>
                                {supplierLocationName(supplier, locationNameById) && (
                                  <Badge variant="secondary">
                                    {supplierLocationName(supplier, locationNameById)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {supplier.email || "No email on file"}
                        </p>
                        <p className="text-xs text-amber-600">
                          {canEdit
                            ? "Open to review and activate this supplier."
                            : "Awaiting manager review and activation."}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <Dialog open={Boolean(selectedSupplierSlug)} onOpenChange={(open) => !open && closeSupplierModal()}>
        <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Supplier details</DialogTitle>
            <DialogDescription>
              View and edit supplier information and pricing.
            </DialogDescription>
          </DialogHeader>
          {selectedSupplierSlug ? (
            <SupplierDetailView
              supplierSlug={selectedSupplierSlug}
              presentation="modal"
              onClose={() => {
                setSelectedSupplierSlug(null)
                window.history.replaceState({}, "", "/app/suppliers")
              }}
              onDeleted={() => {
                setSelectedSupplierSlug(null)
                window.history.replaceState({}, "", "/app/suppliers")
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ManageLocationsDialog open={locationsOpen} onOpenChange={setLocationsOpen} />
      <AddSupplierDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
