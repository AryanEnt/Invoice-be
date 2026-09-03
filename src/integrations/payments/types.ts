export const PaymentProviderName = {
  MANUAL: "MANUAL",
  STRIPE: "STRIPE",
  PAYPAL: "PAYPAL",
} as const;

export type PaymentProviderName =
  (typeof PaymentProviderName)[keyof typeof PaymentProviderName];

export type ProviderPaymentStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export interface CreatePaymentSessionInput {
  invoiceId: string;
  organizationId: string;
  customerId: string;
  amount: string;
  currency: string;
  method?: string;
  notes?: string;
  providerTransactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentSessionResult {
  provider: PaymentProviderName;
  status: ProviderPaymentStatus;
  providerTransactionId: string;
  amount: string;
  currency: string;
}

export interface VerifyPaymentInput {
  providerTransactionId: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  provider: PaymentProviderName;
  status: ProviderPaymentStatus;
  providerTransactionId: string;
}

export interface RefundPaymentInput {
  providerTransactionId: string;
  amount: string;
  currency: string;
  reason?: string;
}

export interface RefundPaymentResult {
  provider: PaymentProviderName;
  status: ProviderPaymentStatus;
  providerTransactionId: string;
}

export interface HandleWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface WebhookResult {
  provider: PaymentProviderName;
  eventId: string;
  processed: boolean;
}

/**
 * Provider contract for future Stripe/PayPal adapters.
 * Domain services must call PaymentService, never a provider SDK.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly implemented: boolean;

  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  handleWebhook(input: HandleWebhookInput): Promise<WebhookResult>;
}

/** @deprecated Use PaymentProvider. Kept so existing imports keep compiling during the rename. */
export type PaymentProviderAdapter = PaymentProvider;
