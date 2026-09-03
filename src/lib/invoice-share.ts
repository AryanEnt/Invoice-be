import { randomBytes } from "node:crypto";
import { corsOrigins, env } from "../config/env.js";

export function generateInvoiceShareToken(): string {
  return randomBytes(32).toString("hex");
}

export function appBaseUrl(): string {
  return (env.APP_URL ?? corsOrigins[0] ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function invoiceShareUrl(token: string): string {
  return `${appBaseUrl()}/invoice/${token}`;
}
