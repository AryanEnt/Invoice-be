import { randomUUID } from "node:crypto";
import { getRedis } from "./redis.js";
import { logger } from "./logger.js";

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export type LockResult =
  | { acquired: true; token: string }
  | { acquired: false; unavailable: false }
  | { acquired: false; unavailable: true };

export function invoiceSendLockKey(invoiceId: string): string {
  return `outinvoice:lock:invoice-send:${invoiceId}`;
}

export function webhookLockKey(provider: string, eventId: string): string {
  return `outinvoice:lock:webhook:${provider}:${eventId}`;
}

export async function acquireLock(key: string, ttlSeconds: number): Promise<LockResult> {
  const redis = getRedis();
  if (!redis) {
    return { acquired: false, unavailable: true };
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const token = randomUUID();
    const ok = await redis.set(key, token, "EX", ttlSeconds, "NX");
    if (ok === "OK") {
      return { acquired: true, token };
    }
    return { acquired: false, unavailable: false };
  } catch (error) {
    logger.warn("Redis lock acquire failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
    return { acquired: false, unavailable: true };
  }
}

export async function releaseLock(key: string, token: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }
  try {
    await redis.eval(RELEASE_LUA, 1, key, token);
  } catch (error) {
    logger.warn("Redis lock release failed", {
      key,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
