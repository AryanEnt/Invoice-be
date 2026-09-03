-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_invoiceDate_idx" ON "invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_organizationId_invoiceDate_idx" ON "invoices"("organizationId", "invoiceDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_organizationId_status_idx" ON "invoices"("organizationId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_organizationId_paidAt_idx" ON "payments"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "expenses_organizationId_incurredOn_idx" ON "expenses"("organizationId", "incurredOn");
