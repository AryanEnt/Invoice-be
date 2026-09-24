import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env, corsOrigins } from "./config/env.js";
import { payPalWebhookController } from "./controllers/paypal.controller.js";
import { stripeWebhookController } from "./controllers/stripe.controller.js";
import { apiGlobalRateLimit } from "./middleware/app-rate-limits.js";
import { csrfOriginCheck } from "./middleware/csrf-origin.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { paypalWebhookRateLimit } from "./middleware/paypal-rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { stripeWebhookRateLimit } from "./middleware/stripe-rate-limit.js";
import { apiRouter } from "./routes/index.js";
import { asyncHandler } from "./utils/async-handler.js";

export function createApp() {
  const app = express();

  // One trusted hop (Railway / reverse proxy). Cloudflare client IP is read via
  // CF-Connecting-IP in rate-limit key generation — do not raise this blindly.
  app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts:
        env.NODE_ENV === "production"
          ? { maxAge: 15552000, includeSubDomains: true, preload: false }
          : false,
      referrerPolicy: { policy: "no-referrer" },
      frameguard: { action: "deny" },
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(cookieParser(env.JWT_SECRET));
  app.post(
    "/api/webhooks/paypal",
    paypalWebhookRateLimit,
    express.raw({ type: "application/json", limit: "1mb" }),
    asyncHandler(payPalWebhookController),
  );
  app.post(
    "/api/webhooks/stripe",
    stripeWebhookRateLimit,
    express.raw({ type: "application/json", limit: "1mb" }),
    asyncHandler(stripeWebhookController),
  );
  app.post(
    "/api/stripe/webhook",
    stripeWebhookRateLimit,
    express.raw({ type: "application/json", limit: "1mb" }),
    asyncHandler(stripeWebhookController),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({
      name: "invoice-be",
      status: "ok",
      uptime: process.uptime(),
      health: "/api/health",
    });
  });

  app.use("/api", apiGlobalRateLimit, csrfOriginCheck, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
