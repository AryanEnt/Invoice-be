import type { Request, Response } from "express";
import { getHealthStatus } from "../services/health.service.js";
import { success } from "../utils/api-response.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const data = await getHealthStatus();
  res.status(200).json(success(data));
}
