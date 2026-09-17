import fs from "node:fs";
import path from "node:path";
import { env } from "../../../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import { money } from "../../../lib/money.js";
import { paypalApiBaseUrl, paypalCredentialsConfigured } from "./config.js";
import { isPayPalSupportedCurrency, paypalAmountFractionDigits } from "./currencies.js";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let appTokenCache: TokenCache | null = null;

export type PayPalMoney = {
  currency_code: string;
  value: string;
};

export type PayPalLink = {
  href: string;
  rel: string;
  method?: string;
};

export type PayPalCapture = {
  id: string;
  status?: string;
  amount?: PayPalMoney;
  custom_id?: string;
  invoice_id?: string;
  payee?: { merchant_id?: string; email_address?: string };
  supplementary_data?: {
    related_ids?: { order_id?: string };
  };
};

export type PayPalPurchaseUnit = {
  custom_id?: string;
  invoice_id?: string;
  amount?: PayPalMoney;
  payee?: { merchant_id?: string; email_address?: string };
  payments?: {
    captures?: PayPalCapture[];
  };
};

export type PayPalOrder = {
  id: string;
  status?: string;
  purchase_units?: PayPalPurchaseUnit[];
  links?: PayPalLink[];
};

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource_type?: string;
  resource?: Record<string, unknown>;
};

export type PayPalOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export type PayPalUserInfo = {
  userId: string | null;
  email: string | null;
};

function requireAppCredentials(): { clientId: string; clientSecret: string } {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new ServiceUnavailableError(
      "PayPal connection requires attention. Please reconnect the payment gateway.",
      "PAYPAL_NOT_CONFIGURED",
    );
  }
  return { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET };
}

export function formatPayPalAmount(amount: string, currency: string): string {
  const digits = paypalAmountFractionDigits(currency);
  return money(amount).toDecimalPlaces(digits).toFixed(digits);
}

export function assertPayPalCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (!isPayPalSupportedCurrency(code)) {
    throw new ValidationError(
      "PayPal is not available for this invoice currency. Please contact the billing team for another payment method.",
    );
  }
  return code;
}

async function paypalFetch(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${paypalApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}

function clientErrorMessage(
  status: number,
  body: string,
  context?: { orderId?: string; operation?: string },
): string {
  let name = "";
  let message: string | undefined;
  let debugId: string | undefined;
  let details: unknown;
  try {
    const parsed = JSON.parse(body) as {
      name?: string;
      error?: string;
      message?: string;
      debug_id?: string;
      details?: unknown;
    };
    name = parsed.name ?? parsed.error ?? "";
    message = typeof parsed.message === "string" ? parsed.message : undefined;
    debugId = typeof parsed.debug_id === "string" ? parsed.debug_id : undefined;
    details = parsed.details;
  } catch {
    /* ignore */
  }

  const detailIssues = Array.isArray(details)
    ? details
        .map((item) =>
          item && typeof item === "object" && "issue" in item
            ? String((item as { issue?: unknown }).issue ?? "")
            : "",
        )
        .filter(Boolean)
    : [];

  const knownFailure =
    name === "PAYMENT_DENIED" ||
    name === "INSTRUMENT_DECLINED" ||
    name === "ORDER_NOT_APPROVED" ||
    name === "CURRENCY_NOT_SUPPORTED" ||
    name === "VALIDATION_ERROR" ||
    name === "UNPROCESSABLE_ENTITY" ||
    detailIssues.some((issue) =>
      [
        "PAYMENT_DENIED",
        "INSTRUMENT_DECLINED",
        "ORDER_NOT_APPROVED",
        "CURRENCY_NOT_SUPPORTED",
        "VALIDATION_ERROR",
      ].includes(issue),
    );

  if (status === 401 || name === "invalid_client") {
    return "PayPal connection requires attention. Please reconnect the payment gateway.";
  }

  logger.warn("PayPal API request failed", {
    operation: context?.operation,
    orderId: context?.orderId,
    status,
    name: name || undefined,
    message,
    debugId,
    details,
    detailIssues: detailIssues.length > 0 ? detailIssues : undefined,
    knownFailure: knownFailure || undefined,
  });
  return "Payment could not be completed. Please try again.";
}

type PayPalOAuthErrorFields = {
  name?: string;
  message?: string;
  error?: string;
  error_description?: string;
  details?: unknown;
  parseOk: boolean;
};

function parsePayPalOAuthErrorBody(body: string): PayPalOAuthErrorFields {
  try {
    const parsed = JSON.parse(body) as {
      name?: string;
      error?: string;
      message?: string;
      error_description?: string;
      details?: unknown;
    };
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      error_description:
        typeof parsed.error_description === "string" ? parsed.error_description : undefined,
      details: parsed.details,
      parseOk: true,
    };
  } catch {
    return { parseOk: false };
  }
}

/** Temporary: persist sanitized token-exchange failures for local diagnosis (no secrets). */
function writeTokenExchangeDiag(payload: Record<string, unknown>): void {
  try {
    const file = path.join(process.cwd(), ".paypal-token-exchange-diag.json");
    fs.writeFileSync(file, `${JSON.stringify({ ...payload, at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  } catch {
    /* ignore diag write failures */
  }
}

function oauthExchangeErrorMessage(status: number, body: string): string {
  const parsed = parsePayPalOAuthErrorBody(body);
  const errorKey = parsed.error ?? parsed.name ?? "";
  const sanitized = {
    step: "A_oauth2_token",
    endpoint: "/v1/oauth2/token",
    status,
    name: parsed.name ?? null,
    message: parsed.message ?? null,
    error: parsed.error ?? null,
    error_description: parsed.error_description ?? null,
    details: parsed.details ?? null,
    bodyParseOk: parsed.parseOk,
  };
  logger.warn("[PayPal OAuth diag] exchangePayPalAuthorizationCode HTTP error body", sanitized);
  writeTokenExchangeDiag(sanitized);
  if (errorKey === "invalid_client" || status === 401) {
    return "PayPal rejected the application credentials. Check Client ID, Client Secret, and PAYPAL_ENVIRONMENT.";
  }
  if (errorKey === "invalid_grant") {
    return "PayPal authorization code was invalid or expired. Please try connecting again.";
  }
  if (errorKey.includes("redirect") || errorKey === "invalid_request") {
    return "PayPal rejected the connection request. Please verify the PayPal Sandbox application and Return URL configuration.";
  }
  return "PayPal connection failed. Please verify the PayPal application and Return URL configuration.";
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function getPayPalAppAccessToken(): Promise<string> {
  const now = Date.now();
  if (appTokenCache && appTokenCache.expiresAt > now + 30_000) {
    return appTokenCache.accessToken;
  }

  const { clientId, clientSecret } = requireAppCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    appTokenCache = null;
    const body = await readBody(response);
    throw new ServiceUnavailableError(clientErrorMessage(response.status, body), "PAYPAL_AUTH_FAILED");
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new ServiceUnavailableError(
      "PayPal connection requires attention. Please reconnect the payment gateway.",
      "PAYPAL_AUTH_FAILED",
    );
  }

  appTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(30, data.expires_in ?? 300) * 1000,
  };
  return appTokenCache.accessToken;
}

export function clearPayPalAppTokenCache(): void {
  appTokenCache = null;
}

export async function exchangePayPalAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<PayPalOAuthTokenResponse> {
  const tokenUrl = `${paypalApiBaseUrl()}/v1/oauth2/token`;
  const { clientId, clientSecret } = requireAppCredentials();

  // Non-sensitive request shape check only (never log code/secret/Authorization).
  logger.info("[PayPal OAuth diag] exchangePayPalAuthorizationCode request", {
    step: "A_oauth2_token",
    method: "POST",
    url: tokenUrl,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    authScheme: "Basic",
    paypalEnv: env.PAYPAL_ENV,
    clientIdPrefix: clientId.slice(0, 8),
    clientIdLength: clientId.length,
    clientSecretConfigured: Boolean(clientSecret),
    clientSecretLength: clientSecret.length,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const body = await readBody(response);
    throw new ValidationError(oauthExchangeErrorMessage(response.status, body));
  }

  const data = (await response.json()) as PayPalOAuthTokenResponse;
  if (!data.access_token) {
    const sanitized = {
      step: "A_oauth2_token",
      endpoint: "/v1/oauth2/token",
      status: response.status,
      name: "missing_access_token",
      message: "Token response omitted access_token",
      error: null,
      error_description: null,
      details: null,
    };
    logger.warn("[PayPal OAuth diag] exchangePayPalAuthorizationCode missing access_token", sanitized);
    writeTokenExchangeDiag(sanitized);
    throw new ValidationError(
      "PayPal connection failed. Please verify the PayPal application and Return URL configuration.",
    );
  }

  logger.info("[PayPal OAuth diag] exchangePayPalAuthorizationCode OK", {
    step: "A_oauth2_token",
    endpoint: "/v1/oauth2/token",
    status: response.status,
    hasRefreshToken: Boolean(data.refresh_token),
  });
  return data;
}

export async function refreshPayPalAccessToken(refreshToken: string): Promise<PayPalOAuthTokenResponse> {
  const { clientId, clientSecret } = requireAppCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    await readBody(response);
    throw new ServiceUnavailableError(
      "PayPal connection requires attention. Please reconnect the payment gateway.",
      "PAYPAL_AUTH_FAILED",
    );
  }

  const data = (await response.json()) as PayPalOAuthTokenResponse;
  if (!data.access_token) {
    throw new ServiceUnavailableError(
      "PayPal connection requires attention. Please reconnect the payment gateway.",
      "PAYPAL_AUTH_FAILED",
    );
  }
  return data;
}

export async function getPayPalUserInfo(accessToken: string): Promise<PayPalUserInfo> {
  logger.info("[PayPal OAuth diag] step=getPayPalUserInfo START", {
    step: "B_identity_userinfo",
    endpoint: "/v1/identity/oauth2/userinfo",
  });

  const response = await paypalFetch(
    "/v1/identity/oauth2/userinfo?schema=paypalv1.1",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok) {
    const body = await readBody(response);
    const parsed = parsePayPalOAuthErrorBody(body);
    logger.warn("[PayPal OAuth diag] step=getPayPalUserInfo FAILED", {
      step: "B_identity_userinfo",
      endpoint: "/v1/identity/oauth2/userinfo",
      status: response.status,
      name: parsed.name,
      message: parsed.message,
      error: parsed.error,
      error_description: parsed.error_description,
      details: parsed.details,
    });
    throw new ValidationError("PayPal connection requires attention. Please reconnect the payment gateway.");
  }
  const data = (await response.json()) as {
    payer_id?: string;
    user_id?: string;
    emails?: Array<{ value?: string; primary?: boolean }>;
    email?: string;
  };
  const email =
    data.email ??
    data.emails?.find((item) => item.primary)?.value ??
    data.emails?.[0]?.value ??
    null;
  logger.info("[PayPal OAuth diag] step=getPayPalUserInfo OK", {
    step: "B_identity_userinfo",
    endpoint: "/v1/identity/oauth2/userinfo",
    status: response.status,
    hasUserId: Boolean(data.payer_id ?? data.user_id),
    hasEmail: Boolean(email),
  });
  return {
    userId: data.payer_id ?? data.user_id ?? null,
    email,
  };
}

export async function createPayPalOrder(input: {
  amount: string;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  brandName?: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ orderId: string; approveUrl: string }> {
  const currency = assertPayPalCurrency(input.currency);
  const value = formatPayPalAmount(input.amount, currency);
  if (money(value).lte(0)) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const token = await getPayPalAppAccessToken();
  const response = await paypalFetch(
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.invoiceId,
            // PayPal requires invoice_id unique per merchant; reuse of INV-### on retries causes PAYMENT_DENIED.
            invoice_id: `${input.invoiceNumber}-${Date.now()}`.slice(0, 127),
            description: `Invoice ${input.invoiceNumber}`.slice(0, 127),
            amount: { currency_code: currency, value },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: (input.brandName ?? "InvoiceHub").slice(0, 127),
              landing_page: "LOGIN",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      }),
    },
    token,
  );

  if (!response.ok) {
    const body = await readBody(response);
    throw new ServiceUnavailableError(
      clientErrorMessage(response.status, body, { orderId: undefined, operation: "create_order" }),
      "PAYPAL_ORDER_FAILED",
    );
  }

  const order = (await response.json()) as PayPalOrder;
  const approveUrl = order.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
  if (!order.id || !approveUrl) {
    throw new ServiceUnavailableError("Payment could not be completed. Please try again.", "PAYPAL_ORDER_FAILED");
  }
  logger.info("PayPal order create response accepted", {
    orderId: order.id,
    shippingPreference: "NO_SHIPPING",
    landingPage: "LOGIN",
    currency,
    amount: value,
  });
  return { orderId: order.id, approveUrl };
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  const token = await getPayPalAppAccessToken();
  const response = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, token);
  if (!response.ok) {
    const body = await readBody(response);
    throw new ServiceUnavailableError(
      clientErrorMessage(response.status, body, { orderId, operation: "get_order" }),
      "PAYPAL_ORDER_LOOKUP_FAILED",
    );
  }
  return (await response.json()) as PayPalOrder;
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  const token = await getPayPalAppAccessToken();
  const response = await paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    token,
  );

  if (response.ok) {
    return (await response.json()) as PayPalOrder;
  }

  const body = await readBody(response);
  let name = "";
  let debugId: string | undefined;
  let details: unknown;
  let detailIssues: string[] = [];
  try {
    const parsed = JSON.parse(body) as {
      name?: string;
      message?: string;
      debug_id?: string;
      details?: unknown;
    };
    name = parsed.name ?? "";
    debugId = typeof parsed.debug_id === "string" ? parsed.debug_id : undefined;
    details = parsed.details;
    if (Array.isArray(parsed.details)) {
      detailIssues = parsed.details
        .map((item) =>
          item && typeof item === "object" && "issue" in item
            ? String((item as { issue?: unknown }).issue ?? "")
            : "",
        )
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }

  logger.warn("PayPal capture failed", {
    operation: "capture_order",
    orderId,
    status: response.status,
    name: name || undefined,
    debugId,
    details,
    detailIssues: detailIssues.length > 0 ? detailIssues : undefined,
  });

  // Idempotent success path only — do not treat funding declines as already-captured.
  if (response.status === 422 && name === "ORDER_ALREADY_CAPTURED") {
    return getPayPalOrder(orderId);
  }
  if (
    response.status === 422 &&
    name === "UNPROCESSABLE_ENTITY" &&
    detailIssues.includes("ORDER_ALREADY_CAPTURED")
  ) {
    return getPayPalOrder(orderId);
  }

  throw new ServiceUnavailableError(
    clientErrorMessage(response.status, body, { orderId, operation: "capture_order" }),
    "PAYPAL_CAPTURE_FAILED",
  );
}

export function completedCaptureFromOrder(order: PayPalOrder): PayPalCapture | null {
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  return captures.find((capture) => capture.status === "COMPLETED") ?? captures[0] ?? null;
}

export function orderAmountMatches(order: PayPalOrder, amount: string, currency: string): boolean {
  const unit = order.purchase_units?.[0];
  const capture = completedCaptureFromOrder(order);
  const paid = capture?.amount ?? unit?.amount;
  if (!paid?.value || !paid.currency_code) {
    return false;
  }
  if (paid.currency_code.toUpperCase() !== currency.toUpperCase()) {
    return false;
  }
  return formatPayPalAmount(paid.value, currency) === formatPayPalAmount(amount, currency);
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export function isPaypalCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase().endsWith(".paypal.com");
  } catch {
    return false;
  }
}

export async function verifyPayPalWebhookSignature(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): Promise<PayPalWebhookEvent> {
  if (!env.PAYPAL_WEBHOOK_ID) {
    throw new ValidationError("PayPal webhook is not configured.");
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(input.rawBody) as PayPalWebhookEvent;
  } catch {
    throw new ValidationError("Invalid PayPal webhook payload.");
  }

  const transmissionId = headerValue(input.headers, "paypal-transmission-id");
  const transmissionTime = headerValue(input.headers, "paypal-transmission-time");
  const certUrl = headerValue(input.headers, "paypal-cert-url");
  const authAlgo = headerValue(input.headers, "paypal-auth-algo");
  const transmissionSig = headerValue(input.headers, "paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    throw new ValidationError("PayPal webhook signature headers are missing.");
  }
  if (!isPaypalCertUrl(certUrl)) {
    throw new ValidationError("PayPal webhook certificate URL is invalid.");
  }

  const token = await getPayPalAppAccessToken();
  const response = await paypalFetch(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    },
    token,
  );

  if (!response.ok) {
    throw new ValidationError("PayPal webhook verification failed.");
  }

  const result = (await response.json()) as { verification_status?: string };
  if (result.verification_status !== "SUCCESS") {
    throw new ValidationError("PayPal webhook signature is invalid.");
  }

  return event;
}

export function paypalAppConfigured(): boolean {
  return paypalCredentialsConfigured();
}
