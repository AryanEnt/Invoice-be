import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function createAuditLog(data: {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: data.actorId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      organizationId: data.organizationId ?? null,
      metadata: (data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    },
  });
}
