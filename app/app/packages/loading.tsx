export default function PackagesLoading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-10 w-56 animate-pulse rounded-lg bg-secondary" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-lg bg-secondary" />
      ))}
    </div>
  )
}
