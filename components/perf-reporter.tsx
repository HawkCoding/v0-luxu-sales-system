"use client"

import { useEffect } from "react"
import { installSlowRequestReporter } from "@/lib/perf/slow-request-reporter"

/** Mounts the slow-request recorder for the lifetime of the page. Renders nothing. */
export function PerfReporter(): null {
  useEffect(() => installSlowRequestReporter(), [])
  return null
}
