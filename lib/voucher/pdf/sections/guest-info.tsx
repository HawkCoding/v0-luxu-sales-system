import { Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import { formatGuestCountText } from "@/lib/voucher/guest-count-text"
import type { voucherStyles } from "../styles"
import { InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

interface GuestInfoProps {
  data: VoucherData
  styles: Styles
}

export function GuestInfo({ data, styles }: GuestInfoProps) {
  // Alternating bands, the way the legacy voucher shaded every other row of its guest table.
  let rowIndex = 0
  const nextShaded = () => rowIndex++ % 2 === 0

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>Guest Information</Text>
      <InfoRow label="Guest Names" value={data.guestNames} styles={styles} shaded={nextShaded()} />
      <InfoRow
        label="Number of Guests"
        value={formatGuestCountText(data.passengerTotals)}
        styles={styles}
        shaded={nextShaded()}
      />
      <InfoRow label="Consultant" value={data.consultantName} styles={styles} shaded={nextShaded()} />
      {data.specialRequests ? (
        <InfoRow label="Special Requests" value={data.specialRequests} styles={styles} shaded={nextShaded()} />
      ) : null}
    </View>
  )
}
