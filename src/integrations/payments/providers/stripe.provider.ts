import type Stripe from "stripe";
import { NotImplementedError, ServiceUnavailableError, ValidationError } from "../../../lib/errors.js";
import {
  constructStripeWebhookEvent,
  createStripeCheckoutSession,
  retrieveStripeCheckoutSession,
} from "../stripe/client.js";
import { stripeCredentialsConfigured } from "../stripe/config.js";
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

export class StripePaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.STRIPE;
  readonly implemented = true;

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    if (!stripeCredentialsConfigured()) {
      throw new ServiceUnavailableError(
        "Stripe connection requires attention. Please reconnect the payment gateway.",
        "STRIPE_NOT_CONFIGURED",
      );
    }
    const connectedAccountId =
      typeof input.metadata?.connectedAccountId === "string" ? input.metadata.connectedAccountId : "";
    const successUrl = typeof input.metadata?.successUrl === "string" ? input.metadata.successUrl : "";
    const cancelUrl = typeof input.metadata?.cancelUrl === "string" ? input.metadata.cancelUrl : "";
    const invoiceNumber =
      typeof input.metadata?.invoiceNumber === "string" ? input.metadata.invoiceNumber : input.invoiceId;
    const customerEmail =
      typeof input.metadata?.customerEmail === "string" ? input.metadata.customerEmail : null;
    if (!connectedAccountId || !successUrl || !cancelUrl) {
      throw new ValidationError("Payment could not be completed. Please try again.");
    }

    const session = await createStripeCheckoutSession({
      amount: input.amount,
      currency: input.currency,
      invoiceId: input.invoiceId,
      invoiceNumber,
      connectedAccountId,
      customerEmail,
      successUrl,
      cancelUrl,
    });

    return {
      provider: this.name,
      status: "PENDING",
      providerTransactionId: session.sessionId,
      amount: input.amount,
      currency: input.currency,
      checkoutUrl: session.checkoutUrl,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult> {
    const connectedAccountId =
      typeof input.metadata?.connectedAccountId === "string" ? input.metadata.connectedAccountId : "";
    if (!connectedAccountId) {
      throw new ValidationError("Payment could not be completed. Please try again.");
    }
    const session = await retrieveStripeCheckoutSession(input.providerTransactionId, connectedAccountId);
    const paid = session.payment_status === "paid" || session.status === "complete";
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    return {
      provider: this.name,
      status: paid ? "COMPLETED" : "PENDING",
      providerTransactionId: session.id,
      captureId: paymentIntent,
      amount: session.amount_total != null ? String(session.amount_total / 100) : undefined,
      currency: session.currency?.toUpperCase(),
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const captured = await this.capturePayment(input);
    return {
      provider: this.name,
      status: captured.status,
      providerTransactionId: captured.providerTransactionId,
    };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    throw new NotImplementedError("Stripe refunds are handled from Stripe Dashboard or a later InvoiceHub refund workflow.");
  }

  async handleWebhook(input: HandleWebhookInput): Promise<WebhookResult> {
    const signature = headerValue(input.headers, "stripe-signature");
    if (!signature) {
      throw new ValidationError("Stripe webhook signature is missing.");
    }
    let event: Stripe.Event;
    try {
      event = constructStripeWebhookEvent(input.rawBody, signature);
    } catch {
      throw new ValidationError("Stripe webhook signature is invalid.");
    }

    const result: WebhookResult = {
      provider: this.name,
      eventId: event.id,
      processed: true,
      eventType: event.type,
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      result.orderId = session.id;
      result.invoiceId = session.metadata?.invoiceId;
      result.merchantId = typeof event.account === "string" ? event.account : undefined;
      result.status =
        session.payment_status === "paid" || session.status === "complete" ? "COMPLETED" : "PENDING";
      result.captureId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (session.amount_total != null && session.currency) {
        result.amount = (session.amount_total / 100).toFixed(2);
        result.currency = session.currency.toUpperCase();
      }
    } else if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      result.captureId = intent.id;
      result.invoiceId = intent.metadata?.invoiceId;
      result.merchantId = typeof event.account === "string" ? event.account : undefined;
      result.status = "COMPLETED";
      if (intent.amount_received != null && intent.currency) {
        result.amount = (intent.amount_received / 100).toFixed(2);
        result.currency = intent.currency.toUpperCase();
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      result.captureId = intent.id;
      result.invoiceId = intent.metadata?.invoiceId;
      result.status = "FAILED";
    } else {
      result.processed = false;
    }

    return result;
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
