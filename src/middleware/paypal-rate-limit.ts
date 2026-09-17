import { createAppRateLimiter } from "./rate-limit.js";

export const paypalConnectRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many PayPal connection attempts. Try again later.",
});

export const paypalPublicPaymentRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many payment attempts. Try again later.",
});

export const paypalWebhookRateLimit = createAppRateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: "Too many webhook requests.",
});
