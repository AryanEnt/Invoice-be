import { createHash, timingSafeEqual } from "node:crypto";

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function oauthStatesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
