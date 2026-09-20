import type { Request, Response } from "express";
import { rateLimit, type Options, type RateLimitRequestHandler, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";
import { failure } from "../utils/api-response.js";

let redisStore: Store | undefined;
let redisStoreInitFailed = false;

function getSharedRateLimitStore(): Store | undefined {
  if (env.NODE_ENV === "test" && process.env.FORCE_RATE_LIMIT !== "1") {
    return undefined;
  }
  if (redisStore) {
    return redisStore;
  }
  if (redisStoreInitFailed) {
    return undefined;
  }
  const redis = getRedis();
  if (!redis) {
    return undefined;
  }
  try {
    redisStore = new RedisStore({
      prefix: "outinvoice:ratelimit:",
      sendCommand: async (...args: string[]) => {
        if (redis.status === "wait") {
          await redis.connect();
        }
        const [command, ...rest] = args;
        return redis.call(command, ...rest) as Promise<
          boolean | number | string | (boolean | number | string)[]
        >;
      },
    });
    return redisStore;
  } catch (error) {
    redisStoreInitFailed = true;
    logger.warn("Redis rate-limit store unavailable; using in-memory fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Prefer Cloudflare's client IP when present (set by CF edge, not spoofable by browsers
 * once traffic is proxied through Cloudflare). Fall back to Express `req.ip`, which
 * respects `trust proxy`.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string") {
    const value = cf.split(",")[0]?.trim();
    if (value) {
      return value;
    }
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && !req.app.get("trust proxy")) {
    // Without trust proxy, do not honor client-supplied XFF for rate keys.
    return req.socket.remoteAddress ?? "unknown";
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimitsEnabled(): boolean {
  if (process.env.FORCE_RATE_LIMIT === "1") {
    return true;
  }
  return env.NODE_ENV !== "test";
}

type CreateLimiterInput = {
  windowMs: number;
  limit: number;
  message: string;
  /** Defaults to client IP (CF-aware). */
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
};

export function createAppRateLimiter(input: CreateLimiterInput): RateLimitRequestHandler {
  const windowSeconds = Math.max(1, Math.ceil(input.windowMs / 1000));
  const options: Partial<Options> = {
    windowMs: input.windowMs,
    limit: input.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !rateLimitsEnabled(),
    keyGenerator: input.keyGenerator ?? ((req) => getClientIp(req)),
    // Custom key generators (CF-Connecting-IP / email composites) are intentional.
    validate: { keyGeneratorIpFallback: false },
    skipSuccessfulRequests: input.skipSuccessfulRequests,
    skipFailedRequests: input.skipFailedRequests,
    store: getSharedRateLimitStore(),
    handler: (_req: Request, res: Response) => {
      res.setHeader("Retry-After", String(windowSeconds));
      res
        .status(429)
        .json(failure("TOO_MANY_REQUESTS", input.message));
    },
  };
  return rateLimit(options);
}
