import { checkDatabaseConnection } from "../repositories/health.repository.js";
import type { HealthData } from "../types/api.js";

export async function getHealthStatus(): Promise<HealthData> {
  const databaseUp = await checkDatabaseConnection();

  return {
    status: "ok",
    service: "outinvoice-api",
    timestamp: new Date().toISOString(),
    database: databaseUp ? "connected" : "disconnected",
  };
}
