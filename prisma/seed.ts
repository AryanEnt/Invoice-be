import type { UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { logger } from "../src/lib/logger.js";
import { prisma } from "../src/lib/prisma.js";
import { seedRolesAndPermissions } from "../src/repositories/role.repository.js";

const DEV_PASSWORD = "DevPass123!";

const users: Array<{
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}> = [
  { firstName: "Ava", lastName: "Admin", email: "super@outinvoice.local", role: "SUPER_ADMIN" },
  { firstName: "Iris", lastName: "Ops", email: "admin@outinvoice.local", role: "ADMIN" },
  { firstName: "Nina", lastName: "Member", email: "member@outinvoice.local", role: "MEMBER" },
  { firstName: "Omar", lastName: "Member", email: "member2@outinvoice.local", role: "MEMBER" },
];

async function seed(): Promise<void> {
  await seedRolesAndPermissions();
  logger.info("Seeded roles and permissions");

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: { name: "Company Office", isActive: true },
    create: { name: "Company Office", slug: "demo-org" },
  });

  const passwordHash = await hashPassword(DEV_PASSWORD);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: "ACTIVE",
        passwordHash,
        organizationId: user.role === "SUPER_ADMIN" ? null : organization.id,
      },
      create: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: "ACTIVE",
        passwordHash,
        organizationId: user.role === "SUPER_ADMIN" ? null : organization.id,
      },
    });
  }

  const admin = await prisma.user.findUnique({
    where: { email: "admin@outinvoice.local" },
    select: { id: true },
  });

  if (admin) {
    await prisma.user.updateMany({
      where: {
        email: { in: ["member@outinvoice.local", "member2@outinvoice.local"] },
      },
      data: { administratorId: admin.id },
    });
  }

  logger.info("Seeded demo users", {
    password: DEV_PASSWORD,
    emails: users.map((user) => `${user.email} (${user.role})`),
  });
}

seed()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Seed failed";
    logger.error("Prisma seed failed", { message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
