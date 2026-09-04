import Stripe from "stripe";
import { ServiceUnavailableError, ValidationError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import { money } from "../../../lib/money.js";
import {
  STRIPE_OAUTH_DEAUTHORIZE_URL,
  STRIPE_OAUTH_TOKEN_URL,
  stripeClientId,
  stripeOAuthClientSecret,
  stripeSecretKey,
  stripeWebhookSecret,
} from "./config.js";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new ServiceUnavailableError(
      "Stripe is not configured on the server.",
      "STRIPE_NOT_CONFIGURED",
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeClient;
}

export function clearStripeClientCache(): void {
  stripeClient = null;
}

export function formatStripeAmount(amount: string, currency: string): number {
  const zeroDecimal = new Set([
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "ugx",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
  ]);
  const code = currency.trim().toLowerCase();
  const value = money(amount);
  if (zeroDecimal.has(code)) {
    return Math.round(value.toNumber());
  }
  return Math.round(value.times(100).toNumber());
}

export type StripeOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  stripe_publishable_key?: string;
  stripe_user_id?: string;
  scope?: string;
  livemode?: boolean;
  error?: string;
  error_description?: string;
};

export async function exchangeStripeAuthorizationCode(
  code: string,
): Promise<StripeOAuthTokenResponse> {
  const clientSecret = stripeOAuthClientSecret();
  if (!clientSecret) {
    throw new ServiceUnavailableError(
      "Stripe is not configured on the server.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_secret: clientSecret,
  });

  const response = await fetch(STRIPE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await response.json()) as StripeOAuthTokenResponse;
  if (!response.ok || data.error || !data.stripe_user_id || !data.access_token) {
    logger.warn("Stripe OAuth token exchange failed", {
      status: response.status,
      error: data.error,
    });
    throw new ValidationError(
      data.error === "invalid_grant"
        ? "Stripe authorization expired. Please try connecting again."
        : "Unable to connect Stripe. Please try again.",
    );
  }
  return data;
}

export async function deauthorizeStripeAccount(stripeUserId: string): Promise<void> {
  const clientId = stripeClientId();
  const clientSecret = stripeOAuthClientSecret();
  if (!clientId || !clientSecret) {
    return;
  }
  const body = new URLSearchParams({
    client_id: clientId,
    stripe_user_id: stripeUserId,
  });
  const response = await fetch(STRIPE_OAUTH_DEAUTHORIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    logger.warn("Stripe deauthorize request failed", { status: response.status });
  }
}

export async function retrieveStripeAccount(accountId: string): Promise<Stripe.Account> {
  return getStripeClient().accounts.retrieve(accountId);
}

export async function createStripeCheckoutSession(input: {
  amount: string;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  connectedAccountId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const stripe = getStripeClient();
  const unitAmount = formatStripeAmount(input.amount, input.currency);
  if (unitAmount <= 0) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.trim().toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: `Invoice ${input.invoiceNumber}`,
            },
          },
        },
      ],
      metadata: {
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
      },
      payment_intent_data: {
        metadata: {
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
        },
      },
    },
    { stripeAccount: input.connectedAccountId },
  );

  if (!session.id || !session.url) {
    throw new ServiceUnavailableError(
      "Stripe is temporarily unavailable. Please try again later.",
      "STRIPE_SESSION_FAILED",
    );
  }

  return { sessionId: session.id, checkoutUrl: session.url };
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
  connectedAccountId: string,
): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.retrieve(
    sessionId,
    { expand: ["payment_intent"] },
    { stripeAccount: connectedAccountId },
  );
}

export function constructStripeWebhookEvent(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const secret = stripeWebhookSecret();
  if (!secret) {
    throw new ValidationError("Stripe webhook is not configured.");
  }
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}

export function stripeModeMatchesKey(livemode: boolean | undefined): boolean {
  const key = stripeSecretKey() ?? "";
  if (key.startsWith("sk_live_")) {
    return livemode === true;
  }
  if (key.startsWith("sk_test_")) {
    return livemode !== true;
  }
  return true;
}
