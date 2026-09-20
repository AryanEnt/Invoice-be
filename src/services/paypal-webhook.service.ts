import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { formatPayPalAmount, getPayPalOrder, orderAmountMatches } from "../integrations/payments/paypal/client.js";
import { logger } from "../lib/logger.js";
import { moneyString } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import { acquireLock, releaseLock, webhookLockKey } from "../lib/redis-lock.js";
import { findInvoiceById } from "../repositories/invoice.repository.js";
import { findPaymentGatewayConfig } from "../repositories/payment-gateway.repository.js";
import {
  applyProviderRefund,
  completeProviderPayment,
  findPaymentByProviderTransactionId,
  markProviderPaymentStatus,
} from "../repositories/payment.repository.js";
import { sendPaypalPaymentReceipt } from "./paypal-receipt.service.js";

export async function handlePayPalWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): Promise<{ received: true }> {
  const provider = PaymentProviderFactory.resolve(PaymentProviderName.PAYPAL);
  const parsed = await provider.handleWebhook(input);
  if (!parsed.eventId) {
    return { received: true };
  }

  const existing = await prisma.paymentWebhook.findUnique({
    where: { provider_eventId: { provider: "PAYPAL", eventId: parsed.eventId } },
  });

  if (existing?.processed) {
    logger.info("PayPal webhook duplicate ignored", { eventId: parsed.eventId, provider: "PAYPAL" });
    return { received: true };
  }

  const lock = await acquireLock(webhookLockKey("PAYPAL", parsed.eventId), 30);
  if (!lock.acquired && !lock.unavailable) {
    logger.info("PayPal webhook concurrent processing skipped", { eventId: parsed.eventId });
    return { received: true };
  }

  try {
  if (!existing) {
    try {
      await prisma.paymentWebhook.create({
        data: {
          provider: "PAYPAL",
          eventId: parsed.eventId,
          payload: {
            eventType: parsed.eventType ?? null,
            orderId: parsed.orderId ?? null,
            captureId: parsed.captureId ?? null,
          },
          processed: false,
        },
      });
    } catch {
      const raced = await prisma.paymentWebhook.findUnique({
        where: { provider_eventId: { provider: "PAYPAL", eventId: parsed.eventId } },
      });
      if (raced?.processed) {
        return { received: true };
      }
    }
  }

  try {
    await processPayPalWebhookEvent(parsed);
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "PAYPAL", eventId: parsed.eventId } },
      data: { processed: true, processedAt: new Date(), error: null },
    });
  } catch (error) {
    await prisma.paymentWebhook.update({
      where: { provider_eventId: { provider: "PAYPAL", eventId: parsed.eventId } },
      data: {
        processed: false,
        error: error instanceof Error ? error.message.slice(0, 500) : "WebhookError",
      },
    });
    logger.error("PayPal webhook processing failed", {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      name: error instanceof Error ? error.name : "Error",
    });
    throw error;
  }

  return { received: true };
  } finally {
    if (lock.acquired) {
      await releaseLock(webhookLockKey("PAYPAL", parsed.eventId), lock.token);
    }
  }
}

async function processPayPalWebhookEvent(parsed: {
  eventType?: string;
  orderId?: string;
  captureId?: string;
  status?: string;
  amount?: string;
  currency?: string;
  invoiceId?: string;
  merchantId?: string;
}): Promise<void> {
  const eventType = parsed.eventType ?? "";
  const orderId = parsed.orderId;
  if (!orderId) {
    return;
  }

  if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "CHECKOUT.PAYMENT-APPROVAL.REVERSED") {
    const payment = await findPaymentByProviderTransactionId("PAYPAL", orderId);
    if (payment && payment.status === "PENDING") {
      await markProviderPaymentStatus(payment.id, "FAILED");
    }
    return;
  }

  if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
    await applyProviderRefund({ provider: "PAYPAL", providerTransactionId: orderId });
    return;
  }

  if (
    eventType !== "PAYMENT.CAPTURE.COMPLETED" &&
    eventType !== "CHECKOUT.ORDER.COMPLETED" &&
    eventType !== "CHECKOUT.ORDER.APPROVED"
  ) {
    return;
  }

  if (eventType === "CHECKOUT.ORDER.APPROVED") {
    return;
  }

  const payment = await findPaymentByProviderTransactionId("PAYPAL", orderId);
  if (!payment) {
    logger.warn("PayPal webhook for unknown order", { providerOrderId: orderId, eventType });
    return;
  }

  if (parsed.invoiceId && parsed.invoiceId !== payment.invoiceId) {
    logger.warn("PayPal webhook invoice mismatch ignored", {
      invoiceId: payment.invoiceId,
      providerOrderId: orderId,
    });
    return;
  }

  const gateway = await findPaymentGatewayConfig("PAYPAL");
  if (parsed.merchantId && gateway?.merchantId && parsed.merchantId !== gateway.merchantId) {
    logger.warn("PayPal webhook merchant mismatch ignored", { providerOrderId: orderId });
    return;
  }

  const invoice = await findInvoiceById(payment.invoiceId);
  if (!invoice) {
    return;
  }

  const order = await getPayPalOrder(orderId);
  const expectedAmount = moneyString(payment.amount.toString());
  if (!orderAmountMatches(order, expectedAmount, invoice.currency)) {
    logger.warn("PayPal webhook amount mismatch", {
      invoiceId: invoice.id,
      providerOrderId: orderId,
    });
    return;
  }

  const customId = order.purchase_units?.[0]?.custom_id;
  if (customId && customId !== invoice.id) {
    return;
  }

  const settled = await completeProviderPayment({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    recordedById: invoice.createdById,
    amount: expectedAmount,
    currency: invoice.currency,
    method: "OTHER",
    provider: "PAYPAL",
    providerTransactionId: orderId,
    captureId: parsed.captureId,
    paidAt: new Date(),
    notes: "PayPal",
  });

  await sendPaypalPaymentReceipt(invoice.id, settled.payment.id, {
    amount: formatPayPalAmount(expectedAmount, invoice.currency),
    currency: invoice.currency,
    transactionId: parsed.captureId ?? orderId,
  });

  logger.info("PayPal webhook settled payment", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentId: settled.payment.id,
    eventType,
    providerOrderId: orderId,
    alreadyCompleted: settled.alreadyCompleted,
  });
}
