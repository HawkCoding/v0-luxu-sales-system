import { notFound } from "next/navigation"
import { PackageDetailView } from "@/components/package-detail-view"
import { createSessionClient } from "@/lib/supabase/server"
import { loadPackageDetail } from "@/app/api/packages/[slug]/helpers"
import { packageDetailForRole } from "@/lib/packages"

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const detail = await loadPackageDetail(supabase, slug)
  if ("error" in detail) {
    notFound()
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  return (
    <PackageDetailView
      packageDetail={packageDetailForRole(detail.detail, {
        includeMarkupPct: profile?.clearance_level === "admin",
      })}
    />
  )
}
