export interface HealthData {
  status: "ok";
  service: string;
  timestamp: string;
  database: "connected" | "disconnected";
}

export type { AuthUser, PublicUser } from "./auth.js";

export type { ErrorResponse, SuccessResponse } from "../utils/api-response.js";
