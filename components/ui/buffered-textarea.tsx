"use client"

import type { ChangeEvent, ComponentProps } from "react"
import { startTransition, useEffect, useState } from "react"

import { Textarea } from "@/components/ui/textarea"

interface BufferedTextareaProps
  extends Omit<ComponentProps<typeof Textarea>, "value" | "defaultValue" | "onChange"> {
  value: string
  onValueChange: (value: string) => void
}

export function BufferedTextarea({
  value,
  onValueChange,
  onFocus,
  onBlur,
  ...props
}: BufferedTextareaProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value)
    }
  }, [isFocused, value])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value
    setDisplayValue(nextValue)
    startTransition(() => {
      onValueChange(nextValue)
    })
  }

  return (
    <Textarea
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
