-- CreateEnum
CREATE TYPE "InvoiceEmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "invoices"
ADD COLUMN "shareToken" TEXT,
ADD COLUMN "emailStatus" "InvoiceEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN "emailSentAt" TIMESTAMP(3),
ADD COLUMN "emailLastError" TEXT;

-- Backfill previously emailed invoices
UPDATE "invoices"
SET "emailStatus" = 'SENT',
    "emailSentAt" = "sentAt"
WHERE "sentAt" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_shareToken_key" ON "invoices"("shareToken");
