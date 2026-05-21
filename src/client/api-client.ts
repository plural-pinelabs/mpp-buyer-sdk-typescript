import {
  CreateMandateOptions,
  CreateTokenOptions,
  FetchLike,
  Mandate,
  MppError,
  PluralBuyerConfig,
  Token,
} from "../types";
import { requestWithRetry, safeJson } from "../utils/http";
import { asRecord, parseMandate, parseToken } from "../utils/parsers";
import { normalizeMobileNumber, validateCreateMandateOptions } from "../utils/validation";
import { AuthManager } from "./auth-manager";

export class ApiClient {
  constructor(
    private config: PluralBuyerConfig,
    private baseUrl: string,
    private auth: AuthManager,
    private fetchImpl: FetchLike,
  ) {}

  /** Create an MPP mandate/pre-authorization and normalize the service response. */
  async createMandate(options: CreateMandateOptions): Promise<Mandate> {
    validateCreateMandateOptions(options);
    const customerReference = options.customerReference ?? options.customerId ?? normalizeMobileNumber(options.mobileNumber);
    const body: Record<string, unknown> = {
      type: options.paymentType ?? "SBMD",
      customer_reference: customerReference,
      amount: { value: String(options.amount.value), currency: options.amount.currency },
      validity_in_days: options.validityInDays ?? 7,
    };
    if (options.description) {
      body.description = options.description;
    }
    const data = await this.request("POST", "/mpp/v1/pre-authorize", body, {
      "Idempotency-Key": options.idempotencyKey ?? randomId(),
    });
    return parseMandate(data);
  }

  /** Fetch a mandate/pre-authorization by authorization id. */
  async getMandate(mandateId: string): Promise<Mandate> {
    if (!mandateId) {
      throw new Error("mandateId is required");
    }
    const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
    return parseMandate(data);
  }

  /** Create a one-time payment token for an active authorization. */
  async createToken(options: CreateTokenOptions): Promise<Token> {
    if (!options.customerReference && !options.customerId) {
      throw new Error("CreateTokenOptions: customerReference or customerId is required");
    }
    const data = await this.request("POST", "/mpp/v1/token", {
      type: options.paymentType ?? "SBMD",
      customer_reference: options.customerReference ?? options.customerId ?? "",
    });
    return parseToken(data);
  }

  /** Authenticated MPP request wrapper that unwraps `{ data: ... }` envelopes. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    const response = await requestWithRetry(this.fetchImpl, `${stripSlash(this.baseUrl)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    }, this.config);

    if (!response.ok) {
      throw MppError.fromResponse(response.status, await safeJson(response));
    }
    const payload = await response.json();
    const record = asRecord(payload);
    return record && "data" in record ? record.data : payload;
  }
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}
