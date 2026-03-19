"use client"

import type { ComponentProps } from "react"
import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"

interface NumericInputProps
  extends Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: number | null
  onValueChange: (value: number | null) => void
  nullable?: boolean
}

export function NumericInput({
  value,
  onValueChange,
  nullable = false,
  onFocus,
  onBlur,
  ...props
}: NumericInputProps) {
  const [displayValue, setDisplayValue] = useState(value === null ? "" : String(value))
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value === null ? "" : String(value))
    }
  }, [isFocused, value])

  return (
    <Input
      type="number"
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true)
        if (displayValue === "0") {
          setDisplayValue("")
        }
        onFocus?.(event)
      }}
      onChange={(event) => {
        const nextDisplayValue = event.target.value
        setDisplayValue(nextDisplayValue)

        if (nextDisplayValue === "") {
          onValueChange(nullable ? null : 0)
          return
        }

        const parsedValue = Number(nextDisplayValue)
        if (!Number.isNaN(parsedValue)) {
          onValueChange(parsedValue)
        }
      }}
      onBlur={(event) => {
        setIsFocused(false)

        if (displayValue === "") {
          if (nullable) {
            onValueChange(null)
            setDisplayValue("")
          } else {
            onValueChange(0)
            setDisplayValue("0")
          }
        } else {
          setDisplayValue(value === null ? "" : String(value))
        }

        onBlur?.(event)
      }}
      {...props}
    />
  )
}
