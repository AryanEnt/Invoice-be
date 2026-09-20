import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { ServiceUnavailableError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { money, moneyString } from "../lib/money.js";
import { findInvoiceById } from "../repositories/invoice.repository.js";
import {
  completeProviderPayment,
  createPendingProviderPayment,
  findPaymentByProviderTransactionId,
  findPendingProviderPayments,
  markProviderPaymentStatus,
} from "../repositories/payment.repository.js";
import { findPaymentGatewayConfig } from "../repositories/payment-gateway.repository.js";
import { prisma } from "../lib/prisma.js";
import { acquireLock, releaseLock, webhookLockKey } from "../lib/redis-lock.js";

export async function handleStripeWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): Promise<{ received: true }> {
  const provider = PaymentProviderFactory.resolve(PaymentProviderName.STRIPE);
  const parsed = await provider.handleWebhook(input);

  if (!parsed.eventId) {
    return { received: true };
  }

  const existing = await prisma.paymentWebhook.findUnique({
    where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
  });

  if (existing?.processed) {
    logger.info("Stripe webhook duplicate ignored", { eventId: parsed.eventId, provider: "STRIPE" });
    return { received: true };
  }

  const lock = await acquireLock(webhookLockKey("STRIPE", parsed.eventId), 30);
  if (!lock.acquired && !lock.unavailable) {
    logger.info("Stripe webhook concurrent processing skipped", { eventId: parsed.eventId });
    return { received: true };
  }

  try {
  if (!existing) {
    try {
      await prisma.paymentWebhook.create({
        data: {
          provider: "STRIPE",
          eventId: parsed.eventId,
          payload: { eventType: parsed.eventType, orderId: parsed.orderId, invoiceId: parsed.invoiceId },
          processed: false,
        },
      });
    } catch {
      const raced = await prisma.paymentWebhook.findUnique({
        where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
      });
      if (raced?.processed) {
        return { received: true };
      }
    }
  }

  try {
    await processStripeWebhookEvent(parsed);
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
      data: { processed: true, processedAt: new Date(), error: null },
    });
  } catch (error) {
    logger.error("Stripe webhook processing failed", {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      invoiceId: parsed.invoiceId,
      sessionId: parsed.orderId,
      message: error instanceof Error ? error.message : "processing_failed",
    });
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
      data: {
        processed: false,
        error: error instanceof Error ? error.message.slice(0, 500) : "processing_failed",
      },
    });
    throw error;
  }

  return { received: true };
  } finally {
    if (lock.acquired) {
      await releaseLock(webhookLockKey("STRIPE", parsed.eventId), lock.token);
    }
  }
}

async function processStripeWebhookEvent(parsed: {
  eventType?: string;
  orderId?: string;
  captureId?: string;
  status?: string;
  amount?: string;
  currency?: string;
  invoiceId?: string;
  merchantId?: string;
}): Promise<void> {
  if (parsed.status === "FAILED") {
    const payment =
      (parsed.orderId
        ? await findPaymentByProviderTransactionId("STRIPE", parsed.orderId)
        : null) ??
      (parsed.invoiceId
        ? (await findPendingProviderPayments(parsed.invoiceId, "STRIPE"))[0]
        : null);
    if (payment && payment.status === "PENDING") {
      await markProviderPaymentStatus(payment.id, "FAILED");
    }
    return;
  }

  if (parsed.status !== "COMPLETED") {
    return;
  }

  const gateway = await findPaymentGatewayConfig("STRIPE");
  if (!gateway || gateway.status !== "CONNECTED" || !gateway.merchantId) {
    throw new ServiceUnavailableError("Stripe gateway is not connected", "STRIPE_NOT_CONNECTED");
  }
  if (parsed.merchantId && parsed.merchantId !== gateway.merchantId) {
    logger.warn("Stripe webhook merchant mismatch ignored", {
      expected: gateway.merchantId,
      received: parsed.merchantId,
    });
    return;
  }

  const sessionId = parsed.orderId;
  let payment = sessionId
    ? await findPaymentByProviderTransactionId("STRIPE", sessionId)
    : null;

  if (!payment && parsed.invoiceId) {
    const pending = await findPendingProviderPayments(parsed.invoiceId, "STRIPE");
    payment = pending[0] ?? null;
  }

  const invoiceId = payment?.invoiceId ?? parsed.invoiceId ?? null;
  if (!invoiceId) {
    logger.warn("Stripe webhook missing invoice association", { sessionId, eventType: parsed.eventType });
    return;
  }

  const invoice = await findInvoiceById(invoiceId);
  if (!invoice) {
    logger.warn("Stripe webhook invoice not found", { invoiceId });
    return;
  }

  logger.info("Stripe webhook settling invoice", {
    eventType: parsed.eventType,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    previousStatus: invoice.status,
    sessionId,
    paymentIntentId: parsed.captureId,
  });

  if (parsed.invoiceId && parsed.invoiceId !== invoice.id) {
    logger.warn("Stripe webhook invoice mismatch ignored", {
      expected: invoice.id,
      received: parsed.invoiceId,
    });
    return;
  }

  const expectedAmount = payment
    ? moneyString(payment.amount.toString())
    : (() => {
        const paid = invoice.payments
          ? invoice.payments
              .filter((p) => p.status === "COMPLETED")
              .reduce((sum, p) => sum.plus(p.amount.toString()), money(0))
          : money(invoice.amountPaid.toString());
        return moneyString(money(invoice.total.toString()).minus(paid));
      })();

  if (parsed.amount && money(parsed.amount).minus(expectedAmount).abs().gt(0.05)) {
    logger.warn("Stripe webhook amount mismatch", {
      expected: expectedAmount,
      received: parsed.amount,
      invoiceId: invoice.id,
    });
    return;
  }

  if (parsed.currency && parsed.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
    logger.warn("Stripe webhook currency mismatch", {
      expected: invoice.currency,
      received: parsed.currency,
    });
    return;
  }

  const providerTransactionId = payment?.providerTransactionId ?? sessionId;
  if (!payment && providerTransactionId) {
    payment = await createPendingProviderPayment({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      recordedById: invoice.createdById,
      amount: expectedAmount,
      currency: invoice.currency,
      method: "CARD",
      provider: "STRIPE",
      providerTransactionId,
    });
  }

  if (!payment || !providerTransactionId) {
    return;
  }

  const settled = await completeProviderPayment({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    recordedById: invoice.createdById,
    amount: expectedAmount,
    currency: invoice.currency,
    method: "CARD",
    provider: "STRIPE",
    providerTransactionId,
    captureId: parsed.captureId,
    paidAt: new Date(),
    notes: "Stripe",
  });

  logger.info("Stripe webhook settled payment", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentId: settled.payment.id,
    sessionId: providerTransactionId,
    paymentIntentId: parsed.captureId,
    previousStatus: invoice.status,
    nextStatus: settled.status,
    alreadyCompleted: settled.alreadyCompleted,
  });
}
