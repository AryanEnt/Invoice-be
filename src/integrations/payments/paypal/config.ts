import { env, corsOrigins } from "../../../config/env.js";

export type PayPalEnvironment = "sandbox" | "live";

export function paypalEnvironment(): PayPalEnvironment {
  return env.PAYPAL_ENV;
}

export function paypalPublicEnvironment(): "sandbox" | "production" {
  return env.PAYPAL_ENV === "live" ? "production" : "sandbox";
}

export function paypalApiBaseUrl(): string {
  return paypalEnvironment() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalWebBaseUrl(): string {
  return paypalEnvironment() === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
}

export function paypalCredentialsConfigured(): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

export function paypalWebhookConfigured(): boolean {
  return Boolean(env.PAYPAL_WEBHOOK_ID);
}

export function appPublicUrl(): string {
  return (env.APP_URL ?? corsOrigins[0] ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function apiPublicUrl(): string {
  return (env.API_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, "");
}

/**
 * Authoritative Log in with PayPal Return URL.
 * Must exactly match Developer Dashboard → Log in with PayPal → Advanced Settings.
 * Do not derive this from API_URL — mismatches cause "invalid client_id or redirect_uri".
 */
export function paypalOAuthRedirectUri(): string {
  const configured = env.PAYPAL_REDIRECT_URI?.trim();
  if (!configured) {
    throw new Error("PAYPAL_REDIRECT_URI_MISSING");
  }
  return configured;
}

export function paypalOAuthRedirectUriOrNull(): string | null {
  const configured = env.PAYPAL_REDIRECT_URI?.trim();
  return configured || null;
}

export const PAYPAL_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://uri.paypal.com/services/paypalattributes",
].join(" ");
