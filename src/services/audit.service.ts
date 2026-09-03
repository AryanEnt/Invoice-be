import { createAuditLog } from "../repositories/audit.repository.js";

export async function recordAudit(data: {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await createAuditLog(data);
}
