import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { failure } from "../utils/api-response.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(failure(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    res
      .status(400)
      .json(failure("VALIDATION_ERROR", "Request validation failed", err.flatten()));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json(failure("CONFLICT", "A record with this unique value already exists"));
    return;
  }

  const payloadTooLarge =
    (typeof err === "object" &&
      err !== null &&
      "type" in err &&
      (err as { type?: string }).type === "entity.too.large") ||
    (err instanceof Error && /payload too large|request entity too large/i.test(err.message));

  if (payloadTooLarge) {
    res.status(413).json(failure("PAYLOAD_TOO_LARGE", "Request body is too large"));
    return;
  }

  logger.error("Unhandled server error", {
    requestId: _req.requestId,
    name: err instanceof Error ? err.name : "UnknownError",
    message: err instanceof Error ? err.message : "Unknown error",
    ...(env.NODE_ENV !== "production" && err instanceof Error && err.stack
      ? { stack: err.stack }
      : {}),
  });

  const message =
    env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err instanceof Error
        ? err.message
        : "Unknown error";

  res.status(500).json(failure("INTERNAL_SERVER_ERROR", message));
}
