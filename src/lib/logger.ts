import { env } from "../config/env.js";
import { getRequestContext } from "./request-context.js";

type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const context = getRequestContext();
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(context?.organizationId ? { organizationId: context.organizationId } : {}),
    ...(meta !== undefined ? { meta } : {}),
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  if (env.NODE_ENV === "test" && level === "debug") {
    return;
  }

  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};
