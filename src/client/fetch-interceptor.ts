import { Challenge, Credential, FetchLike, GrantTokenClaims, PluralBuyerConfig } from "../types";
import { GrantAuditLogger, GrantVerifier, checkPaymentAuthorization } from "../grantex";
import { normalizeHeaders } from "../utils/http";
import {
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
  extractAmountPaise,
} from "./credential-builder";
import { ApiClient } from "./api-client";

export class FetchInterceptor {
  private totalSpentPaise = 0;
  private verifiedClaims?: GrantTokenClaims;
  private grantVerifier?: GrantVerifier;
  private auditLogger?: GrantAuditLogger;

  constructor(
    private config: PluralBuyerConfig,
    private api: ApiClient,
    private fetchImpl: FetchLike,
  ) {
    if (config.grantex) {
      this.grantVerifier = new GrantVerifier(config.grantex.jwks, fetchImpl);
      this.auditLogger = new GrantAuditLogger(config.grantex);
    }
  }

  /** Verify the configured Grantex token and cache claims for later spend checks. */
  async verifyGrant(): Promise<GrantTokenClaims | undefined> {
    if (!this.config.grantex || !this.grantVerifier) {
      return undefined;
    }
    const result = await this.grantVerifier.verify(this.config.grantex.grantToken, this.config.grantex.agentId);
    if (!result.valid || !result.claims) {
      const reason = result.error ?? "Unknown verification failure";
      if (this.config.grantex.onGrantDenied) {
        await this.config.grantex.onGrantDenied(reason, {
          grantId: "unknown",
          agentId: this.config.grantex.agentId ?? "unknown",
        });
      }
      throw new Error(`Grantex grant verification failed: ${reason}`);
    }
    this.verifiedClaims = result.claims;
    await this.auditLogger?.logGrantVerified(result.claims);
    return result.claims;
  }

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
    if (this.config.grantex && this.verifiedClaims) {
      const amountPaise = extractAmountPaise(challenge);
      const resource = challenge.request.resource;
      const enforce = this.config.grantex.enforceSpendingLimits !== false;
      const authResult = checkPaymentAuthorization(
        this.verifiedClaims,
        amountPaise,
        enforce ? this.totalSpentPaise : 0,
      );
      if (!authResult.authorized) {
        const reason = authResult.reason ?? "Payment not authorized by grant";
        await this.auditLogger?.logPaymentDenied(this.verifiedClaims, amountPaise, resource, reason);
        if (this.config.grantex.onGrantDenied) {
          await this.config.grantex.onGrantDenied(reason, {
            grantId: this.verifiedClaims.grnt,
            agentId: this.verifiedClaims.agt,
            requestedAmount: amountPaise,
            requestedResource: resource,
            scopeViolation: reason,
          });
        }
        throw new Error(`Grantex authorization denied: ${reason}`);
      }
      if (authResult.spendingLimit) {
        await this.auditLogger?.logSpendingLimitChecked(
          this.verifiedClaims,
          amountPaise,
          this.totalSpentPaise,
          authResult.spendingLimit.maxAmountPaise,
        );
      }
      await this.auditLogger?.logPaymentAuthorized(this.verifiedClaims, amountPaise, resource);
    }
    await this.config.onChallenge?.(challenge);

    const retryHeaders = normalizeHeaders(init.headers);
    retryHeaders.Authorization = encodeCredentialHeader(await this.createCredentialForChallenge(challenge));
    if (this.config.grantex?.grantToken) {
      retryHeaders["X-Grantex-Token"] = this.config.grantex.grantToken;
    }

    const retryResponse = await this.fetchImpl(url, { ...init, method, headers: retryHeaders });
    if (retryResponse.ok) {
      if (this.verifiedClaims) {
        this.totalSpentPaise += extractAmountPaise(challenge);
      }
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
