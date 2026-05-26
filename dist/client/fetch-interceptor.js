"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchInterceptor = void 0;
const grantex_1 = require("../grantex");
const http_1 = require("../utils/http");
const credential_builder_1 = require("./credential-builder");
class FetchInterceptor {
    config;
    api;
    fetchImpl;
    totalSpentPaise = 0;
    verifiedClaims;
    grantVerifier;
    auditLogger;
    constructor(config, api, fetchImpl) {
        this.config = config;
        this.api = api;
        this.fetchImpl = fetchImpl;
        if (config.grantex) {
            this.grantVerifier = new grantex_1.GrantVerifier(config.grantex.jwks, fetchImpl);
            this.auditLogger = new grantex_1.GrantAuditLogger(config.grantex);
        }
    }
    /** Verify the configured Grantex token and cache claims for later spend checks. */
    async verifyGrant() {
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
    async request(method, url, init = {}) {
        const response = await this.fetchImpl(url, { ...init, method, headers: (0, http_1.normalizeHeaders)(init.headers) });
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
    async createCredentialForChallenge(challenge) {
        const token = await this.api.createToken({
            customerReference: this.config.customerReference,
            challengeId: challenge.id,
        });
        return (0, credential_builder_1.buildCredential)(challenge, this.config.clientId, token.token, this.config.customerReference);
    }
    async handle402(method, url, init, wwwAuth) {
        const challenge = (0, credential_builder_1.decodeChallenge)(wwwAuth);
        if (this.config.grantex && this.verifiedClaims) {
            const amountPaise = (0, credential_builder_1.extractAmountPaise)(challenge);
            const resource = challenge.request.resource;
            const enforce = this.config.grantex.enforceSpendingLimits !== false;
            const authResult = (0, grantex_1.checkPaymentAuthorization)(this.verifiedClaims, amountPaise, enforce ? this.totalSpentPaise : 0);
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
                await this.auditLogger?.logSpendingLimitChecked(this.verifiedClaims, amountPaise, this.totalSpentPaise, authResult.spendingLimit.maxAmountPaise);
            }
            await this.auditLogger?.logPaymentAuthorized(this.verifiedClaims, amountPaise, resource);
        }
        await this.config.onChallenge?.(challenge);
        const retryHeaders = (0, http_1.normalizeHeaders)(init.headers);
        retryHeaders.Authorization = (0, credential_builder_1.encodeCredentialHeader)(await this.createCredentialForChallenge(challenge));
        if (this.config.grantex?.grantToken) {
            retryHeaders["X-Grantex-Token"] = this.config.grantex.grantToken;
        }
        const retryResponse = await this.fetchImpl(url, { ...init, method, headers: retryHeaders });
        if (retryResponse.ok) {
            if (this.verifiedClaims) {
                this.totalSpentPaise += (0, credential_builder_1.extractAmountPaise)(challenge);
            }
            const receiptHeader = retryResponse.headers.get("Payment-Receipt");
            if (receiptHeader) {
                try {
                    await this.config.onPaymentComplete?.((0, credential_builder_1.decodeReceipt)(receiptHeader));
                }
                catch {
                    // Receipt callback failures are non-fatal.
                }
            }
        }
        return retryResponse;
    }
}
exports.FetchInterceptor = FetchInterceptor;
