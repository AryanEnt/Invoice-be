import { NotImplementedError, ServiceUnavailableError, ValidationError } from "../../../lib/errors.js";
import {
  capturePayPalOrder,
  completedCaptureFromOrder,
  createPayPalOrder,
  formatPayPalAmount,
  getPayPalOrder,
  verifyPayPalWebhookSignature,
  type PayPalCapture,
  type PayPalWebhookEvent,
} from "../paypal/client.js";
import { paypalCredentialsConfigured } from "../paypal/config.js";
import type {
  CapturePaymentInput,
  CapturePaymentResult,
  CreatePaymentSessionInput,
  HandleWebhookInput,
  PaymentProvider,
  PaymentSessionResult,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookResult,
} from "../types.js";
import { PaymentProviderName } from "../types.js";

function mapOrderStatus(status: string | undefined): CapturePaymentResult["status"] {
  switch (status) {
    case "COMPLETED":
      return "COMPLETED";
    case "VOIDED":
      return "CANCELLED";
    case "PAYER_ACTION_REQUIRED":
    case "CREATED":
    case "SAVED":
    case "APPROVED":
      return "PENDING";
    default:
      return "FAILED";
  }
}

function captureFromWebhook(event: PayPalWebhookEvent): {
  orderId?: string;
  captureId?: string;
  amount?: string;
  currency?: string;
  invoiceId?: string;
  merchantId?: string;
  status: WebhookResult["status"];
} {
  const resource = (event.resource ?? {}) as PayPalCapture & {
    supplementary_data?: { related_ids?: { order_id?: string } };
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payee?: { merchant_id?: string };
    status?: string;
  };
  const eventType = event.event_type ?? "";
  let status: WebhookResult["status"] = "PENDING";
  if (eventType.includes("COMPLETED") || eventType.includes("CAPTURED")) {
    status = "COMPLETED";
  } else if (eventType.includes("DENIED") || eventType.includes("FAILED")) {
    status = "FAILED";
  } else if (eventType.includes("REFUNDED") || eventType.includes("REVERSED")) {
    status = "REFUNDED";
  }

  return {
    orderId: resource.supplementary_data?.related_ids?.order_id,
    captureId: resource.id,
    amount: resource.amount?.value,
    currency: resource.amount?.currency_code,
    invoiceId: resource.custom_id,
    merchantId: resource.payee?.merchant_id,
    status,
  };
}

export class PayPalPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.PAYPAL;
  readonly implemented = true;

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    if (!paypalCredentialsConfigured()) {
      throw new ServiceUnavailableError(
        "PayPal connection requires attention. Please reconnect the payment gateway.",
        "PAYPAL_NOT_CONFIGURED",
      );
    }
    const returnUrl = typeof input.metadata?.returnUrl === "string" ? input.metadata.returnUrl : "";
    const cancelUrl = typeof input.metadata?.cancelUrl === "string" ? input.metadata.cancelUrl : "";
    const invoiceNumber = typeof input.metadata?.invoiceNumber === "string" ? input.metadata.invoiceNumber : input.invoiceId;
    const brandName = typeof input.metadata?.brandName === "string" ? input.metadata.brandName : undefined;
    if (!returnUrl || !cancelUrl) {
      throw new ValidationError("Payment could not be completed. Please try again.");
    }

    const order = await createPayPalOrder({
      amount: input.amount,
      currency: input.currency,
      invoiceId: input.invoiceId,
      invoiceNumber,
      brandName,
      returnUrl,
      cancelUrl,
    });

    return {
      provider: this.name,
      status: "PENDING",
      providerTransactionId: order.orderId,
      amount: input.amount,
      currency: input.currency,
      checkoutUrl: order.approveUrl,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult> {
    const order = await capturePayPalOrder(input.providerTransactionId);
    const capture = completedCaptureFromOrder(order);
    const status = capture?.status === "COMPLETED" || order.status === "COMPLETED" ? "COMPLETED" : mapOrderStatus(order.status);
    return {
      provider: this.name,
      status,
      providerTransactionId: order.id,
      captureId: capture?.id,
      amount:
        capture?.amount?.value && capture.amount.currency_code
          ? formatPayPalAmount(capture.amount.value, capture.amount.currency_code)
          : undefined,
      currency: capture?.amount?.currency_code,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const order = await getPayPalOrder(input.providerTransactionId);
    return {
      provider: this.name,
      status: mapOrderStatus(order.status),
      providerTransactionId: order.id,
    };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    throw new NotImplementedError("PayPal refunds are handled from PayPal or a later InvoiceHub refund workflow.");
  }

  async handleWebhook(input: HandleWebhookInput): Promise<WebhookResult> {
    const event = await verifyPayPalWebhookSignature(input);
    const parsed = captureFromWebhook(event);
    return {
      provider: this.name,
      eventId: event.id ?? "",
      processed: false,
      eventType: event.event_type,
      orderId: parsed.orderId,
      captureId: parsed.captureId,
      status: parsed.status,
      amount: parsed.amount,
      currency: parsed.currency,
      invoiceId: parsed.invoiceId,
      merchantId: parsed.merchantId,
    };
  }
}
