import { isP3PEnvironment } from "../config";
import { CreateTokenOptions, PaymentGateway, PaymentMethod, PluralBuyerConfig } from "../types";

export function validateConfig(config: PluralBuyerConfig): void {
  if (config.paymentGateway !== PaymentGateway.PineLabsOnline) {
    throw new Error("PluralBuyerConfig: paymentGateway must be PaymentGateway.PineLabsOnline");
  }
  if (config.env !== undefined && !isP3PEnvironment(config.env)) {
    throw new Error("PluralBuyerConfig: env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
  }
  if (!isSupportedPaymentMethod(config.selectedPaymentMethod)) {
    throw new Error("PluralBuyerConfig: selectedPaymentMethod must be a supported payment method");
  }
}

export function validateCreateTokenOptions(options: CreateTokenOptions): void {
  const customerReference = String(options.customerReference ?? options.customerId ?? "").trim();
  if (!customerReference) {
    throw new Error("CreateTokenOptions: customerReference or customerId is required");
  }
  const mobileNumber = String(options.mobileNumber ?? "").trim();
  if (!mobileNumber) {
    throw new Error("CreateTokenOptions: mobileNumber is required");
  }
  if (!String(options.challengeId ?? "").trim()) {
    throw new Error("CreateTokenOptions: challengeId is required");
  }
  const paymentValue = options.paymentAmount?.value ?? options.usageLimits?.maxAmount;
  const paymentCurrency = options.paymentAmount?.currency ?? options.usageLimits?.currency;
  if (!Number.isInteger(paymentValue) || Number(paymentValue) <= 0) {
    throw new Error("CreateTokenOptions: paymentAmount.value must be a positive integer");
  }
  if (!paymentCurrency) {
    throw new Error("CreateTokenOptions: paymentAmount.currency is required");
  }
  if (options.paymentMethod !== undefined && !isSupportedPaymentMethod(options.paymentMethod)) {
    throw new Error("CreateTokenOptions: paymentMethod must be a supported payment method");
  }
}

export function isSupportedPaymentMethod(value: unknown): value is PaymentMethod {
  return value === PaymentMethod.UpiSbmd || value === PaymentMethod.Crypto;
}
