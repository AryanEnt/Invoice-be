import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { ForbiddenError, ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { toAuthUser } from "../lib/public-user.js";
import { decryptSecret, encryptSecret } from "../lib/secret-box.js";
import { invoiceShareUrl } from "../lib/invoice-share.js";
import {
  clearPayPalAppTokenCache,
  exchangePayPalAuthorizationCode,
  getPayPalAppAccessToken,
  getPayPalUserInfo,
  refreshPayPalAccessToken,
} from "../integrations/payments/paypal/client.js";
import {
  appPublicUrl,
  paypalCredentialsConfigured,
  paypalEnvironment,
  paypalOAuthRedirectUri,
  paypalOAuthRedirectUriOrNull,
  PAYPAL_OAUTH_SCOPES,
  paypalPublicEnvironment,
  paypalWebBaseUrl,
} from "../integrations/payments/paypal/config.js";
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
    throw new ForbiddenError("Only a Super Admin can manage the PayPal payment gateway.");
  }
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return null;
  }
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskMerchantId(merchantId: string | null | undefined): string | null {
  if (!merchantId || merchantId.length < 4) {
    return null;
  }
  const tail = merchantId.slice(-6);
  return `••••${tail}`;
}

function displayAccount(email: string | null | undefined, merchantId: string | null | undefined): string | null {
  return maskEmail(email) ?? maskMerchantId(merchantId);
}

function assertSecureRedirectUri(redirectUri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new ValidationError(
      "PayPal Return URL is invalid. Set PAYPAL_REDIRECT_URI to the exact URL registered in the PayPal Developer Dashboard.",
    );
  }
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new ValidationError("PayPal Return URL must use HTTPS in production.");
  }
}

function requireRedirectUri(): string {
  try {
    const redirectUri = paypalOAuthRedirectUri();
    assertSecureRedirectUri(redirectUri);
    return redirectUri;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ServiceUnavailableError(
      "PAYPAL_REDIRECT_URI is required and must exactly match Log in with PayPal → Advanced Settings → Return URL.",
      "PAYPAL_REDIRECT_URI_MISSING",
    );
  }
}

export type PayPalGatewayStatusView = {
  connected: boolean;
  configured: boolean;
  mode: "identity";
  architecture: "single_company";
  environment: "sandbox" | "production";
  account: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  redirectUri: string | null;
};

export type PayPalConnectStartResult = {
  mode: "identity";
  connected: false;
  url: string;
  environment: "sandbox" | "live";
  redirectUri: string;
};

export type PayPalTestConnectionResult =
  | {
      connected: true;
      environment: "sandbox" | "live";
      verifiedAt: string;
    }
  | {
      connected: false;
      environment: "sandbox" | "live";
      message: string;
    };

export async function getPayPalGatewayStatus(actor: AuthUser): Promise<PayPalGatewayStatusView> {
  assertSuperAdmin(actor);
  const config = await findPaymentGatewayConfig("PAYPAL");
  const connected = config?.status === "CONNECTED";
  return {
    connected,
    configured: paypalCredentialsConfigured() && Boolean(paypalOAuthRedirectUriOrNull()),
    mode: "identity",
    architecture: "single_company",
    environment: paypalPublicEnvironment(),
    account: connected
      ? displayAccount(config?.merchantEmail, config?.merchantId) ?? config?.accountEmailMasked ?? null
      : null,
    connectedAt: connected && config?.connectedAt ? config.connectedAt.toISOString() : null,
    lastVerifiedAt: connected && config?.lastVerifiedAt ? config.lastVerifiedAt.toISOString() : null,
    redirectUri: paypalOAuthRedirectUriOrNull(),
  };
}

export async function isGlobalPayPalConnected(): Promise<boolean> {
  if (!paypalCredentialsConfigured()) {
    return false;
  }
  const config = await findPaymentGatewayConfig("PAYPAL");
  return config?.status === "CONNECTED";
}

/**
 * Starts official PayPal-hosted Log in with PayPal (/connect?flowEntry=static).
 * Do not construct PayPal's internal /signin?intent=connect URL.
 */
export async function startPayPalConnect(actor: AuthUser): Promise<PayPalConnectStartResult> {
  assertSuperAdmin(actor);
  if (!paypalCredentialsConfigured()) {
    throw new ServiceUnavailableError(
      "PayPal app credentials are not configured on the server.",
      "PAYPAL_NOT_CONFIGURED",
    );
  }

  const redirectUri = requireRedirectUri();
  const environment = paypalEnvironment();

  // Prove Client ID + Secret work against the matching API host before sending the user to PayPal.
  try {
    await getPayPalAppAccessToken();
  } catch {
    throw new ServiceUnavailableError(
      "PayPal rejected the app credentials. Use the Client ID and Secret from the same Developer Dashboard app, matching PAYPAL_ENVIRONMENT (sandbox or live).",
      "PAYPAL_CREDENTIALS_INVALID",
    );
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(16).toString("hex");
  await createPaymentOAuthState({
    provider: "PAYPAL",
    state,
    actorId: actor.id,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: env.PAYPAL_CLIENT_ID ?? "",
    scope: PAYPAL_OAUTH_SCOPES,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    nonce,
  });

  const url = `${paypalWebBaseUrl()}/connect?${params.toString()}`;
  let redirectHost = "";
  try {
    redirectHost = new URL(redirectUri).host;
  } catch {
    redirectHost = "invalid";
  }
  logger.info("PayPal connect started", {
    actorId: actor.id,
    environment,
    redirectHost,
  });

  return {
    mode: "identity",
    connected: false,
    url,
    environment,
    redirectUri,
  };
}

function popupCloserRedirect(status: "success" | "error", reason?: CallbackErrorReason): string {
  const url = new URL("/paypal-popup-closer.html", `${appPublicUrl()}/`);
  url.searchParams.set("status", status);
  if (status === "error") {
    url.searchParams.set("message", paypalCallbackErrorMessage(reason ?? null));
    if (reason) {
      url.searchParams.set("reason", reason);
    }
  }
  return url.toString();
}

function paypalCallbackErrorMessage(reason: CallbackErrorReason | null): string {
  switch (reason) {
    case "access_denied":
      return "PayPal connection was cancelled. You can try again when ready.";
    case "auth_required":
      return "Your session expired during PayPal login. Sign in again, then reconnect.";
    case "config":
      return "PayPal rejected the connection request. Please verify the PayPal Sandbox application and Return URL configuration.";
    case "exchange":
    case "rejected":
      return "PayPal connection failed. Please verify the PayPal Sandbox application and Return URL configuration.";
    case "invalid_state":
      return "PayPal connection could not be verified. Please try connecting again.";
    default:
      return "PayPal connection failed. Please verify the PayPal Sandbox application and Return URL configuration.";
  }
}

/** @deprecated Use popupCloserRedirect — kept name for call-site clarity during OAuth handling. */
function settingsRedirect(status: "connected" | "error", reason?: CallbackErrorReason): string {
  return popupCloserRedirect(status === "connected" ? "success" : "error", reason);
}

export async function handlePayPalOAuthCallback(input: {
  actor: AuthUser | null;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}): Promise<string> {
  if (input.error === "access_denied") {
    logger.warn("PayPal OAuth access denied", { hasActor: Boolean(input.actor) });
    return settingsRedirect("error", "access_denied");
  }

  if (input.error) {
    logger.warn("PayPal OAuth callback error from provider", {
      error: input.error,
      hasDescription: Boolean(input.errorDescription),
    });
    return settingsRedirect("error", "rejected");
  }

  if (!input.state || !input.code) {
    logger.warn("PayPal OAuth callback missing code or state", {
      hasActor: Boolean(input.actor),
    });
    return settingsRedirect("error", "rejected");
  }

  // Consume one-time state first. Actor is bound to state so the PayPal → API
  // redirect can complete even when the browser does not send the session cookie
  // (cross-site ngrok callback). If a session is present, it must match.
  const consumed = await consumePaymentOAuthState("PAYPAL", input.state);
  if (!consumed.ok) {
    logger.warn("PayPal OAuth state invalid", { reason: consumed.reason });
    return settingsRedirect("error", "invalid_state");
  }

  if (input.actor && input.actor.id !== consumed.actorId) {
    logger.warn("PayPal OAuth session actor mismatch", {
      sessionActorId: input.actor.id,
      stateActorId: consumed.actorId,
    });
    return settingsRedirect("error", "invalid_state");
  }

  const stateUser = await findUserById(consumed.actorId);
  if (!stateUser || stateUser.status !== "ACTIVE" || stateUser.role !== "SUPER_ADMIN") {
    logger.warn("PayPal OAuth state actor not eligible", {
      actorId: consumed.actorId,
      role: stateUser?.role,
      status: stateUser?.status,
    });
    return settingsRedirect("error", "auth_required");
  }

  const actor = toAuthUser(stateUser);

  try {
    const redirectUri = requireRedirectUri();
    logger.info("[PayPal OAuth diag] callback entering token exchange", {
      step: "A_oauth2_token",
    });
    const tokens = await exchangePayPalAuthorizationCode(input.code, redirectUri);
    logger.info("[PayPal OAuth diag] callback entering userinfo", {
      step: "B_identity_userinfo",
    });
    const userInfo = await getPayPalUserInfo(tokens.access_token);
    if (!userInfo.userId && !userInfo.email) {
      logger.warn("PayPal userinfo returned no account identifiers", {
        actorId: actor.id,
        step: "B_identity_userinfo",
      });
      return settingsRedirect("error", "exchange");
    }

    const now = new Date();
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const masked = displayAccount(userInfo.email, userInfo.userId);

    await upsertPaymentGatewayConfig({
      provider: "PAYPAL",
      status: "CONNECTED",
      environment: paypalPublicEnvironment(),
      merchantId: userInfo.userId,
      merchantEmail: userInfo.email,
      accountEmailMasked: masked,
      encryptedAccessToken: encryptSecret(tokens.access_token),
      encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      tokenExpiresAt: expiresAt,
      connectedAt: now,
      disconnectedAt: null,
      lastVerifiedAt: now,
      connectedById: actor.id,
    });

    await recordAudit({
      actorId: actor.id,
      action: "PAYPAL_CONNECTED",
      entity: "PaymentGatewayConfig",
      entityId: "PAYPAL",
      metadata: {
        mode: "identity",
        architecture: "single_company",
        merchantId: userInfo.userId,
        environment: paypalPublicEnvironment(),
      },
    });

    logger.info("PayPal connected", {
      actorId: actor.id,
      merchantId: userInfo.userId,
      environment: paypalEnvironment(),
    });
    return settingsRedirect("connected");
  } catch (error) {
    const code =
      error instanceof ServiceUnavailableError || error instanceof ValidationError
        ? error.code
        : undefined;
    logger.error("PayPal OAuth callback failed", {
      actorId: actor.id,
      code,
    });
    if (code === "PAYPAL_REDIRECT_URI_MISSING" || code === "PAYPAL_NOT_CONFIGURED") {
      return settingsRedirect("error", "config");
    }
    return settingsRedirect("error", "exchange");
  }
}

export async function testPayPalConnection(actor: AuthUser): Promise<PayPalTestConnectionResult> {
  assertSuperAdmin(actor);
  const environment = paypalEnvironment();
  const config = await findPaymentGatewayConfig("PAYPAL");
  if (config?.status !== "CONNECTED") {
    return {
      connected: false,
      environment,
      message: "PayPal is not connected.",
    };
  }

  try {
    await getPayPalAppAccessToken();

    let encryptedAccessToken = config.encryptedAccessToken;
    let encryptedRefreshToken = config.encryptedRefreshToken;
    let tokenExpiresAt = config.tokenExpiresAt;

    if (config.encryptedRefreshToken) {
      const refreshed = await refreshPayPalAccessToken(decryptSecret(config.encryptedRefreshToken));
      encryptedAccessToken = encryptSecret(refreshed.access_token);
      encryptedRefreshToken = refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : config.encryptedRefreshToken;
      tokenExpiresAt = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : config.tokenExpiresAt;
    } else if (config.encryptedAccessToken) {
      await getPayPalUserInfo(decryptSecret(config.encryptedAccessToken));
    } else {
      return {
        connected: false,
        environment,
        message: "PayPal connection is incomplete. Please reconnect.",
      };
    }

    const verifiedAt = new Date();
    await upsertPaymentGatewayConfig({
      provider: "PAYPAL",
      status: "CONNECTED",
      environment: paypalPublicEnvironment(),
      merchantId: config.merchantId,
      merchantEmail: config.merchantEmail,
      accountEmailMasked: config.accountEmailMasked,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      connectedAt: config.connectedAt,
      disconnectedAt: null,
      lastVerifiedAt: verifiedAt,
      connectedById: config.connectedById,
    });

    return {
      connected: true,
      environment,
      verifiedAt: verifiedAt.toISOString(),
    };
  } catch {
    logger.warn("PayPal test connection failed", { actorId: actor.id, environment });
    return {
      connected: false,
      environment,
      message:
        "PayPal connection failed. Please verify the PayPal application credentials and reconnect if needed.",
    };
  }
}

export async function disconnectPayPal(actor: AuthUser): Promise<PayPalGatewayStatusView> {
  assertSuperAdmin(actor);
  const existing = await findPaymentGatewayConfig("PAYPAL");
  await upsertPaymentGatewayConfig({
    provider: "PAYPAL",
    status: "DISCONNECTED",
    environment: paypalPublicEnvironment(),
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
  clearPayPalAppTokenCache();

  await recordAudit({
    actorId: actor.id,
    action: "PAYPAL_DISCONNECTED",
    entity: "PaymentGatewayConfig",
    entityId: existing?.id ?? "PAYPAL",
    metadata: { previousMerchantId: existing?.merchantId ?? null },
  });

  logger.info("PayPal disconnected", { actorId: actor.id });
  return getPayPalGatewayStatus(actor);
}

export function paypalCustomerReturnUrl(token: string, result: "return" | "cancel"): string {
  const url = new URL(invoiceShareUrl(token));
  url.searchParams.set("paypal", result);
  return url.toString();
}
