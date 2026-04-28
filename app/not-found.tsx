"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Train } from "lucide-react"

const TRAIN_FACTS = [
  "The Trans-Siberian Railway is the longest railway line in the world, spanning 9,289 kilometers across Russia.",
  "Japan's Shinkansen bullet trains can reach speeds of up to 320 km/h and have never had a fatal accident.",
  "India's railway network employs over 1.4 million people, making it one of the world's largest employers.",
  "The Orient Express, which began service in 1883, connected Paris to Istanbul and became synonymous with luxury travel.",
  "Switzerland has one of the world's most efficient rail systems, with trains arriving on average within 3 minutes of schedule.",
  "The Glacier Express in Switzerland takes 8 hours to travel 291 km, making it the slowest express train in the world.",
  "China's high-speed rail network is the longest in the world, with over 40,000 km of track.",
  "The first underground railway in the world opened in London in 1863, using steam locomotives.",
]

export default function NotFound() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(10)
  const [fact, setFact] = useState(TRAIN_FACTS[0])

  useEffect(() => {
    setFact(TRAIN_FACTS[Math.floor(Math.random() * TRAIN_FACTS.length)])
  }, [])

  useEffect(() => {
    if (countdown === 0) return

    const timer = window.setTimeout(() => {
      setCountdown((prev) => Math.max(prev - 1, 0))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (countdown === 0) {
      router.replace("/app")
    }
  }, [countdown, router])

  const progress = ((10 - countdown) / 10) * 100

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardContent className="p-8 md:p-12 space-y-8 text-center">
          <div className="space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Train className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-foreground">Page Not Found</h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              The page you're looking for doesn't exist. While you wait, here's an interesting fact about trains:
            </p>
          </div>

          <div className="bg-secondary/50 rounded-lg p-6 border border-border">
            <p className="text-base text-foreground leading-relaxed italic">
              "{fact}"
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Redirecting to dashboard in <span className="font-semibold text-primary text-lg">{countdown}</span> seconds...
              </p>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => router.push("/app")}
              className="text-sm text-primary hover:underline font-medium"
            >
              Go to dashboard now
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
