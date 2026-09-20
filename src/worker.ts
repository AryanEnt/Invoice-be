import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { closeRedis, connectRedis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { closeInvoiceEmailQueue } from "./queues/invoice-email.queue.js";
import {
  recoverPendingInvoiceEmailJobs,
  startInvoiceEmailWorker,
} from "./workers/invoice-email.worker.js";

async function main(): Promise<void> {
  if (!env.REDIS_URL) {
    logger.error("Invoice worker requires REDIS_URL");
    process.exit(1);
  }

  const redisOk = await connectRedis();
  if (!redisOk) {
    logger.warn("Redis ping failed at worker startup; continuing with reconnect");
  }

  const worker = startInvoiceEmailWorker();
  if (!worker) {
    process.exit(1);
  }

  await recoverPendingInvoiceEmailJobs();
  logger.info("Invoice worker started", {
    environment: env.NODE_ENV,
    concurrency: env.WORKER_CONCURRENCY,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("Shutting down invoice worker", { signal });
    try {
      await worker.close();
      await closeInvoiceEmailQueue();
      await closeRedis();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      logger.error("Worker shutdown error", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  logger.error("Worker failed to start", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
