import { env } from "./config/env.js";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { closeRedis, connectRedis } from "./lib/redis.js";
import { closeInvoiceEmailQueue } from "./queues/invoice-email.queue.js";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info("API server started", {
    port: env.PORT,
    host: "0.0.0.0",
    environment: env.NODE_ENV,
  });
});

void connectRedis();

const SHUTDOWN_MS = 25_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info("Shutting down API server", { signal });

  const force = setTimeout(() => {
    logger.warn("API shutdown timed out; exiting");
    process.exit(1);
  }, SHUTDOWN_MS);
  force.unref();

  server.close(async () => {
    try {
      await closeInvoiceEmailQueue();
      await closeRedis();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      logger.error("API shutdown error", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
