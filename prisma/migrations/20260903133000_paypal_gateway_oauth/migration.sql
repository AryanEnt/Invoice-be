-- CreateEnum
CREATE TYPE "PaymentGatewayStatus" AS ENUM ('DISCONNECTED', 'CONNECTED');

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentGatewayStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "environment" TEXT NOT NULL,
    "merchantId" TEXT,
    "merchantEmail" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_configs_provider_key" ON "payment_gateway_configs"("provider");

ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "payment_oauth_states" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "state" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_oauth_states_state_key" ON "payment_oauth_states"("state");
CREATE INDEX "payment_oauth_states_expiresAt_idx" ON "payment_oauth_states"("expiresAt");
