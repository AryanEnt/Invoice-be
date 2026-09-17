import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env.js";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  if (env.PAYMENT_TOKEN_ENCRYPTION_KEY) {
    const raw = env.PAYMENT_TOKEN_ENCRYPTION_KEY.trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex");
    }
    return createHash("sha256").update(raw).digest();
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_TOKEN_ENCRYPTION_KEY is required in production for payment token encryption",
    );
  }
  return scryptSync(env.JWT_SECRET, "invoicehub-payment-token-v1", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
