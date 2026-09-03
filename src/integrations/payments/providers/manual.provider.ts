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
import { NotImplementedError } from "../../../lib/errors.js";

/**
 * Local bookkeeping only. Does not call any external payment API.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = PaymentProviderName.MANUAL;
  readonly implemented = true;

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult> {
    return {
      provider: this.name,
      status: "COMPLETED",
      providerTransactionId:
        input.providerTransactionId ?? `manual_${crypto.randomUUID()}`,
      amount: input.amount,
      currency: input.currency,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    return {
      provider: this.name,
      status: "COMPLETED",
      providerTransactionId: input.providerTransactionId,
    };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    throw new NotImplementedError(
      "Manual refunds are not implemented. Record a reversing adjustment when that workflow is added.",
    );
  }

  async handleWebhook(_input: HandleWebhookInput): Promise<WebhookResult> {
    throw new NotImplementedError("Manual payments do not receive provider webhooks.");
  }
}
