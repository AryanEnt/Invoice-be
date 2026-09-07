import { getEmailProvider } from "../integrations/email/provider.js";
import { buildInvoiceEmailPayload } from "../integrations/email/send-invoice-email.js";
import { logger } from "../lib/logger.js";
import { findInvoiceById } from "../repositories/invoice.repository.js";
import { markPaymentReceiptSent } from "../repositories/payment.repository.js";
import { prisma } from "../lib/prisma.js";

export async function sendPaypalPaymentReceipt(
  invoiceId: string,
  paymentId: string,
  details: { amount: string; currency: string; transactionId: string },
): Promise<void> {
  const claimed = await markPaymentReceiptSent(paymentId);
  if (!claimed) {
    return;
  }

  const mailer = getEmailProvider();
  if (!mailer.isConfigured()) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { receiptSentAt: null },
    });
    return;
  }

  const invoice = await findInvoiceById(invoiceId);
  if (!invoice?.customer.email) {
    return;
  }

  try {
    const payload = await buildInvoiceEmailPayload(invoice);
    payload.subject = `Payment received for invoice ${invoice.invoiceNumber}`;
    payload.showPaymentButton = false;
    payload.paymentUrl = undefined;
    payload.paymentReceipt = {
      method: "PayPal",
      amount: details.amount,
      currency: details.currency,
      paidAt: new Date().toISOString().slice(0, 10),
      transactionId: details.transactionId,
    };
    await mailer.sendInvoiceEmail(payload);
  } catch (error) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { receiptSentAt: null },
    });
    logger.warn("PayPal receipt email failed", {
      invoiceId,
      paymentId,
      name: error instanceof Error ? error.name : "Error",
    });
  }
}
