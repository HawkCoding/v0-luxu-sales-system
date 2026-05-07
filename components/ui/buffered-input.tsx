"use client"

import type { ChangeEvent, ComponentProps } from "react"
import { useEffect, useState } from "react"

import { Input } from "@/components/ui/input"

interface BufferedInputProps
  extends Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange"> {
  value: string
  onValueChange: (value: string) => void
}

export function BufferedInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  ...props
}: BufferedInputProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value)
    }
  }, [isFocused, value])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setDisplayValue(nextValue)
    onValueChange(nextValue)
  }

  return (
    <Input
      {...props}
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setIsFocused(false)
        setDisplayValue(value)
        onBlur?.(event)
      }}
      onChange={handleChange}
    />
  )
}
