import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
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
