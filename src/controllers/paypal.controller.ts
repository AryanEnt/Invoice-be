import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { appPublicUrl } from "../integrations/payments/paypal/config.js";
import {
  disconnectPayPal,
  getPayPalGatewayStatus,
  handlePayPalOAuthCallback,
  startPayPalConnect,
  testPayPalConnection,
} from "../services/paypal-connect.service.js";
import { capturePublicPayPalOrder, createPublicPayPalOrder, getPublicPayPalPaymentStatus } from "../services/paypal-checkout.service.js";
import { handlePayPalWebhook } from "../services/paypal-webhook.service.js";
import { success } from "../utils/api-response.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function getPayPalGatewayStatusController(req: Request, res: Response): Promise<void> {
  const result = await getPayPalGatewayStatus(requireActor(req));
  res.status(200).json(success(result));
}

export async function startPayPalConnectController(req: Request, res: Response): Promise<void> {
  const result = await startPayPalConnect(requireActor(req));
  res.status(200).json(success(result));
}

export async function payPalOAuthCallbackController(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query;
    const url = await handlePayPalOAuthCallback({
      actor: req.authUser ?? null,
      code: typeof query.code === "string" ? query.code : undefined,
      state: typeof query.state === "string" ? query.state : undefined,
      error: typeof query.error === "string" ? query.error : undefined,
      errorDescription:
        typeof query.error_description === "string" ? query.error_description : undefined,
    });
    res.redirect(302, url);
  } catch {
    // Always land the popup on the FE closer page so it can postMessage + close.
    const fallback = new URL("/paypal-popup-closer.html", `${appPublicUrl()}/`);
    fallback.searchParams.set("status", "error");
    fallback.searchParams.set(
      "message",
      "PayPal connection failed. Please try connecting again.",
    );
    res.redirect(302, fallback.toString());
  }
}

export async function testPayPalConnectionController(req: Request, res: Response): Promise<void> {
  const result = await testPayPalConnection(requireActor(req));
  res.status(200).json(success(result));
}

export async function disconnectPayPalController(req: Request, res: Response): Promise<void> {
  const result = await disconnectPayPal(requireActor(req));
  res.status(200).json(success(result));
}

export async function createPublicPayPalOrderController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const result = await createPublicPayPalOrder(token);
  res.status(200).json(success(result));
}

export async function capturePublicPayPalOrderController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const orderId =
    typeof req.body?.orderId === "string"
      ? req.body.orderId
      : typeof req.query.token === "string"
        ? req.query.token
        : "";
  if (!orderId.trim()) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }
  const result = await capturePublicPayPalOrder(token, orderId.trim());
  res.status(200).json(success(result));
}

export async function getPublicPayPalPaymentStatusController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const result = await getPublicPayPalPaymentStatus(token);
  res.status(200).json(success(result));
}

export async function payPalWebhookController(req: Request, res: Response): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";
  const result = await handlePayPalWebhook({
    headers: req.headers,
    rawBody,
  });
  res.status(200).json(result);
}
