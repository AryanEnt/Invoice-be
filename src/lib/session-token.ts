import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
}
