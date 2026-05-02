import { NextResponse } from "next/server"

export interface StaleVersionConflictPayload {
  error: string
  code: "STALE_VERSION"
  currentUpdatedAt: string
}

export function staleVersionResponse(
  entity: string,
  currentUpdatedAt: string,
): NextResponse<StaleVersionConflictPayload> {
  return NextResponse.json(
    {
      error: `This ${entity} was modified by another user since you started editing. Please refresh and try again.`,
      code: "STALE_VERSION",
      currentUpdatedAt,
    },
    { status: 409 },
  )
}
