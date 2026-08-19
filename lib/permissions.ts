import type { Role } from "@/lib/types"

/** Every active role. The default gate — if an action isn't user admin or a
 *  settings write, all three roles may perform it. */
export const ALL_ROLES = ["admin", "manager", "consultant"] as const satisfies readonly Role[]

/** Writing global configuration: /app/settings, rate types, voucher template,
 *  inbound mail, backups, FX overrides. Consultants read these, never write. */
export const SETTINGS_WRITE_ROLES = ["admin", "manager"] as const satisfies readonly Role[]

/** Creating/editing/deleting users and changing clearance levels. */
export const USER_ADMIN_ROLES = ["admin"] as const satisfies readonly Role[]
