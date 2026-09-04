import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { ForbiddenError, ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { toAuthUser } from "../lib/public-user.js";
import { decryptSecret, encryptSecret } from "../lib/secret-box.js";
import { invoiceShareUrl } from "../lib/invoice-share.js";
import {
  clearStripeClientCache,
  deauthorizeStripeAccount,
  exchangeStripeAuthorizationCode,
  retrieveStripeAccount,
} from "../integrations/payments/stripe/client.js";
import {
  STRIPE_OAUTH_AUTHORIZE_URL,
  appPublicUrl,
  stripeClientId,
  stripeCredentialsConfigured,
  stripeOAuthRedirectUri,
  stripeOAuthRedirectUriOrNull,
  stripePublicEnvironment,
  stripeSecretKey,
  stripeWebhookSecret,
} from "../integrations/payments/stripe/config.js";
import {
  findPaymentGatewayConfig,
  upsertPaymentGatewayConfig,
} from "../repositories/payment-gateway.repository.js";
import {
  consumePaymentOAuthState,
  createPaymentOAuthState,
} from "../repositories/payment-oauth-state.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import type { AuthUser } from "../types/auth.js";
import { recordAudit } from "./audit.service.js";

const STATE_TTL_MS = 10 * 60 * 1000;

type CallbackErrorReason =
  | "access_denied"
  | "auth_required"
  | "config"
  | "exchange"
  | "invalid_state"
  | "rejected";

function assertSuperAdmin(actor: AuthUser): void {
  if (actor.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Only a Super Admin can manage the Stripe payment gateway.");
  }
}

function maskAccountId(accountId: string | null | undefined): string | null {
  if (!accountId || accountId.length < 8) {
    return accountId ?? null;
  }
  return `${accountId.slice(0, 7)}…${accountId.slice(-4)}`;
}

function requireRedirectUri(): string {
  try {
    return stripeOAuthRedirectUri();
  } catch {
    throw new ServiceUnavailableError(
      "STRIPE_REDIRECT_URI is required and must exactly match the Stripe Connect OAuth redirect URI.",
      "STRIPE_REDIRECT_URI_MISSING",
    );
  }
}

function assertSecureRedirectUri(redirectUri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new ValidationError("Stripe Return URL is invalid. Check STRIPE_REDIRECT_URI.");
  }
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new ValidationError("Stripe Return URL must use HTTPS in production.");
  }
}

function popupCloserRedirect(status: "success" | "error", reason?: CallbackErrorReason): string {
  const url = new URL("/stripe-popup-closer.html", `${appPublicUrl()}/`);
  url.searchParams.set("status", status);
  if (status === "error") {
    url.searchParams.set("message", stripeCallbackErrorMessage(reason ?? null));
    if (reason) url.searchParams.set("reason", reason);
  }
  return url.toString();
}

function settingsPageRedirect(status: "connected" | "error", reason?: CallbackErrorReason): string {
  const url = new URL("/settings/payment", `${appPublicUrl()}/`);
  url.searchParams.set("stripe", status);
  if (status === "error" && reason) {
    url.searchParams.set("reason", reason);
  }
  return url.toString();
}

function stripeCallbackErrorMessage(reason: CallbackErrorReason | null): string {
  switch (reason) {
    case "access_denied":
      return "Stripe connection was cancelled.";
    case "auth_required":
      return "Your session expired during Stripe login. Sign in again, then reconnect.";
    case "config":
      return "Unable to connect Stripe. Check the Stripe Connect application and redirect URI.";
    case "invalid_state":
      return "Stripe connection could not be verified. Please try connecting again.";
    case "exchange":
    case "rejected":
    default:
      return "Unable to connect Stripe. Please try again.";
  }
}

export type StripeGatewayStatusView = {
  connected: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  mode: "connect_oauth";
  architecture: "single_company";
  environment: "test" | "live";
  account: string | null;
  accountId: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  redirectUri: string | null;
  needsAttention: boolean;
};

export type StripeConnectStartResult = {
  mode: "connect_oauth";
  connected: false;
  url: string;
  environment: "test" | "live";
  redirectUri: string;
};

export async function getStripeGatewayStatus(actor: AuthUser): Promise<StripeGatewayStatusView> {
  assertSuperAdmin(actor);
  const config = await findPaymentGatewayConfig("STRIPE");
  const connected = config?.status === "CONNECTED";
  return {
    connected,
    configured: stripeCredentialsConfigured() && Boolean(stripeOAuthRedirectUriOrNull()),
    webhookConfigured: Boolean(stripeWebhookSecret()),
    mode: "connect_oauth",
    architecture: "single_company",
    environment: stripePublicEnvironment(),
    account: connected ? maskAccountId(config?.merchantId) : null,
    accountId: connected ? config?.merchantId ?? null : null,
    connectedAt: connected && config?.connectedAt ? config.connectedAt.toISOString() : null,
    lastVerifiedAt: connected && config?.lastVerifiedAt ? config.lastVerifiedAt.toISOString() : null,
    redirectUri: stripeOAuthRedirectUriOrNull(),
    needsAttention: Boolean(connected && !config?.merchantId),
  };
}

export async function isGlobalStripeConnected(): Promise<boolean> {
  if (!stripeCredentialsConfigured()) return false;
  const config = await findPaymentGatewayConfig("STRIPE");
  return config?.status === "CONNECTED" && Boolean(config.merchantId);
}

export async function getConnectedStripeAccountId(): Promise<string | null> {
  if (!(await isGlobalStripeConnected())) return null;
  const config = await findPaymentGatewayConfig("STRIPE");
  return config?.merchantId ?? null;
}

export async function startStripeConnect(actor: AuthUser): Promise<StripeConnectStartResult> {
  assertSuperAdmin(actor);
  if (!stripeCredentialsConfigured()) {
    throw new ServiceUnavailableError(
      "Stripe Connect is not configured on the server.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const redirectUri = requireRedirectUri();
  assertSecureRedirectUri(redirectUri);
  const clientId = stripeClientId();
  if (!clientId) {
    throw new ServiceUnavailableError(
      "Stripe Connect is not configured on the server.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const key = stripeSecretKey() ?? "";
  if (key.startsWith("sk_live_") && env.NODE_ENV !== "production") {
    logger.warn("Stripe live secret key used outside production", { actorId: actor.id });
  }

  const state = randomBytes(32).toString("base64url");
  await createPaymentOAuthState({
    provider: "STRIPE",
    state,
    actorId: actor.id,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
  });

  const url = `${STRIPE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  logger.info("Stripe connect started", {
    actorId: actor.id,
    environment: stripePublicEnvironment(),
  });

  return {
    mode: "connect_oauth",
    connected: false,
    url,
    environment: stripePublicEnvironment(),
    redirectUri,
  };
}

export async function handleStripeOAuthCallback(input: {
  actor: AuthUser | null;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  preferPopupCloser?: boolean;
}): Promise<string> {
  const redirect = (status: "connected" | "error", reason?: CallbackErrorReason) =>
    input.preferPopupCloser !== false
      ? popupCloserRedirect(status === "connected" ? "success" : "error", reason)
      : settingsPageRedirect(status, reason);

  if (input.error === "access_denied") {
    return redirect("error", "access_denied");
  }
  if (input.error) {
    logger.warn("Stripe OAuth error from provider", { error: input.error });
    return redirect("error", "rejected");
  }
  if (!input.state || !input.code) {
    return redirect("error", "rejected");
  }

  const consumed = await consumePaymentOAuthState("STRIPE", input.state);
  if (!consumed.ok) {
    return redirect("error", "invalid_state");
  }
  if (input.actor && input.actor.id !== consumed.actorId) {
    return redirect("error", "invalid_state");
  }

  const stateUser = await findUserById(consumed.actorId);
  if (!stateUser || stateUser.status !== "ACTIVE" || stateUser.role !== "SUPER_ADMIN") {
    return redirect("error", "auth_required");
  }
  const actor = toAuthUser(stateUser);

  try {
    requireRedirectUri();
    const tokens = await exchangeStripeAuthorizationCode(input.code);
    const accountId = tokens.stripe_user_id!;
    let email: string | null = null;
    try {
      const account = await retrieveStripeAccount(accountId);
      email = account.email ?? null;
    } catch {
      logger.warn("Stripe account retrieve failed after OAuth", { accountId });
    }

    const now = new Date();
    await upsertPaymentGatewayConfig({
      provider: "STRIPE",
      status: "CONNECTED",
      environment: stripePublicEnvironment(),
      merchantId: accountId,
      merchantEmail: email,
      accountEmailMasked: maskAccountId(accountId),
      encryptedAccessToken: encryptSecret(tokens.access_token!),
      encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      tokenExpiresAt: null,
      connectedAt: now,
      disconnectedAt: null,
      lastVerifiedAt: now,
      connectedById: actor.id,
    });

    await recordAudit({
      actorId: actor.id,
      action: "STRIPE_CONNECTED",
      entity: "PaymentGatewayConfig",
      entityId: "STRIPE",
      metadata: {
        mode: "connect_oauth",
        architecture: "single_company",
        accountId,
        environment: stripePublicEnvironment(),
      },
    });

    logger.info("Stripe connected", {
      actorId: actor.id,
      accountId,
      environment: stripePublicEnvironment(),
    });
    return redirect("connected");
  } catch (error) {
    const code =
      error instanceof ServiceUnavailableError || error instanceof ValidationError
        ? error.code
        : undefined;
    logger.error("Stripe OAuth callback failed", { actorId: actor.id, code });
    if (code === "STRIPE_REDIRECT_URI_MISSING" || code === "STRIPE_NOT_CONFIGURED") {
      return redirect("error", "config");
    }
    return redirect("error", "exchange");
  }
}

export async function disconnectStripe(actor: AuthUser): Promise<StripeGatewayStatusView> {
  assertSuperAdmin(actor);
  const existing = await findPaymentGatewayConfig("STRIPE");
  if (existing?.merchantId) {
    try {
      await deauthorizeStripeAccount(existing.merchantId);
    } catch {
      logger.warn("Stripe deauthorize skipped", { actorId: actor.id });
    }
  }

  await upsertPaymentGatewayConfig({
    provider: "STRIPE",
    status: "DISCONNECTED",
    environment: stripePublicEnvironment(),
    merchantId: null,
    merchantEmail: null,
    accountEmailMasked: null,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    connectedAt: null,
    disconnectedAt: new Date(),
    lastVerifiedAt: null,
    connectedById: null,
  });
  clearStripeClientCache();

  await recordAudit({
    actorId: actor.id,
    action: "STRIPE_DISCONNECTED",
    entity: "PaymentGatewayConfig",
    entityId: existing?.id ?? "STRIPE",
    metadata: { previousAccountId: existing?.merchantId ?? null },
  });

  logger.info("Stripe disconnected", { actorId: actor.id });
  return getStripeGatewayStatus(actor);
}

export async function testStripeConnection(actor: AuthUser): Promise<{
  connected: boolean;
  environment: "test" | "live";
  verifiedAt?: string;
  message?: string;
}> {
  assertSuperAdmin(actor);
  const environment = stripePublicEnvironment();
  const config = await findPaymentGatewayConfig("STRIPE");
  if (config?.status !== "CONNECTED" || !config.merchantId) {
    return { connected: false, environment, message: "Stripe is not connected." };
  }

  try {
    await retrieveStripeAccount(config.merchantId);
    if (config.encryptedAccessToken) {
      decryptSecret(config.encryptedAccessToken);
    }
    const verifiedAt = new Date();
    await upsertPaymentGatewayConfig({
      provider: "STRIPE",
      status: "CONNECTED",
      environment,
      merchantId: config.merchantId,
      merchantEmail: config.merchantEmail,
      accountEmailMasked: config.accountEmailMasked,
      encryptedAccessToken: config.encryptedAccessToken,
      encryptedRefreshToken: config.encryptedRefreshToken,
      tokenExpiresAt: config.tokenExpiresAt,
      connectedAt: config.connectedAt,
      disconnectedAt: null,
      lastVerifiedAt: verifiedAt,
      connectedById: config.connectedById,
    });
    return { connected: true, environment, verifiedAt: verifiedAt.toISOString() };
  } catch {
    return {
      connected: false,
      environment,
      message: "Stripe connection needs attention. Please reconnect.",
    };
  }
}

export function stripeCustomerReturnUrl(token: string, result: "success" | "cancel"): string {
  const url = new URL(invoiceShareUrl(token));
  url.searchParams.set("stripe", result);
  return url.toString();
}
