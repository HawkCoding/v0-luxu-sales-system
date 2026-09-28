import { Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import { formatGuestCountText } from "@/lib/voucher/guest-count-text"
import type { VoucherStyles } from "../styles"
import { InfoRow } from "./info-row"

interface GuestInfoProps {
  data: VoucherData
  styles: VoucherStyles
  /** The template's hand-over note, printed small at the foot of the guest box. */
  guidance?: string | null
}

/** "A, B, C" → "A, B and C" — the template names the party the way a sentence would. */
export function joinGuestNames(names: string): string {
  const last = names.lastIndexOf(", ")
  return last < 0 ? names : `${names.slice(0, last)} and ${names.slice(last + 2)}`
}

export function GuestInfo({ data, styles, guidance }: GuestInfoProps) {
  return (
    <View style={[styles.box, styles.guestBox]} wrap={false}>
      <InfoRow label="Guest Names" value={joinGuestNames(data.guestNames)} styles={styles} />
      <InfoRow label="Number of Guests" value={formatGuestCountText(data.passengerTotals)} styles={styles} />
      <InfoRow label="Consultant" value={data.consultantName} styles={styles} />
      {data.specialRequests ? (
        <InfoRow label="Special Requests" value={data.specialRequests} styles={styles} />
      ) : null}
      {guidance?.trim() ? <Text style={styles.guidance}>{guidance.trim()}</Text> : null}
    </View>
  )
}
