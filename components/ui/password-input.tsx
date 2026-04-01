"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

interface PasswordInputProps
  extends Omit<React.ComponentProps<typeof InputGroupInput>, "type" | "className"> {
  className?: string
  inputClassName?: string
}

export function PasswordInput({ className, inputClassName, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const toggleLabel = visible ? "Hide password" : "Show password"

  return (
    <InputGroup className={className}>
      <InputGroupInput {...props} className={inputClassName} type={visible ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-pressed={visible}
          size="icon-xs"
          variant="ghost"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
