import { cn } from "@/lib/utils"

interface UploadRequirementsListProps {
  requirements: readonly string[]
  className?: string
}

/** The rules a file must meet, listed one per line under an upload button. */
export function UploadRequirementsList({ requirements, className }: UploadRequirementsListProps) {
  return (
    <div className={cn("max-w-xs text-[11px] text-muted-foreground", className)}>
      <p className="font-medium text-foreground/80">Requirements</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
        {requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
    </div>
  )
}
