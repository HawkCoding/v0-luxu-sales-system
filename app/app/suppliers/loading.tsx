export default function Loading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-24 rounded-lg bg-secondary" />
        ))}
      </div>
    </div>
  )
}
