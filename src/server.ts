import { env } from "./config/env.js";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info("API server started", {
    port: env.PORT,
    host: "0.0.0.0",
    environment: env.NODE_ENV,
  });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutting down API server", { signal });

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
