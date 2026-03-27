import { WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ConnectionErrorBannerProps {
  message?: string
  className?: string
}

export function ConnectionErrorBanner({ message, className }: ConnectionErrorBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
        className,
      )}
    >
      <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden />
      <span>{message ?? "Unable to reach the database. Data may be unavailable or outdated."}</span>
    </div>
  )
}
