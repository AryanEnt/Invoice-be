ALTER TABLE "payment_gateway_configs" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3);
ALTER TABLE "payment_gateway_configs" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "payment_gateway_configs" ADD COLUMN IF NOT EXISTS "accountEmailMasked" TEXT;
