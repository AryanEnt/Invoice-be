import { checkDatabaseConnection } from "../repositories/health.repository.js";
import { pingRedis } from "../lib/redis.js";
import type { HealthData, ReadinessData } from "../types/api.js";

export async function getHealthStatus(): Promise<HealthData> {
  return {
    status: "ok",
    service: "outinvoice-api",
    timestamp: new Date().toISOString(),
  };
}

export async function getReadinessStatus(): Promise<ReadinessData> {
  const [databaseUp, redisUp] = await Promise.all([
    checkDatabaseConnection(),
    pingRedis(),
  ]);
  const ready = databaseUp;

  return {
    status: ready ? "ready" : "not_ready",
    service: "outinvoice-api",
    timestamp: new Date().toISOString(),
    database: databaseUp ? "connected" : "disconnected",
    redis: redisUp ? "connected" : "disconnected",
  };
}
