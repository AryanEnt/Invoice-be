import type { PaymentGatewayStatus, PaymentProvider } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function findPaymentGatewayConfig(provider: PaymentProvider) {
  return prisma.paymentGatewayConfig.findUnique({
    where: { provider },
  });
}

export async function upsertPaymentGatewayConfig(data: {
  provider: PaymentProvider;
  status: PaymentGatewayStatus;
  environment: string;
  merchantId?: string | null;
  merchantEmail?: string | null;
  accountEmailMasked?: string | null;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  connectedAt?: Date | null;
  disconnectedAt?: Date | null;
  lastVerifiedAt?: Date | null;
  connectedById?: string | null;
}) {
  return prisma.paymentGatewayConfig.upsert({
    where: { provider: data.provider },
    create: {
      provider: data.provider,
      status: data.status,
      environment: data.environment,
      merchantId: data.merchantId ?? null,
      merchantEmail: data.merchantEmail ?? null,
      accountEmailMasked: data.accountEmailMasked ?? null,
      encryptedAccessToken: data.encryptedAccessToken ?? null,
      encryptedRefreshToken: data.encryptedRefreshToken ?? null,
      tokenExpiresAt: data.tokenExpiresAt ?? null,
      connectedAt: data.connectedAt ?? null,
      disconnectedAt: data.disconnectedAt ?? null,
      lastVerifiedAt: data.lastVerifiedAt ?? null,
      connectedById: data.connectedById ?? null,
    },
    update: {
      status: data.status,
      environment: data.environment,
      merchantId: data.merchantId ?? null,
      merchantEmail: data.merchantEmail ?? null,
      accountEmailMasked: data.accountEmailMasked ?? null,
      encryptedAccessToken: data.encryptedAccessToken ?? null,
      encryptedRefreshToken: data.encryptedRefreshToken ?? null,
      tokenExpiresAt: data.tokenExpiresAt ?? null,
      connectedAt: data.connectedAt ?? null,
      disconnectedAt: data.disconnectedAt ?? null,
      lastVerifiedAt: data.lastVerifiedAt ?? null,
      connectedById: data.connectedById ?? null,
    },
  });
}
