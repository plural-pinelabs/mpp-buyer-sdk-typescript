import { Challenge, Credential, FetchLike, PluralBuyerConfig } from "../types";
import { normalizeHeaders } from "../utils/http";
import {
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
} from "./credential-builder";
import { ApiClient } from "./api-client";

export class FetchInterceptor {
  constructor(
    private config: PluralBuyerConfig,
    private api: ApiClient,
    private fetchImpl: FetchLike,
  ) {}

  /** Send an HTTP request and automatically handle seller MPP 402 challenges. */
  async request(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(url, { ...init, method, headers: normalizeHeaders(init.headers) });
    if (response.status !== 402 || this.config.autoHandlePayment === false) {
      return response;
    }
    const wwwAuth = response.headers.get("WWW-Authenticate");
    if (!wwwAuth?.startsWith("Payment ")) {
      return response;
    }
    return this.handle402(method, url, init, wwwAuth);
  }

  /** Create a one-time MPP token and wrap it in a Payment credential. */
  async createCredentialForChallenge(challenge: Challenge): Promise<Credential> {
    const token = await this.api.createToken({
      customerReference: this.config.customerReference,
      challengeId: challenge.id,
    });
    return buildCredential(challenge, this.config.clientId, token.token, this.config.customerReference);
  }

  private async handle402(method: string, url: string, init: RequestInit, wwwAuth: string): Promise<Response> {
    const challenge = decodeChallenge(wwwAuth);
    await this.config.onChallenge?.(challenge);

    const retryHeaders = normalizeHeaders(init.headers);
    retryHeaders.Authorization = encodeCredentialHeader(await this.createCredentialForChallenge(challenge));

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
