"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, ChevronDown, ChevronUp, Minimize2, Maximize2, Building2, Mail, Phone } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"

interface Supplier {
  id: string
  name: string
  category: "Train" | "Hotel" | "Transfers"
  contactPerson?: string
  email?: string
  phone?: string
  notes?: string
  createdAt: string
}

const DEFAULT_SUPPLIERS: Supplier[] = [
  {
    id: "s1",
    name: "Rovos Rail",
    category: "Train",
    contactPerson: "Reservations Department",
    email: "reservations@rovos.co.za",
    phone: "+27 12 315 8242",
    notes: "Luxury train journeys across Southern Africa",
    createdAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "s2",
    name: "Blue Train",
    category: "Train",
    contactPerson: "Bookings Office",
    email: "reservations@bluetrain.co.za",
    phone: "+27 12 334 8459",
    notes: "Premier luxury train service in South Africa",
    createdAt: "2024-01-01T00:00:00Z"
  }
]

export default function SuppliersPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEFAULT_SUPPLIERS)
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({})
  
  // Form state
  const [form, setForm] = useState({
    name: "",
    category: "Train" as "Train" | "Hotel" | "Transfers",
    contactPerson: "",
    email: "",
    phone: "",
    notes: ""
  })

  // Load suppliers and expanded state from localStorage on mount
  useEffect(() => {
    const savedSuppliers = localStorage.getItem("luxus_suppliers")
    if (savedSuppliers) {
      try {
        setSuppliers(JSON.parse(savedSuppliers))
      } catch (e) {
        console.error("Failed to parse saved suppliers:", e)
      }
    }

    const savedExpandedState = localStorage.getItem("luxus_suppliers_expanded")
    if (savedExpandedState) {
      try {
        setExpandedState(JSON.parse(savedExpandedState))
      } catch (e) {
        console.error("Failed to parse expanded state:", e)
        // Default: expand train suppliers, collapse hotels
        setExpandedState(
          DEFAULT_SUPPLIERS.reduce((acc, s) => {
            acc[s.id] = s.category === "Train"
            return acc
          }, {} as Record<string, boolean>)
        )
      }
    } else {
      // Default: expand train suppliers, collapse hotels
      setExpandedState(
        DEFAULT_SUPPLIERS.reduce((acc, s) => {
          acc[s.id] = s.category === "Train"
          return acc
        }, {} as Record<string, boolean>)
      )
    }
  }, [])

  // Save suppliers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("luxus_suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  // Save expanded state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("luxus_suppliers_expanded", JSON.stringify(expandedState))
  }, [expandedState])

  const toggleExpanded = (id: string) => {
    setExpandedState(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    const newState = suppliers.reduce((acc, s) => {
      acc[s.id] = true
      return acc
    }, {} as Record<string, boolean>)
    setExpandedState(newState)
  }

  const collapseAll = () => {
    const newState = suppliers.reduce((acc, s) => {
      acc[s.id] = false
      return acc
    }, {} as Record<string, boolean>)
    setExpandedState(newState)
  }

  const handleAddSupplier = () => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required")
      return
    }

    const newSupplier: Supplier = {
      id: `s${Date.now()}`,
      name: form.name,
      category: form.category,
      contactPerson: form.contactPerson || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      createdAt: new Date().toISOString()
    }

    setSuppliers(prev => [...prev, newSupplier])
    setExpandedState(prev => ({ ...prev, [newSupplier.id]: true }))
    
    // Reset form
    setForm({
      name: "",
      category: "Train",
      contactPerson: "",
      email: "",
      phone: "",
      notes: ""
    })
    
    setAddDialogOpen(false)
    toast.success("Supplier added successfully")
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const rates = data.rateCards || []

  // Group rate cards by direction
  const ratesByDirection = rates.reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.direction]) acc[r.direction] = []
    acc[r.direction].push(r)
    return acc
  }, {})

  // Filter suppliers by search
  const filteredSuppliers = suppliers.filter(s =>
    !search || 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase()) ||
    s.contactPerson?.toLowerCase().includes(search.toLowerCase())
  )

  // Group suppliers by category
  const suppliersByCategory = filteredSuppliers.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, Supplier[]>)

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Suppliers</h1>
          <p className="text-base text-muted-foreground mt-2">Manage supplier relationships and rate cards • {suppliers.length} suppliers</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="default">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
              <DialogDescription>Add a new supplier to your database</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Supplier Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Premier Hotels"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Train">Train</SelectItem>
                    <SelectItem value="Hotel">Hotel</SelectItem>
                    <SelectItem value="Transfers">Transfers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPerson">Contact Person</Label>
                <Input
                  id="contactPerson"
                  placeholder="e.g., John Smith"
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g., contact@supplier.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="e.g., +27 11 123 4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional information about this supplier..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddSupplier}>Add Supplier</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search suppliers..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-8 h-9 text-sm" 
          />
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}>
          <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          <Minimize2 className="w-3.5 h-3.5 mr-1.5" />
          Collapse All
        </Button>
      </div>

      <div className="space-y-4">
        {Object.entries(suppliersByCategory).map(([category, categorySuppliers]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-semibold">{category}</Badge>
              <span className="text-xs text-muted-foreground">{categorySuppliers.length} supplier{categorySuppliers.length !== 1 ? 's' : ''}</span>
            </div>
            
            {categorySuppliers.map(supplier => {
              const isExpanded = expandedState[supplier.id] !== false
              const supplierRates = category === "Train" ? Object.entries(ratesByDirection) : []
              
              return (
                <Card key={supplier.id} className="border-2">
                  <CardHeader 
                    className="cursor-pointer hover:bg-secondary/50 transition-colors pb-3"
                    onClick={() => toggleExpanded(supplier.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold mb-1">{supplier.name}</CardTitle>
                          {supplier.contactPerson && (
                            <p className="text-sm text-muted-foreground">{supplier.contactPerson}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {supplier.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                <span>{supplier.email}</span>
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span>{supplier.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="flex-shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  
                  {isExpanded && (
                    <CardContent className="pt-0 pb-4">
                      {supplier.notes && (
                        <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
                          <p className="text-sm text-muted-foreground">{supplier.notes}</p>
                        </div>
                      )}
                      
                      {category === "Train" && supplierRates.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-foreground">Rate Cards</h4>
                          {(supplierRates as [string, any[]][]).map(([direction, directionRates]) => (
                            <div key={direction} className="border border-border rounded-lg overflow-hidden">
                              <div className="bg-secondary px-3 py-2">
                                <p className="text-xs font-semibold text-foreground">{direction}</p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                                  <thead>
                                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-secondary/30">
                                      <th className="px-3 py-2">Suite Type</th>
                                      <th className="px-3 py-2 text-right">Price/Person</th>
                                      <th className="px-3 py-2 text-right">Currency</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {directionRates.map((r: any, i: number) => (
                                      <tr key={i} className="border-b border-border/50 last:border-0">
                                        <td className="px-3 py-2 text-xs text-foreground">{r.suiteType}</td>
                                        <td className="px-3 py-2 text-xs text-right text-foreground font-medium">R {r.pricePerPerson.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-xs text-right">
                                          <Badge variant="outline" className="text-[10px]">{r.currency}</Badge>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {category !== "Train" && (
                        <div className="text-sm text-muted-foreground">
                          No rate cards available for this supplier type
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        ))}

        {filteredSuppliers.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center space-y-2">
                <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-base font-medium text-foreground">No suppliers found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or add a new supplier
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
