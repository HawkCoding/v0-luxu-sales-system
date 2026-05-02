"use client"

import type { ComponentProps } from "react"
import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"

interface NumericInputProps
  extends Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: number | null
  onValueChange: (value: number | null) => void
  nullable?: boolean
  nullDisplayValue?: string
}

export function NumericInput({
  value,
  onValueChange,
  nullable = false,
  nullDisplayValue = "",
  onFocus,
  onBlur,
  onWheel,
  ...props
}: NumericInputProps) {
  const getDisplayValue = (nextValue: number | null) =>
    nextValue === null ? nullDisplayValue : String(nextValue)

  const [displayValue, setDisplayValue] = useState(getDisplayValue(value))
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(getDisplayValue(value))
    }
  }, [isFocused, nullDisplayValue, value])

  return (
    <Input
      type="number"
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true)
        if (displayValue === "0" && (!nullable || value !== 0)) {
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
            setDisplayValue(nullDisplayValue)
          } else {
            onValueChange(0)
            setDisplayValue("0")
          }
        } else {
          setDisplayValue(getDisplayValue(value))
        }

        onBlur?.(event)
      }}
      onWheel={(event) => {
        if (event.currentTarget === document.activeElement) {
          event.currentTarget.blur()
        }

        onWheel?.(event)
      }}
      {...props}
    />
  )
}
