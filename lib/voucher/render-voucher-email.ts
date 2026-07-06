import { render } from "@react-email/render"
import { createElement } from "react"
import { VoucherEmail, type VoucherEmailProps } from "@/emails/voucher-email"
import { getEmailFooterTagline } from "@/lib/settings-access"

export async function renderVoucherEmail(props: VoucherEmailProps): Promise<string> {
  const footerTagline = await getEmailFooterTagline()
  return render(createElement(VoucherEmail, { ...props, footerTagline }))
}
