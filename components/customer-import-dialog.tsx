"use client"

import { useRef, useState, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus, UploadCloud, X, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface CustomerImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CustomerImportDialog({ open, onOpenChange }: CustomerImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((incoming: File | null) => {
    if (incoming) setFile(incoming)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const dropped = e.dataTransfer.files?.[0] ?? null
    handleFile(dropped)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null)
    // Reset input so the same file can be re-selected after clearing
    e.target.value = ""
  }

  const handleClear = () => {
    setFile(null)
  }

  const handleImport = () => {
    // TODO(backend): wire up customer import endpoint
    toast.info("Backend not implemented yet", {
      description: "File upload will be wired up in the next step.",
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setFile(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
          <DialogDescription>Drop a file to import customers into the system.</DialogDescription>
        </DialogHeader>

        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="File drop area — click or drag a file here"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors select-none",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <UploadCloud className={cn("w-10 h-10 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isDragOver ? "Release to drop" : "Drag & drop a file here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse — any file type accepted</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={handleInputChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Selected file */}
        {file && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <FileText className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); handleClear() }}
              aria-label="Remove selected file"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!file} onClick={handleImport}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CustomerImportDialogTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="default" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Add Customer
      </Button>
      <CustomerImportDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
