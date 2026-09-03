import { NotImplementedError } from "../../../lib/errors.js";
import type {
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

/**
 * PayPal adapter — implementation is deferred.
 * Do not import a PayPal SDK here until PayPal integration is explicitly requested.
 * Do not return fake success, confirmation, or webhook results.
 */
export class PayPalPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.PAYPAL;
  readonly implemented = false;

  async createPaymentSession(_input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    throw this.deferred();
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    throw this.deferred();
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    throw this.deferred();
  }

  async handleWebhook(_input: HandleWebhookInput): Promise<WebhookResult> {
    throw this.deferred();
  }

  private deferred(): NotImplementedError {
    return new NotImplementedError(
      "PayPal integration is not implemented. Implement PayPalPaymentProvider when PayPal is explicitly requested.",
    );
  }
}
