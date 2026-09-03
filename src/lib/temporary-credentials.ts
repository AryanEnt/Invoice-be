import { randomBytes } from "node:crypto";
import { hashSessionToken } from "./session-token.js";

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function createInvitationToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}
