import { ValidationError } from "../../lib/errors.js";
import { PayPalPaymentProvider } from "./providers/paypal.provider.js";
import { ManualPaymentProvider } from "./providers/manual.provider.js";
import { StripePaymentProvider } from "./providers/stripe.provider.js";
import type { PaymentProvider, PaymentProviderName } from "./types.js";

const registry: Record<PaymentProviderName, PaymentProvider> = {
  MANUAL: new ManualPaymentProvider(),
  STRIPE: new StripePaymentProvider(),
  PAYPAL: new PayPalPaymentProvider(),
};

export class PaymentProviderFactory {
  static resolve(name: PaymentProviderName): PaymentProvider {
    const provider = registry[name];
    if (!provider) {
      throw new ValidationError(`Unknown payment provider: ${String(name)}`);
    }
    return provider;
  }
}

export function getPaymentProvider(name: PaymentProviderName): PaymentProvider {
  return PaymentProviderFactory.resolve(name);
}
