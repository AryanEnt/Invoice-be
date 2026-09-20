import { createHash } from "node:crypto";
import { logger } from "./logger.js";
import { getRedis } from "./redis.js";

const DASHBOARD_TTL_SECONDS = 60;

export function dashboardCacheKey(scope: Record<string, unknown>): string {
  const hash = createHash("sha256").update(JSON.stringify(scope)).digest("hex").slice(0, 40);
  return `outinvoice:cache:dashboard:${hash}`;
}

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn("Redis cache read failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setJsonCache(key: string, value: unknown, ttlSeconds = DASHBOARD_TTL_SECONDS): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.warn("Redis cache write failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
