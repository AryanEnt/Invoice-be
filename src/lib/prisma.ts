import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * One PrismaClient per process.
 *
 * Connection budget (approximate, Railway Postgres):
 * - API replica: connection_limit=5 (set on DATABASE_URL if needed)
 * - Worker process: connection_limit=3
 * - Leave headroom for Prisma migrate / admin / backups
 * - Do not raise pool size blindly; prefer more replicas with small pools
 *
 * Example:
 * DATABASE_URL=postgresql://.../outinvoice?connection_limit=5&pool_timeout=20
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;
