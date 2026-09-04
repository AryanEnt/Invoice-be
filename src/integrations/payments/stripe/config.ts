import { env, corsOrigins } from "../../../config/env.js";

export function stripeSecretKey(): string | undefined {
  return env.STRIPE_SECRET_KEY;
}

/** Platform Connect client id (ca_…). */
export function stripeClientId(): string | undefined {
  return env.STRIPE_CLIENT_ID;
}

/**
 * OAuth token exchange secret. Stripe Connect uses the platform secret key
 * as client_secret; optional STRIPE_CLIENT_SECRET overrides if set.
 */
export function stripeOAuthClientSecret(): string | undefined {
  return env.STRIPE_CLIENT_SECRET || env.STRIPE_SECRET_KEY;
}

export function stripeWebhookSecret(): string | undefined {
  return env.STRIPE_WEBHOOK_SECRET;
}

export function stripeCredentialsConfigured(): boolean {
  return Boolean(stripeClientId() && stripeOAuthClientSecret() && stripeSecretKey());
}

export function stripePublicEnvironment(): "test" | "live" {
  const key = stripeSecretKey() ?? "";
  return key.startsWith("sk_live_") ? "live" : "test";
}

export function appPublicUrl(): string {
  return (env.APP_URL ?? corsOrigins[0] ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function apiPublicUrl(): string {
  return (env.API_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, "");
}

export function stripeOAuthRedirectUri(): string {
  const configured = env.STRIPE_REDIRECT_URI?.trim();
  if (!configured) {
    throw new Error("STRIPE_REDIRECT_URI_MISSING");
  }
  return configured;
}

export function stripeOAuthRedirectUriOrNull(): string | null {
  return env.STRIPE_REDIRECT_URI?.trim() || null;
}

export const STRIPE_OAUTH_AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize";
export const STRIPE_OAUTH_TOKEN_URL = "https://connect.stripe.com/oauth/token";
export const STRIPE_OAUTH_DEAUTHORIZE_URL = "https://connect.stripe.com/oauth/deauthorize";
