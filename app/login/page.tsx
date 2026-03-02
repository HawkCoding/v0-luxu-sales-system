"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const USERS = ["Carmen", "Leonie", "Dirk", "Monade", "Douwlien"]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, login, loginWithMicrosoft, loginWithPassword, requestPasswordReset } = useAuth()
  const [selectedName, setSelectedName] = useState("")
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const devAuthEnabled = process.env.NEXT_PUBLIC_DEV_AUTH === "true"

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!selectedName) {
      setError("Please select your name")
      return
    }
    if (!password) {
      setError("Please enter your password")
      return
    }

    setSubmitting(true)
    try {
      const success = await login(selectedName, password)
      if (success) {
        router.push("/app")
      } else {
        setError("Invalid credentials. Make sure your account has been created in Supabase.")
        setPassword("")
      }
    } finally {
      setSubmitting(false)
    }
  }

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
    if (!email.trim()) {
      setError("Please enter your email")
      return
    }
    if (!password) {
      setError("Please enter your password")
      return
    }
    setSubmitting(true)
    try {
      const success = await loginWithPassword(email.trim(), password)
      if (success) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <span className="text-xl font-bold text-primary">LT</span>
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
                        {forgotSubmitting ? "Sending…" : "Send reset link"}
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
                    {submitting ? "Signing in…" : "Sign in with email"}
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
                  {oauthSubmitting ? "Redirecting…" : "Sign in with Microsoft"}
                </Button>

                {devAuthEnabled && (
                  <form onSubmit={handleLogin} className="space-y-5 border-t pt-5">
                    <p className="text-xs text-muted-foreground font-medium">Developer login</p>
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-base">Developer Name</Label>
                      <Select value={selectedName} onValueChange={setSelectedName}>
                        <SelectTrigger id="name" className="h-11 text-base">
                          <SelectValue placeholder="Select your name" />
                        </SelectTrigger>
                        <SelectContent>
                          {USERS.map((name) => (
                            <SelectItem key={name} value={name} className="text-base">
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dev-password" className="text-base">Developer Password</Label>
                      <Input
                        id="dev-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-11 text-base"
                      />
                    </div>
                    <Button type="submit" variant="outline" className="w-full h-11 text-base font-medium" disabled={submitting}>
                      {submitting ? "Signing in…" : "Dev Sign In"}
                    </Button>
                  </form>
                )}
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
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )
}
