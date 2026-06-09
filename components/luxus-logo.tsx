import Image from "next/image"

interface LuxusLogoProps {
  className?: string
  size?: number
}

export function LuxusLogo({ className, size = 64 }: LuxusLogoProps) {
  return (
    <Image
      src="/3in1.png"
      alt="Company logo"
      width={size}
      height={size}
      className={className}
    />
  )
}
