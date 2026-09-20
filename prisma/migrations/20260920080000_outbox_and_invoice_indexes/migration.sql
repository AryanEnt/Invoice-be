-- Durable outbox for invoice email/PDF work (PostgreSQL remains source of truth).
CREATE TYPE "OutboxType" AS ENUM ('INVOICE_EMAIL');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'ENQUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "type" "OutboxType" NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");
CREATE INDEX "outbox_events_type_aggregateId_idx" ON "outbox_events"("type", "aggregateId");

-- At most one in-flight invoice email job per invoice.
CREATE UNIQUE INDEX "outbox_events_active_invoice_email_idx"
ON "outbox_events" ("aggregateId")
WHERE "type" = 'INVOICE_EMAIL' AND "status" IN ('PENDING', 'ENQUEUED', 'PROCESSING');

-- Dashboard / list query patterns (additive; does not duplicate existing single-column indexes).
CREATE INDEX "invoices_organizationId_emailStatus_idx" ON "invoices"("organizationId", "emailStatus");
CREATE INDEX "invoices_organizationId_createdById_invoiceDate_idx" ON "invoices"("organizationId", "createdById", "invoiceDate");
CREATE INDEX "invoices_organizationId_assignedMemberId_invoiceDate_idx" ON "invoices"("organizationId", "assignedMemberId", "invoiceDate");
