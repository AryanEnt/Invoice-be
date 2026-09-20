export interface HealthData {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface ReadinessData {
  status: "ready" | "not_ready";
  service: string;
  timestamp: string;
  database: "connected" | "disconnected";
  redis: "connected" | "disconnected";
}

export type { AuthUser, PublicUser } from "./auth.js";

export type { ErrorResponse, SuccessResponse } from "../utils/api-response.js";
