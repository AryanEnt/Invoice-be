import { createAppRateLimiter } from "./rate-limit.js";

export const stripeConnectRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many Stripe connection attempts. Try again later.",
});

export const stripePublicPaymentRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many payment attempts. Try again later.",
});

export const stripeWebhookRateLimit = createAppRateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: "Too many webhook requests.",
});
