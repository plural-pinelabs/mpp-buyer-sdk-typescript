import { BuyerRuntimeContext, Challenge, Credential, FetchLike, PAYMENT_CREDENTIAL_HEADER, PluralBuyerConfig } from "../types";
import { normalizeHeaders } from "../utils/http";
import {
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
  extractAmountPaise,
  selectPaymentMethod,
} from "./credential-builder";
import { ApiClient } from "./api-client";

export class FetchInterceptor {
  constructor(
    private config: PluralBuyerConfig,
    private api: ApiClient,
    private fetchImpl: FetchLike,
  ) {}

  /** Send an HTTP request and automatically handle seller P3P 402 challenges. */
  async request(method: string, url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    const response = await this.fetchImpl(url, { ...init, method, headers: normalizeHeaders(init.headers) });
    if (response.status !== 402 || this.config.autoHandlePayment === false) {
      return response;
    }
    const wwwAuth = response.headers.get("WWW-Authenticate");
    if (!wwwAuth?.startsWith("Payment ")) {
      return response;
    }
    return this.handle402(method, url, init, wwwAuth, context);
  }

  /** Create a one-time P3P token and wrap it in a Payment credential. */
  async createCredentialForChallenge(challenge: Challenge, context?: BuyerRuntimeContext): Promise<Credential> {
    const paymentMethod = selectPaymentMethod(challenge, this.config.selectedPaymentMethod);
    const customerContext = resolveCustomerContext(context);
    const token = await this.api.createToken({
      customerKey: customerContext.customerKey,
      customerReference: customerContext.customerReference,
      mobileNumber: customerContext.mobileNumber,
      challengeId: challenge.id,
      paymentAmount: { value: extractAmountPaise(challenge), currency: challenge.request.currency },
      paymentMethod,
    });
    return buildCredential(
      challenge,
      customerContext.customerReference,
      token.token,
      paymentMethod,
      customerContext.customerReference,
      customerContext.mobileNumber,
    );
  }

  private async handle402(method: string, url: string, init: RequestInit, wwwAuth: string, context?: BuyerRuntimeContext): Promise<Response> {
    const challenge = decodeChallenge(wwwAuth);
    await this.config.onChallenge?.(challenge);

    const retryHeaders = normalizeHeaders(init.headers);
    retryHeaders[PAYMENT_CREDENTIAL_HEADER] = encodeCredentialHeader(await this.createCredentialForChallenge(challenge, context));

    const retryResponse = await this.fetchImpl(url, { ...init, method, headers: retryHeaders });
    if (retryResponse.ok) {
      const receiptHeader = retryResponse.headers.get("Payment-Receipt");
      if (receiptHeader) {
        try {
          await this.config.onPaymentComplete?.(decodeReceipt(receiptHeader));
        } catch {
          // Receipt callback failures are non-fatal.
        }
      }
    }
    return retryResponse;
  }
}

interface ResolvedBuyerRuntimeContext {
  customerKey: string;
  customerReference: string;
  mobileNumber: string;
}

function resolveCustomerContext(context?: BuyerRuntimeContext): ResolvedBuyerRuntimeContext {
  const customerKey = requiredText(context?.customerKey);
  const customerReference = requiredText(context?.customerReference);
  const mobileNumber = requiredText(context?.mobileNumber);
  if (!customerKey || !customerReference || !mobileNumber) {
    throw new Error("BuyerRuntimeContext: customerKey, customerReference, and mobileNumber are required for automatic payment handling");
  }
  return { customerKey, customerReference, mobileNumber };
}

function requiredText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
