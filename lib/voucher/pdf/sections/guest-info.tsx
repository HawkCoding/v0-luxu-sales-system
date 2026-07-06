import { Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import type { voucherStyles } from "../styles"
import { InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

interface GuestInfoProps {
  data: VoucherData
  styles: Styles
}

export function GuestInfo({ data, styles }: GuestInfoProps) {
  const childText = data.enquiry.noOfChildren ? `, ${data.enquiry.noOfChildren} children` : ""

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Guest Information</Text>
      <InfoRow label="Guest Names" value={data.guestNames} styles={styles} />
      <InfoRow
        label="Number of Guests"
        value={`${data.numberOfGuests} (${data.enquiry.noOfAdults} adults${childText})`}
        styles={styles}
      />
      <InfoRow label="Contact Email" value={data.customerEmail} styles={styles} />
      <InfoRow label="Contact Phone" value={data.customerPhone} styles={styles} />
      <InfoRow label="Consultant" value={`${data.consultant} - ${data.consultantName}`} styles={styles} />
      {data.specialRequests ? (
        <InfoRow label="Special Requests" value={data.specialRequests} styles={styles} />
      ) : null}
    </View>
  )
}
