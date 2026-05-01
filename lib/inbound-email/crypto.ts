import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

function getCredentialKey(): Buffer {
  const secret = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY

  if (!secret) {
    throw new Error("EMAIL_CREDENTIAL_ENCRYPTION_KEY is not set")
  }

  return createHash("sha256").update(secret).digest()
}

export function encryptCredential(plainText: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getCredentialKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return ["v1", iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":")
}

export function decryptCredential(encryptedValue: string): string {
  const [version, ivBase64, authTagBase64, encryptedBase64] = encryptedValue.split(":")

  if (version !== "v1" || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Unsupported encrypted credential format")
  }

  const decipher = createDecipheriv(ALGORITHM, getCredentialKey(), Buffer.from(ivBase64, "base64"))
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
