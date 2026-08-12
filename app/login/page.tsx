"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { getLoginErrorMessage } from "@/lib/auth-errors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Spinner } from "@/components/ui/spinner"
import { AppLogo } from "@/components/app-logo"

const loginPageClassName = "min-h-screen bg-background flex items-center justify-center p-4"
// DEV_QUICK_LOGIN_START
const canUseDevQuickLogin = process.env.NODE_ENV === "development"
const defaultDevQuickLoginEmails = [
  "carmen@luxustravel.co.za",
  "dirk@luxustravel.co.za",
  "leonie@luxustravel.co.za",
  "monade@luxustravel.co.za",
  "douwlien@luxustravel.co.za",
]
const defaultDevQuickLoginPasswords = ["password123"]

interface DevQuickLoginCandidates {
  email: string
  passwords: string[]
}

interface DevQuickLoginAttempt {
  email: string
  password: string
}

function splitCommaSeparatedValues(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    deduped.push(value)
  }

  return deduped
}

function getDevQuickLoginCandidates() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") {
    return null
  }

  const configuredEmail = (
    window.localStorage.getItem("devQuickLoginEmail") ??
    process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN_EMAIL ??
    ""
  ).trim()
  const rawPasswords =
    window.localStorage.getItem("devQuickLoginPasswords") ??
    process.env.NEXT_PUBLIC_DEV_QUICK_LOGIN_PASSWORDS ??
    ""

  const candidateEmails = dedupeValues([
    ...splitCommaSeparatedValues(configuredEmail).map((email) => email.toLowerCase()),
    ...defaultDevQuickLoginEmails,
  ])
  const candidatePasswords = dedupeValues([
    ...splitCommaSeparatedValues(rawPasswords),
    ...defaultDevQuickLoginPasswords,
  ])

  if (candidateEmails.length === 0 || candidatePasswords.length === 0) {
    return null
  }

  return candidateEmails.map((email) => ({
    email,
    passwords: candidatePasswords,
  })) satisfies DevQuickLoginCandidates[]
}

function getDevQuickLoginAttempts(candidates: DevQuickLoginCandidates[]) {
  const attempts: DevQuickLoginAttempt[] = []

  for (const candidate of candidates) {
    for (const password of candidate.passwords) {
      attempts.push({ email: candidate.email, password })
    }
  }

  return attempts
}
// DEV_QUICK_LOGIN_END

function getLoginRequestErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "Unable to reach local Supabase. Start the local Supabase stack, then try signing in again."
  }

  return "Sign in failed. Please try again."
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return <div className={loginPageClassName}>{children}</div>
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, loginWithPassword, requestPasswordReset } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [slowLoad, setSlowLoad] = useState(false)
  const [branding, setBranding] = useState<{ logoUrl: string | null; businessName: string } | null>(null)

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then(setBranding)
      .catch(() => {})
  }, [])

  const businessName = branding?.businessName || "Luxus Travel"

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setSlowLoad(true), 9000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("lastLoginEmail")
    if (saved) setEmail(saved)
  }, [])

  useEffect(() => {
    if (!loading && user) {
      router.push("/app")
    }
  }, [loading, user, router])

  useEffect(() => {
    const message = getLoginErrorMessage(searchParams.get("error"))
    if (!message) return
    setError(message)
  }, [searchParams])

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError("Please enter your email")
      return
    }
    if (!password) {
      setError("Please enter your password")
      return
    }
    setSubmitting(true)
    try {
      const success = await loginWithPassword(normalizedEmail, password)
      if (success) {
        localStorage.setItem("lastLoginEmail", normalizedEmail)
        router.push("/app")
      } else {
        setError("Invalid email or password. Check your credentials or use Forgot password.")
        setPassword("")
      }
    } catch (error) {
      setError(getLoginRequestErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!forgotEmail.trim()) {
      setError("Please enter your email")
      return
    }
    setForgotSubmitting(true)
    try {
      const { ok, error: err } = await requestPasswordReset(forgotEmail.trim())
      if (ok) {
        setForgotSent(true)
      } else {
        setError(err || "Failed to send reset email. Try again.")
      }
    } finally {
      setForgotSubmitting(false)
    }
  }

  // DEV_QUICK_LOGIN_START
  const handleDevQuickLogin = async () => {
    if (!canUseDevQuickLogin) return

    const candidates = getDevQuickLoginCandidates()
    if (!candidates || candidates.length === 0) {
      setError(
        "Dev quick login is not configured. Set localStorage keys devQuickLoginEmail and devQuickLoginPasswords (comma-separated).",
      )
      return
    }

    const attempts = getDevQuickLoginAttempts(candidates)

    setError("")
    setSubmitting(true)
    try {
      for (const attempt of attempts) {
        const success = await loginWithPassword(attempt.email, attempt.password)
        if (success) {
          localStorage.setItem("lastLoginEmail", attempt.email)
          router.push("/app")
          return
        }
      }

      setError("Dev quick login failed with configured credentials.")
    } catch (error) {
      setError(getLoginRequestErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }
  // DEV_QUICK_LOGIN_END

  if (loading || !hydrated) {
    return (
      <LoginShell>
        <div className="flex flex-col items-center">
          <LoadingState variant="page" message="Loading..." />
          {slowLoad && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Having trouble connecting. Please check your network.
            </p>
          )}
        </div>
      </LoginShell>
    )
  }

  return (
    <LoginShell>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-6">
          <AppLogo
            logoUrl={branding?.logoUrl}
            businessName={businessName}
            className="mx-auto mb-4"
            size={64}
          />
          <CardTitle className="text-3xl">Welcome Back</CardTitle>
          <CardDescription className="text-base mt-2">Sign in to {businessName} Sales Operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {forgotMode ? (
              <>
                {forgotSent ? (
                  <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-4 text-sm text-green-800 dark:text-green-200">
                    Check your email for a link to reset your password. You can close this and sign in after resetting.
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <Label htmlFor="forgot-email" className="text-base">Email address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 text-base"
                      autoComplete="email"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1 h-11" disabled={forgotSubmitting}>
                        {forgotSubmitting ? (
                          <>
                            <Spinner className="size-4" aria-hidden="true" />
                            Sending…
                          </>
                        ) : (
                          "Send reset link"
                        )}
                      </Button>
                      <Button type="button" variant="outline" className="h-11" onClick={() => { setForgotMode(false); setError(""); setForgotSent(false) }}>
                        Back
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-base">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 text-base"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password" className="text-base">Password</Label>
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => { setForgotMode(true); setError("") }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-11 text-base"
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 text-base font-medium" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner className="size-4" aria-hidden="true" />
                        Signing in…
                      </>
                    ) : (
                      "Sign in with email"
                    )}
                  </Button>
                  {/* DEV_QUICK_LOGIN_START */}
                  {canUseDevQuickLogin && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full h-11 text-base"
                      onClick={handleDevQuickLogin}
                      disabled={submitting}
                    >
                      Quick login (dev only)
                    </Button>
                  )}
                  {/* DEV_QUICK_LOGIN_END */}
                </form>
              </>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </LoginShell>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoginShell><LoadingState variant="page" message="Loading..." /></LoginShell>}>
        <LoginForm />
      </Suspense>
    </AuthProvider>
  )
}
