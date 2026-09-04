import type { PaymentProvider } from "@prisma/client";
import { hashOAuthState } from "../integrations/payments/paypal/oauth-state.js";
import { prisma } from "../lib/prisma.js";

export async function createPaymentOAuthState(data: {
  provider: PaymentProvider;
  state: string;
  actorId: string;
  expiresAt: Date;
}) {
  return prisma.paymentOAuthState.create({
    data: {
      provider: data.provider,
      state: hashOAuthState(data.state),
      actorId: data.actorId,
      expiresAt: data.expiresAt,
    },
  });
}

export async function consumePaymentOAuthState(provider: PaymentProvider, state: string) {
  const stateHash = hashOAuthState(state);
  return prisma.$transaction(async (tx) => {
    const row = await tx.paymentOAuthState.findUnique({
      where: { state: stateHash },
    });
    if (!row || row.provider !== provider) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (row.consumedAt) {
      return { ok: false as const, reason: "reused" as const };
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    await tx.paymentOAuthState.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    await tx.paymentOAuthState.delete({ where: { id: row.id } });
    return { ok: true as const, actorId: row.actorId };
  });
}
