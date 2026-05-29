import {
  Amount,
  CreateTokenOptions,
  FetchLike,
  P3PError,
  PluralBuyerConfig,
  Token,
} from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, parseToken } from "../utils/parsers";
import { validateCreateTokenOptions } from "../utils/validation";

const CUSTOMER_TOKEN_PATH = "/api/v1/customer/mpp/token";

export class ApiClient {
  constructor(
    private config: PluralBuyerConfig,
    private baseUrl: string,
    private fetchImpl: FetchLike,
  ) {}

  /** Create a one-time payment token for an active authorization. */
  async createToken(options: CreateTokenOptions): Promise<Token> {
    const tokenOptions = {
      ...options,
    };
    validateCreateTokenOptions(tokenOptions);
    const customerReference = tokenOptions.customerReference ?? tokenOptions.customerId ?? "";
    const mobileNumber = tokenOptions.mobileNumber ?? "";
    const paymentAmount = tokenOptions.paymentAmount ?? {
      value: tokenOptions.usageLimits!.maxAmount,
      currency: tokenOptions.usageLimits!.currency,
    };
    const body: Record<string, unknown> = {
      type: tokenOptions.paymentMethod ?? this.config.selectedPaymentMethod,
      customer: customerPayload(customerReference, mobileNumber),
      challenge_id: tokenOptions.challengeId,
      payment_amount: amountPayload(paymentAmount),
    };
    const data = await this.request(
      "POST",
      CUSTOMER_TOKEN_PATH,
      body,
      customerKeyHeader(tokenOptions.customerKey),
    );
    return parseToken(data);
  }

  /** P3P request wrapper that unwraps `{ data: ... }` envelopes. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    baseUrl = this.baseUrl,
  ): Promise<unknown> {
    const response = await requestWithRetry(this.fetchImpl, buildUrl(baseUrl, path), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    }, this.config);

    if (!response.ok) {
      throw P3PError.fromResponse(response.status, await safeJson(response));
    }
    const payload = await response.json();
    const record = asRecord(payload);
    return record && "data" in record ? record.data : payload;
  }
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${stripSlash(baseUrl)}${normalizedPath}`;
}

function customerPayload(_customerReference: string, mobileNumber: string): Record<string, string> {
  return {
    mobile_number: mobileNumber,
  };
}

function amountPayload(amount: Amount): Record<string, unknown> {
  return { value: amount.value, currency: amount.currency };
}

function customerKeyHeader(customerKey: string | undefined): Record<string, string> {
  const value = customerKey?.trim();
  return value ? { "X-Customer-Key": value } : {};
}
