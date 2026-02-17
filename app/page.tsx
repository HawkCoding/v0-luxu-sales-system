import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <div className="w-16 h-16 rounded-full bg-brand-gold mx-auto mb-4 flex items-center justify-center">
            <span className="text-xl font-bold text-card" style={{ fontFamily: "var(--font-inter)" }}>LT</span>
          </div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight text-balance">
            Luxus Travel & Tours
          </h1>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Internal sales operations system
          </p>
        </div>
        <div className="space-y-3">
          <Link
            href="/app"
            className="block w-full py-3 px-4 bg-foreground text-background rounded-lg text-center text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Enter Internal Dashboard
          </Link>
          <Link
            href="/enquire/rovos"
            className="block w-full py-3 px-4 bg-brand-gold text-card rounded-lg text-center text-sm font-medium hover:bg-brand-gold-light transition-colors"
          >
            Public Rovos Rail Enquiry Form
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Demo application with seeded data</p>
      </div>
    </div>
  )
}
