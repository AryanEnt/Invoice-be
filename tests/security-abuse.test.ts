import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { generateInvoiceShareToken } from "../src/lib/invoice-share.js";
import { createAppRateLimiter, getClientIp } from "../src/middleware/rate-limit.js";
import { assertLogoUploadMeta } from "../src/integrations/storage/r2.service.js";
import { ValidationError } from "../src/lib/errors.js";

describe("abuse / DoS helpers", () => {
  it("prefers Cloudflare CF-Connecting-IP for rate-limit identity", () => {
    const req = {
      headers: { "cf-connecting-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.1" },
      ip: "10.0.0.1",
      socket: { remoteAddress: "10.0.0.1" },
      app: { get: () => 1 },
    } as never;
    expect(getClientIp(req)).toBe("203.0.113.10");
  });

  it("returns 429 with Retry-After when a limiter is exceeded", async () => {
    process.env.FORCE_RATE_LIMIT = "1";
    const limiter = createAppRateLimiter({
      windowMs: 60_000,
      limit: 2,
      message: "Too many test requests.",
    });
    const app = express();
    app.get("/probe", limiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    expect((await request(app).get("/probe")).status).toBe(200);
    expect((await request(app).get("/probe")).status).toBe(200);
    const blocked = await request(app).get("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    delete process.env.FORCE_RATE_LIMIT;
  });

  it("generates unpredictable share tokens", () => {
    const a = generateInvoiceShareToken();
    const b = generateInvoiceShareToken();
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(/^[0-9a-f]+$/i.test(a)).toBe(true);
  });

  it("rejects oversized and invalid upload metadata", () => {
    expect(() =>
      assertLogoUploadMeta({ contentType: "image/png", contentLength: 3 * 1024 * 1024 }),
    ).toThrow(ValidationError);
    expect(() =>
      assertLogoUploadMeta({ contentType: "application/pdf", contentLength: 100 }),
    ).toThrow(ValidationError);
  });
});
