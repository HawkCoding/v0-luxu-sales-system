import { render } from "@react-email/render"
import { createElement } from "react"
import { VoucherEmail, type VoucherEmailProps } from "@/emails/voucher-email"

export async function renderVoucherEmail(props: VoucherEmailProps): Promise<string> {
  return render(createElement(VoucherEmail, props))
}
