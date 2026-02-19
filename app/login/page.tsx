"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const USERS = ["Carmen", "Leonie", "Dirk", "Monade", "Douwlien"]

function LoginForm() {
  const router = useRouter()
  const { user, login } = useAuth()
  const [selectedName, setSelectedName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (user) {
      router.push("/app")
    }
  }, [user, router])

  const handleLogin = (e: React.FormEvent) => {
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

    const success = login(selectedName, password)
    if (success) {
      router.push("/app")
    } else {
      setError("Invalid credentials")
      setPassword("")
    }
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
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base">Your Name</Label>
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
              <Label htmlFor="password" className="text-base">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-11 text-base"
              />
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 text-base font-medium">
              Sign In
            </Button>
          </form>
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
