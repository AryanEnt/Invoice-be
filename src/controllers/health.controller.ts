import type { Request, Response } from "express";
import { getHealthStatus, getReadinessStatus } from "../services/health.service.js";
import { success } from "../utils/api-response.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const data = await getHealthStatus();
  res.status(200).json(success(data));
}

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  const data = await getReadinessStatus();
  res.status(data.status === "ready" ? 200 : 503).json(success(data));
}
