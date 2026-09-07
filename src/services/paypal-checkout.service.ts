import { PaymentProviderFactory } from "../integrations/payments/provider-factory.js";
import { PaymentProviderName } from "../integrations/payments/types.js";
import { formatPayPalAmount, getPayPalOrder, orderAmountMatches } from "../integrations/payments/paypal/client.js";
import { isPayPalSupportedCurrency, PAYPAL_UNSUPPORTED_CURRENCY_MESSAGE } from "../integrations/payments/paypal/currencies.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { canRecordPayment, deriveInvoiceStatus } from "../lib/invoice-status.js";
import { logger } from "../lib/logger.js";
import { money, moneyString } from "../lib/money.js";
import { findInvoiceByShareToken } from "../repositories/invoice.repository.js";
import {
  completeProviderPayment,
  createPendingProviderPayment,
  findPaymentByProviderTransactionId,
  markProviderPaymentStatus,
} from "../repositories/payment.repository.js";
import { isGlobalPayPalConnected, paypalCustomerReturnUrl } from "./paypal-connect.service.js";
import { sendPaypalPaymentReceipt } from "./paypal-receipt.service.js";
import { getEffectiveBrandingForInvoice } from "./branding.service.js";

const SHARE_TOKEN = /^[a-zA-Z0-9_-]{20,128}$/;

export function assertPublicInvoiceToken(token: string): string {
  const value = token.trim();
  if (!SHARE_TOKEN.test(value)) {
    throw new ValidationError("Invalid invoice link");
  }
  return value;
}

export async function getPublicPayPalOptions(invoice: {
  id: string;
  status: string;
  total: { toString(): string };
  amountPaid: { toString(): string };
  dueDate: Date;
  currency: string;
  payments?: Array<{ status: string; provider: string; providerTransactionId: string | null; paidAt: Date | null; amount: { toString(): string } }>;
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
    ?.filter((payment) => payment.status === "COMPLETED" && payment.provider === "PAYPAL")
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
  if (!(await isGlobalPayPalConnected())) {
    return { available: false, message: null, lastPayment };
  }
  if (!isPayPalSupportedCurrency(invoice.currency)) {
    return { available: false, message: PAYPAL_UNSUPPORTED_CURRENCY_MESSAGE, lastPayment };
  }
  return { available: true, message: null, lastPayment };
}

export async function createPublicPayPalOrder(token: string): Promise<{ checkoutUrl: string }> {
  const invoice = await findInvoiceByShareToken(assertPublicInvoiceToken(token));
  if (!invoice || invoice.status === "CANCELLED") {
    throw new NotFoundError("Invoice not found");
  }
  if (!(await isGlobalPayPalConnected())) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const options = await getPublicPayPalOptions(invoice);
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

  const provider = PaymentProviderFactory.resolve(PaymentProviderName.PAYPAL);
  const branding = await getEffectiveBrandingForInvoice({
    createdById: invoice.createdById,
    assignedMemberId: invoice.assignedMemberId,
    organizationId: invoice.organizationId,
  });
  const brandName = branding.companyName || invoice.organization?.name;
  const session = await provider.createPaymentSession({
    invoiceId: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    amount,
    currency: invoice.currency,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      brandName,
      returnUrl: paypalCustomerReturnUrl(token, "return"),
      cancelUrl: paypalCustomerReturnUrl(token, "cancel"),
    },
  });

  if (!session.checkoutUrl) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  await createPendingProviderPayment({
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    recordedById: invoice.createdById,
    amount,
    currency: invoice.currency,
    method: "OTHER",
    provider: "PAYPAL",
    providerTransactionId: session.providerTransactionId,
  });

  logger.info("PayPal order created", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    providerOrderId: session.providerTransactionId,
  });

  return { checkoutUrl: session.checkoutUrl };
}

export async function capturePublicPayPalOrder(
  token: string,
  orderId: string,
): Promise<{
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

  const pending = await findPaymentByProviderTransactionId("PAYPAL", orderId);
  if (!pending || pending.invoiceId !== invoice.id) {
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const provider = PaymentProviderFactory.resolve(PaymentProviderName.PAYPAL);
  const captured = await provider.capturePayment({ providerTransactionId: orderId });
  const order = await getPayPalOrder(orderId);
  const expectedAmount = moneyString(pending.amount.toString());

  if (captured.status !== "COMPLETED" || !orderAmountMatches(order, expectedAmount, invoice.currency)) {
    await markProviderPaymentStatus(pending.id, "FAILED");
    throw new ValidationError("Payment could not be completed. Please try again.");
  }

  const customId = order.purchase_units?.[0]?.custom_id;
  if (customId && customId !== invoice.id) {
    await markProviderPaymentStatus(pending.id, "FAILED");
    throw new ValidationError("Payment could not be completed. Please try again.");
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
    captureId: captured.captureId,
    paidAt: new Date(),
    notes: "PayPal",
  });

  if (!settled.alreadyCompleted) {
    await sendPaypalPaymentReceipt(invoice.id, settled.payment.id, {
      amount: formatPayPalAmount(expectedAmount, invoice.currency),
      currency: invoice.currency,
      transactionId: captured.captureId ?? orderId,
    });
  }

  logger.info("PayPal order captured", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentId: settled.payment.id,
    providerOrderId: orderId,
    providerTransactionId: captured.captureId,
    alreadyCompleted: settled.alreadyCompleted,
  });

  return {
    paid: settled.status === "PAID",
    invoiceNumber: invoice.invoiceNumber,
    amount: expectedAmount,
    currency: invoice.currency,
    transactionId: captured.captureId ?? orderId,
  };
}

export async function getPublicPayPalPaymentStatus(token: string): Promise<{
  paymentStatus: string;
  invoiceStatus: string;
  transactionId: string | null;
}> {
  const invoice = await findInvoiceByShareToken(assertPublicInvoiceToken(token));
  if (!invoice || invoice.status === "CANCELLED") {
    throw new NotFoundError("Invoice not found");
  }
  const options = await getPublicPayPalOptions(invoice);
  const total = moneyString(invoice.total.toString());
  const amountPaid = moneyString(
    invoice.payments
      ? invoice.payments
          .filter((payment) => payment.status === "COMPLETED")
          .reduce((sum, payment) => sum.plus(payment.amount.toString()), money(0))
      : invoice.amountPaid.toString(),
  );
  const invoiceStatus = deriveInvoiceStatus({
    storedStatus: invoice.status,
    total,
    amountPaid,
    dueDate: invoice.dueDate,
  });
  const pending = invoice.payments?.some(
    (payment) => payment.provider === "PAYPAL" && payment.status === "PENDING",
  );
  const paymentStatus =
    invoiceStatus === "PAID" ? "COMPLETED" : pending ? "PENDING" : "UNPAID";
  return {
    paymentStatus,
    invoiceStatus,
    transactionId: options.lastPayment?.transactionId ?? null,
  };
}

