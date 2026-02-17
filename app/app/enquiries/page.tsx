"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, FileText, Clipboard } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"

export default function EnquiriesPage() {
  const { data, isLoading, mutate } = useAllData()
  const { can } = useRole()
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasting, setPasting] = useState(false)

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-secondary rounded-lg" />)}</div></div>
  }

  const enquiries = data.enquiries.map((e: any) => {
    const job = data.jobs.find((j: any) => j.id === e.jobId)
    return { ...e, jobNumber: job?.jobNumber, stage: job?.stage }
  })

  const filtered = enquiries.filter((e: any) => {
    const matchSearch = !search || [e.name, e.surname, e.email, e.jobNumber, e.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchSource = sourceFilter === "all" || e.source === sourceFilter
    return matchSearch && matchSource
  })

  const handlePasteImport = async () => {
    if (!pasteText.trim()) return
    setPasting(true)
    try {
      const lines = pasteText.split("\n").map((l: string) => l.trim()).filter(Boolean)
      const nameMatch = pasteText.match(/(?:regards|sincerely|cheers),?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)/i)
      const emailMatch = pasteText.match(/[\w.-]+@[\w.-]+\.\w+/)
      const phoneMatch = pasteText.match(/\+[\d\s-]{8,}/)

      await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: pasteText,
          purpose: "quote",
          title: "Mr",
          name: nameMatch?.[1] || "Unknown",
          surname: nameMatch?.[2] || "Unknown",
          contactNumber: phoneMatch?.[0] || "",
          email: emailMatch?.[0] || "",
          country: "Other",
          direction: "Pretoria to Cape Town",
          departureDate: "2026-06-01",
          noOfSuites: 1,
          noOfAdults: 2,
          noOfChildren: 0,
          suiteTypes: ["Pullman Twin Suite"],
          termsAccepted: true,
        }),
      })
      mutate()
      setPasteOpen(false)
      setPasteText("")
    } finally {
      setPasting(false)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Enquiries</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} enquiries</p>
        </div>
        {can("create:enquiry") && (
          <div className="flex items-center gap-2">
            <Link href="/enquire/rovos">
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> New Web Form
              </Button>
            </Link>
            <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Clipboard className="w-4 h-4 mr-1.5" /> Paste Import
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Paste Email/Text Import</DialogTitle>
                  <DialogDescription>Paste an email or enquiry text and it will be parsed into an enquiry.</DialogDescription>
                </DialogHeader>
                <Textarea
                  placeholder="Paste the email or text content here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPasteOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handlePasteImport} disabled={pasting || !pasteText.trim()}>
                    {pasting ? "Importing..." : "Import Enquiry"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search enquiries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="web_form">Web Form</SelectItem>
            <SelectItem value="paste_import">Paste Import</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((e: any) => (
          <Link key={e.id} href={`/app/jobs/${e.jobId}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                      {e.source === "paste_import" ? <Clipboard className="w-3.5 h-3.5 text-muted-foreground" /> : <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-inter)" }}>{e.jobNumber}</span>
                        <Badge variant="outline" className="text-[10px]">{e.source.replace("_", " ")}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{e.purpose}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {e.title} {e.name} {e.surname} &middot; {e.direction} &middot; {new Date(e.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline" className="text-[10px]">{e.stage?.replace(/_/g, " ")}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(e.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No enquiries found</div>
        )}
      </div>
    </div>
  )
}
