export interface InboundEmailIdentity {
  emailAccountId: string
  uidvalidity: number
  uid: number
}

export function buildInboundEmailIdentityKey(identity: InboundEmailIdentity): string {
  return `${identity.emailAccountId}:${identity.uidvalidity}:${identity.uid}`
}

export function isSameInboundEmailIdentity(
  left: InboundEmailIdentity,
  right: InboundEmailIdentity,
): boolean {
  return buildInboundEmailIdentityKey(left) === buildInboundEmailIdentityKey(right)
}
