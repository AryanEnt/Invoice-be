import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { failure } from "../utils/api-response.js";

function limiter(limit: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, res) => {
      res.status(429).json(failure("TOO_MANY_REQUESTS", message));
    },
  });
}

export const stripeConnectRateLimit = limiter(
  10,
  15 * 60 * 1000,
  "Too many Stripe connection attempts. Try again later.",
);

export const stripePublicPaymentRateLimit = limiter(
  20,
  15 * 60 * 1000,
  "Too many payment attempts. Try again later.",
);

export const stripeWebhookRateLimit = limiter(
  300,
  60 * 1000,
  "Too many webhook requests.",
);
