import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const globalForRedis = globalThis as unknown as {
  redis?: Redis | null;
};

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  if (globalForRedis.redis) {
    return globalForRedis.redis;
  }

  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectTimeout: 5000,
    commandTimeout: 3000,
    lazyConnect: true,
    retryStrategy(times: number) {
      return Math.min(times * 200, 5000);
    },
  });

  redis.on("error", (error: Error) => {
    logger.warn("Redis unavailable", {
      message: error.message,
    });
  });
  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  globalForRedis.redis = redis;
  return redis;
}

export function createBullmqConnection(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5000,
    lazyConnect: false,
    retryStrategy(times: number) {
      return Math.min(times * 200, 5000);
    },
  });
}

export async function connectRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return false;
  }
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (error) {
    logger.warn("Redis connect failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function pingRedis(): Promise<boolean> {
  return connectRedis();
}

export async function closeRedis(): Promise<void> {
  const redis = globalForRedis.redis;
  if (!redis) {
    return;
  }
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
  globalForRedis.redis = null;
}
