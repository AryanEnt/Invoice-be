import type { Request, Response } from "express";
import { appPublicUrl } from "../integrations/payments/stripe/config.js";
import { UnauthorizedError } from "../lib/errors.js";
import {
  disconnectStripe,
  getStripeGatewayStatus,
  handleStripeOAuthCallback,
  startStripeConnect,
  testStripeConnection,
} from "../services/stripe-connect.service.js";
import {
  confirmPublicStripeCheckout,
  createPublicStripeCheckout,
} from "../services/stripe-checkout.service.js";
import { handleStripeWebhook } from "../services/stripe-webhook.service.js";
import { success } from "../utils/api-response.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function getStripeGatewayStatusController(req: Request, res: Response): Promise<void> {
  const result = await getStripeGatewayStatus(requireActor(req));
  res.status(200).json(success(result));
}

export async function startStripeConnectController(req: Request, res: Response): Promise<void> {
  const result = await startStripeConnect(requireActor(req));
  res.status(200).json(success(result));
}

/** Optional redirect-style start for GET /api/stripe/oauth/start */
export async function startStripeConnectRedirectController(req: Request, res: Response): Promise<void> {
  const result = await startStripeConnect(requireActor(req));
  res.redirect(302, result.url);
}

export async function stripeOAuthCallbackController(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query;
    const url = await handleStripeOAuthCallback({
      actor: req.authUser ?? null,
      code: typeof query.code === "string" ? query.code : undefined,
      state: typeof query.state === "string" ? query.state : undefined,
      error: typeof query.error === "string" ? query.error : undefined,
      errorDescription:
        typeof query.error_description === "string" ? query.error_description : undefined,
      preferPopupCloser: true,
    });
    res.redirect(302, url);
  } catch {
    const fallback = new URL("/stripe-popup-closer.html", `${appPublicUrl()}/`);
    fallback.searchParams.set("status", "error");
    fallback.searchParams.set("message", "Unable to connect Stripe. Please try again.");
    res.redirect(302, fallback.toString());
  }
}

export async function testStripeConnectionController(req: Request, res: Response): Promise<void> {
  const result = await testStripeConnection(requireActor(req));
  res.status(200).json(success(result));
}

export async function disconnectStripeController(req: Request, res: Response): Promise<void> {
  const result = await disconnectStripe(requireActor(req));
  res.status(200).json(success(result));
}

export async function createPublicStripeCheckoutController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const result = await createPublicStripeCheckout(token);
  res.status(200).json(success(result));
}

export async function confirmPublicStripeCheckoutController(req: Request, res: Response): Promise<void> {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const result = await confirmPublicStripeCheckout(token);
  res.status(200).json(success(result));
}

export async function stripeWebhookController(req: Request, res: Response): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";
  const result = await handleStripeWebhook({
    headers: req.headers,
    rawBody,
  });
  res.status(200).json(result);
}
