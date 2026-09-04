import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { logger } from "../lib/logger.js";
import { money, moneyString } from "../lib/money.js";
import { findInvoiceById } from "../repositories/invoice.repository.js";
import {
  completeProviderPayment,
  findPaymentByProviderTransactionId,
  markProviderPaymentStatus,
} from "../repositories/payment.repository.js";
import { findPaymentGatewayConfig } from "../repositories/payment-gateway.repository.js";
import { prisma } from "../lib/prisma.js";

export async function handleStripeWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): Promise<{ received: true }> {
  const provider = PaymentProviderFactory.resolve(PaymentProviderName.STRIPE);
  const parsed = await provider.handleWebhook(input);

  if (!parsed.eventId) {
    return { received: true };
  }

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
    logger.info("Stripe webhook duplicate ignored", { eventId: parsed.eventId });
    return { received: true };
  }

  try {
    await processStripeWebhookEvent(parsed);
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
      data: { processed: true, processedAt: new Date() },
    });
  } catch (error) {
    logger.error("Stripe webhook processing failed", {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
    });
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "STRIPE", eventId: parsed.eventId } },
      data: {
        processed: false,
        error: error instanceof Error ? error.message.slice(0, 500) : "processing_failed",
      },
    });
  }

  return { received: true };
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
    if (parsed.orderId) {
      const payment = await findPaymentByProviderTransactionId("STRIPE", parsed.orderId);
      if (payment && payment.status === "PENDING") {
        await markProviderPaymentStatus(payment.id, "FAILED");
      }
    }
    return;
  }

  if (parsed.status !== "COMPLETED") {
    return;
  }

  const gateway = await findPaymentGatewayConfig("STRIPE");
  if (!gateway || gateway.status !== "CONNECTED" || !gateway.merchantId) {
    logger.warn("Stripe webhook ignored — gateway not connected");
    return;
  }
  if (parsed.merchantId && parsed.merchantId !== gateway.merchantId) {
    logger.warn("Stripe webhook merchant mismatch ignored", {
      expected: gateway.merchantId,
      received: parsed.merchantId,
    });
    return;
  }

  const sessionId = parsed.orderId;
  if (!sessionId) {
    // payment_intent.succeeded without session — try invoice metadata only
    if (!parsed.invoiceId) return;
  }

  let payment = sessionId
    ? await findPaymentByProviderTransactionId("STRIPE", sessionId)
    : null;

  let invoiceId = payment?.invoiceId ?? parsed.invoiceId ?? null;
  if (!invoiceId) {
    logger.warn("Stripe webhook missing invoice association", { sessionId });
    return;
  }

  const invoice = await findInvoiceById(invoiceId);
  if (!invoice) {
    logger.warn("Stripe webhook invoice not found", { invoiceId });
    return;
  }

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

  if (!payment && sessionId) {
    const { createPendingProviderPayment } = await import("../repositories/payment.repository.js");
    payment = await createPendingProviderPayment({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      recordedById: invoice.createdById,
      amount: expectedAmount,
      currency: invoice.currency,
      method: "CARD",
      provider: "STRIPE",
      providerTransactionId: sessionId,
    });
  }

  if (!payment) {
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
    providerTransactionId: payment.providerTransactionId ?? sessionId ?? payment.id,
    captureId: parsed.captureId,
    paidAt: new Date(),
    notes: "Stripe",
  });

  logger.info("Stripe webhook settled payment", {
    invoiceId: invoice.id,
    paymentId: settled.payment.id,
    sessionId,
    alreadyCompleted: settled.alreadyCompleted,
  });
}
