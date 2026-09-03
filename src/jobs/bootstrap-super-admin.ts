import { env } from "../config/env.js";
import { ConflictError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { seedRolesAndPermissions } from "../repositories/role.repository.js";
import { bootstrapSuperAdmin } from "../services/auth.service.js";

async function main(): Promise<void> {
  if (!env.BOOTSTRAP_SUPER_ADMIN_EMAIL || !env.BOOTSTRAP_SUPER_ADMIN_PASSWORD) {
    throw new Error(
      "Set BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD to create the first SUPER_ADMIN.",
    );
  }

  if (env.BOOTSTRAP_SUPER_ADMIN_PASSWORD.length < 8) {
    throw new Error("BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 8 characters.");
  }

  await seedRolesAndPermissions();

  try {
    const user = await bootstrapSuperAdmin({
      email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
      password: env.BOOTSTRAP_SUPER_ADMIN_PASSWORD,
      firstName: env.BOOTSTRAP_SUPER_ADMIN_FIRST_NAME || "Super",
      lastName: env.BOOTSTRAP_SUPER_ADMIN_LAST_NAME || "Admin",
    });

    logger.info("SUPER_ADMIN bootstrap complete", {
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      logger.info("SUPER_ADMIN bootstrap skipped", { reason: error.message });
      return;
    }
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    logger.error("SUPER_ADMIN bootstrap failed", { message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
