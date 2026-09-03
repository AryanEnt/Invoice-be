import type { Request, Response } from "express";
import { failure } from "../utils/api-response.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    failure("ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`),
  );
}
