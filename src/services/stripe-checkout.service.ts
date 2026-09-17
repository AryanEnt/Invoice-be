import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { canRecordPayment, deriveInvoiceStatus } from "../lib/invoice-status.js";
import { logger } from "../lib/logger.js";
import { money, moneyString } from "../lib/money.js";
import { findInvoiceByShareToken } from "../repositories/invoice.repository.js";
import {
  cancelPendingProviderPayments,
  completeProviderPayment,
  createPendingProviderPayment,
  findPaymentByProviderTransactionId,
  findPendingProviderPayments,
} from "../repositories/payment.repository.js";
import {
  getConnectedStripeAccountId,
  isGlobalStripeConnected,
  stripeCustomerReturnUrl,
} from "./stripe-connect.service.js";

const SHARE_TOKEN = /^[a-zA-Z0-9_-]{20,128}$/;

function assertPublicInvoiceToken(token: string): string {
  const value = token.trim();
  if (!SHARE_TOKEN.test(value)) {
    throw new ValidationError("Invalid invoice link");
  }
  return value;
}

export async function getPublicStripeOptions(invoice: {
  id: string;
  status: string;
  total: { toString(): string };
  amountPaid: { toString(): string };
  dueDate: Date;
  currency: string;
  customer?: { email?: string | null } | null;
  payments?: Array<{
    status: string;
    provider: string;
    providerTransactionId: string | null;
    paidAt: Date | null;
    amount: { toString(): string };
  }>;
}): Promise<{
  available: boolean;
  message: string | null;
  lastPayment: { transactionId: string; paidAt: string; amount: string } | null;
}> {
  const total = moneyString(invoice.total.toString());
  const amountPaid = moneyString(
    invoice.payments
      ? invoice.payments
          .filter((payment) => payment.status === "COMPLETED")
          .reduce((sum, payment) => sum.plus(payment.amount.toString()), money(0))
      : invoice.amountPaid.toString(),
  );
  const status = deriveInvoiceStatus({
    storedStatus: invoice.status as never,
    total,
    amountPaid,
    dueDate: invoice.dueDate,
  });
  const last = invoice.payments
    ?.filter((payment) => payment.status === "COMPLETED" && payment.provider === "STRIPE")
    .at(-1);
  const lastPayment = last?.providerTransactionId
    ? {
        transactionId: last.providerTransactionId,
        paidAt: last.paidAt?.toISOString() ?? "",
        amount: moneyString(last.amount.toString()),
      }
    : null;

  if (status === "PAID" || money(amountPaid).gte(money(total))) {
    return { available: false, message: null, lastPayment };
  }
  if (!canRecordPayment(status)) {
    return { available: false, message: null, lastPayment };
  }
  if (!(await isGlobalStripeConnected())) {
    return { available: false, message: null, lastPayment };
  }
  return { available: true, message: null, lastPayment };
}

export async function createPublicStripeCheckout(token: string): Promise<{ checkoutUrl: string }> {
  const invoice = await findInvoiceByShareToken(assertPublicInvoiceToken(token));
  if (!invoice || invoice.status === "CANCELLED") {
    throw new NotFoundError("Invoice not found");
  }
  if (!(await isGlobalStripeConnected())) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const connectedAccountId = await getConnectedStripeAccountId();
  if (!connectedAccountId) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const options = await getPublicStripeOptions(invoice);
  if (!options.available) {
    throw new ValidationError(options.message ?? "Payment could not be completed. Please try again.");
  }

  const amountPaid = invoice.payments
    ? invoice.payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum.plus(payment.amount.toString()), money(0))
    : money(invoice.amountPaid.toString());
  const amount = moneyString(money(invoice.total.toString()).minus(amountPaid));
  if (money(amount).lte(0)) {
    throw new ConflictError("This invoice is already paid.");
  }

  const provider = PaymentProviderFactory.resolve(PaymentProviderName.STRIPE);
  const session = await provider.createPaymentSession({
    invoiceId: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    amount,
    currency: invoice.currency,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      connectedAccountId,
      customerEmail: invoice.customer?.email ?? null,
      successUrl: stripeCustomerReturnUrl(token, "success"),
      cancelUrl: stripeCustomerReturnUrl(token, "cancel"),
    },
  });

  if (!session.checkoutUrl) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  await cancelPendingProviderPayments({
    invoiceId: invoice.id,
    provider: "STRIPE",
    exceptTransactionId: session.providerTransactionId,
  });

  const existing = await findPaymentByProviderTransactionId("STRIPE", session.providerTransactionId);
  if (!existing) {
    await createPendingProviderPayment({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      recordedById: invoice.createdById,
      amount,
      currency: invoice.currency,
      method: "CARD",
      provider: "STRIPE",
      providerTransactionId: session.providerTransactionId,
    });
  }

  logger.info("Stripe checkout session created", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    sessionId: session.providerTransactionId,
  });

  return { checkoutUrl: session.checkoutUrl };
}

export async function confirmPublicStripeCheckout(token: string): Promise<{
  paid: boolean;
  invoiceNumber: string;
  amount: string;
  currency: string;
  transactionId: string | null;
}> {
  const invoice = await findInvoiceByShareToken(assertPublicInvoiceToken(token));
  if (!invoice || invoice.status === "CANCELLED") {
    throw new NotFoundError("Invoice not found");
  }

  const amountPaid = invoice.payments
    ? invoice.payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum.plus(payment.amount.toString()), money(0))
    : money(invoice.amountPaid.toString());
  if (money(amountPaid).gte(money(invoice.total.toString()))) {
    const last = invoice.payments
      ?.filter((payment) => payment.status === "COMPLETED" && payment.provider === "STRIPE")
      .at(-1);
    return {
      paid: true,
      invoiceNumber: invoice.invoiceNumber,
      amount: moneyString(invoice.total.toString()),
      currency: invoice.currency,
      transactionId: last?.providerTransactionId ?? null,
    };
  }

  const connectedAccountId = await getConnectedStripeAccountId();
  if (!connectedAccountId) {
    return {
      paid: false,
      invoiceNumber: invoice.invoiceNumber,
      amount: moneyString(invoice.total.toString()),
      currency: invoice.currency,
      transactionId: null,
    };
  }

  const pending = await findPendingProviderPayments(invoice.id, "STRIPE");
  const provider = PaymentProviderFactory.resolve(PaymentProviderName.STRIPE);

  for (const payment of pending) {
    if (!payment.providerTransactionId) continue;
    try {
      const captured = await provider.capturePayment({
        providerTransactionId: payment.providerTransactionId,
        metadata: { connectedAccountId },
      });
      if (captured.status !== "COMPLETED") {
        continue;
      }
      const expectedAmount = moneyString(payment.amount.toString());
      const settled = await completeProviderPayment({
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        recordedById: invoice.createdById,
        amount: expectedAmount,
        currency: invoice.currency,
        method: "CARD",
        provider: "STRIPE",
        providerTransactionId: payment.providerTransactionId,
        captureId: captured.captureId,
        paidAt: new Date(),
        notes: "Stripe",
      });
      logger.info("Stripe checkout confirmed from return URL", {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentId: settled.payment.id,
        sessionId: payment.providerTransactionId,
        alreadyCompleted: settled.alreadyCompleted,
      });
      return {
        paid: settled.status === "PAID",
        invoiceNumber: invoice.invoiceNumber,
        amount: expectedAmount,
        currency: invoice.currency,
        transactionId: captured.captureId ?? payment.providerTransactionId,
      };
    } catch (error) {
      logger.warn("Stripe return confirmation skipped a pending session", {
        invoiceId: invoice.id,
        sessionId: payment.providerTransactionId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    paid: false,
    invoiceNumber: invoice.invoiceNumber,
    amount: moneyString(invoice.total.toString()),
    currency: invoice.currency,
    transactionId: null,
  };
}
