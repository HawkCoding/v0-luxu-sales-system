import { Text, View } from "@react-pdf/renderer"
import type { VoucherTemplate } from "@/lib/types"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

interface VoucherFooterProps {
  template: VoucherTemplate
  styles: Styles
}

export function VoucherFooter({ template, styles }: VoucherFooterProps) {
  const contact = [template.footer_phone, template.footer_email].filter(Boolean).join(" · ")

  return (
    <View style={[styles.section, styles.footerSection]}>
      <View style={styles.footerRule} />
      {template.footer_company ? <Text style={styles.footerCompany}>{template.footer_company}</Text> : null}
      {contact ? <Text style={styles.footerContact}>{contact}</Text> : null}
    </View>
  )
}
