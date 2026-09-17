import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Always reuse one client per process (avoids connection exhaustion under reload/hot paths).
globalForPrisma.prisma = prisma;
