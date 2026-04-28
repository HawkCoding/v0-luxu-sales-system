import { notFound } from "next/navigation"
import { PackageDetailView } from "@/components/package-detail-view"
import { createSessionClient } from "@/lib/supabase/server"
import { loadPackageDetail } from "@/app/api/packages/[slug]/helpers"

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

  return <PackageDetailView packageDetail={detail.detail} />
}
