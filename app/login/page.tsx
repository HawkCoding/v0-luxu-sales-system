"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Spinner } from "@/components/ui/spinner"

const loginPageClassName = "min-h-screen bg-background flex items-center justify-center p-4"

function LoginShell({ children }: { children: React.ReactNode }) {
  return <div className={loginPageClassName}>{children}</div>
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, loginWithMicrosoft, loginWithPassword, requestPasswordReset } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => {
    setHydrated(true)
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
    const authError = searchParams.get("error")
    if (!authError) return
    if (authError === "unauthorized") {
      setError("Your Microsoft account is not authorized. Contact your administrator.")
      return
    }
    if (authError === "account-link-mismatch") {
      setError("This email is already linked to another account. Contact your administrator.")
      return
    }
    setError("Sign in failed. Please try again.")
  }, [searchParams])

  const handleMicrosoftLogin = async () => {
    setError("")
    setOauthSubmitting(true)
    try {
      const success = await loginWithMicrosoft()
      if (!success) {
        setError("Unable to start Microsoft sign-in. Please try again.")
      }
    } finally {
      setOauthSubmitting(false)
    }
  }

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

  if (loading || !hydrated) {
    return (
      <LoginShell>
        <LoadingState variant="page" message="Loading..." />
      </LoginShell>
    )
  }

  return (
    <LoginShell>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-primary-foreground">LT</span>
          </div>
          <CardTitle className="text-3xl">Welcome Back</CardTitle>
          <CardDescription className="text-base mt-2">Sign in to Luxus Sales Operations</CardDescription>
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
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                    <span className="bg-card px-2">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-base font-medium"
                  disabled={oauthSubmitting}
                  onClick={handleMicrosoftLogin}
                >
                  {oauthSubmitting ? (
                    <>
                      <Spinner className="size-4" aria-hidden="true" />
                      Redirecting…
                    </>
                  ) : (
                    "Sign in with Microsoft"
                  )}
                </Button>
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
