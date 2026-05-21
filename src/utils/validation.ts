import { CreateMandateOptions, PluralBuyerConfig } from "../types";

export function validateConfig(config: PluralBuyerConfig): void {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PluralBuyerConfig: clientId and clientSecret are required");
  }
}

export function validateCreateMandateOptions(options: CreateMandateOptions): void {
  const normalized = normalizeMobileNumber(options.mobileNumber);
  if (!options.mobileNumber || !/^\d{10}$/.test(normalized)) {
    throw new Error("CreateMandateOptions: mobileNumber must be 10 digits or E.164 format");
  }
  if (!Number.isInteger(options.amount?.value) || options.amount.value < 100) {
    throw new Error("CreateMandateOptions: amount.value must be at least 100 paise");
  }
  if (options.amount.currency !== "INR") {
    throw new Error("CreateMandateOptions: only INR currency is supported");
  }
}

export function normalizeMobileNumber(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
