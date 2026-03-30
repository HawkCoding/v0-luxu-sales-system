'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

const LIGHT_TOAST_STYLE = {
  '--normal-bg': '#ffffff',
  '--normal-text': '#09090b',
  '--normal-border': '#e4e4e7',
  '--success-bg': 'hsl(143, 85%, 96%)',
  '--success-border': 'hsl(145, 92%, 91%)',
  '--success-text': 'hsl(140, 100%, 27%)',
  '--info-bg': 'hsl(208, 100%, 97%)',
  '--info-border': 'hsl(221, 91%, 91%)',
  '--info-text': 'hsl(210, 92%, 45%)',
  '--warning-bg': 'hsl(49, 100%, 97%)',
  '--warning-border': 'hsl(49, 91%, 91%)',
  '--warning-text': 'hsl(31, 92%, 45%)',
  '--error-bg': 'hsl(359, 100%, 97%)',
  '--error-border': 'hsl(359, 100%, 94%)',
  '--error-text': 'hsl(360, 100%, 45%)',
} satisfies React.CSSProperties

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      {...props}
      theme="light"
      className="toaster group"
      style={LIGHT_TOAST_STYLE}
    />
  )
}

export { Toaster }
