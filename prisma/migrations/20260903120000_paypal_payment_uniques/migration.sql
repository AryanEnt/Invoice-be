-- PayPal order idempotency and receipt tracking
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receiptSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_providerTransactionId_key" ON "payments"("provider", "providerTransactionId");
