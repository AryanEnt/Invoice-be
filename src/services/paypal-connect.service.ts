import { randomBytes } from "node:crypto";
import { env, corsOrigins } from "../config/env.js";
import { ForbiddenError, ServiceUnavailableError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";

const PAYPAL_CONNECT_SCOPES = [
  "openid",
  "profile",
  "email",
  "address",
  "https://uri.paypal.com/services/paypalattributes",
].join(" ");

function appBaseUrl(): string {
  return (env.APP_URL ?? corsOrigins[0] ?? "http://localhost:3000").replace(/\/+$/, "");
}

function paypalConnectBaseUrl(): string {
  return env.PAYPAL_ENV === "live"
    ? "https://www.paypal.com/connect"
    : "https://www.sandbox.paypal.com/connect";
}

function paypalRedirectUri(): string {
  return env.PAYPAL_REDIRECT_URI ?? `${appBaseUrl()}/settings/payment`;
}

export function getPayPalConnectUrl(actor: AuthUser): { url: string; redirectUri: string } {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a SUPER_ADMIN can connect PayPal");
  }

  if (env.PAYPAL_CONNECT_URL) {
    return {
      url: env.PAYPAL_CONNECT_URL,
      redirectUri: paypalRedirectUri(),
    };
  }

  if (!env.PAYPAL_CLIENT_ID) {
    throw new ServiceUnavailableError(
      "PayPal is not configured. Set PAYPAL_CLIENT_ID (and optionally PAYPAL_REDIRECT_URI).",
      "PAYPAL_NOT_CONFIGURED",
    );
  }

  const redirectUri = paypalRedirectUri();
  const nonce = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: env.PAYPAL_CLIENT_ID,
    scope: PAYPAL_CONNECT_SCOPES,
    redirect_uri: redirectUri,
    response_type: "code",
    nonce,
  });

  return {
    url: `${paypalConnectBaseUrl()}?${params.toString()}`,
    redirectUri,
  };
}
