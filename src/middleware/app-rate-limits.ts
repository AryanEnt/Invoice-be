import type { Request } from "express";
import { createAppRateLimiter, getClientIp } from "./rate-limit.js";

/** Soft ceiling for authenticated API abuse / accidental loops. */
export const apiGlobalRateLimit = createAppRateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: "Too many requests. Try again shortly.",
});

export const healthRateLimit = createAppRateLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many health checks.",
});

export const loginIpRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many login attempts from this network. Try again later.",
});

export const loginAccountRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many login attempts. Try again later.",
  keyGenerator: (req: Request) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${getClientIp(req)}:${email || "unknown"}`;
  },
});

/** @deprecated Prefer loginIpRateLimit + loginAccountRateLimit */
export const loginRateLimit = loginAccountRateLimit;

export const authMutationRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many account changes. Try again later.",
});

export const uploadRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many upload requests. Try again later.",
});

export const invoiceMutationRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: "Too many invoice changes. Try again later.",
});

export const invoiceSendRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many invoice emails sent. Try again later.",
  keyGenerator: (req: Request) => {
    const userId = req.authUser?.id ?? "anon";
    return `${getClientIp(req)}:${userId}`;
  },
});

export const invoicePdfRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: "Too many PDF downloads. Try again later.",
  keyGenerator: (req: Request) => {
    const userId = req.authUser?.id ?? "anon";
    return `${getClientIp(req)}:${userId}`;
  },
});

export const reportRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: "Too many report requests. Try again later.",
});

export const dashboardRateLimit = createAppRateLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many dashboard requests. Try again later.",
  keyGenerator: (req: Request) => {
    const userId = req.authUser?.id ?? "anon";
    return `${getClientIp(req)}:${userId}`;
  },
});

export const publicInvoiceRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: "Too many requests for this invoice link. Try again later.",
});

export const publicPaymentStatusRateLimit = createAppRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: "Too many payment status checks. Try again later.",
});
