import { Challenge, Credential, FetchLike, GrantTokenClaims, PluralBuyerConfig } from "../types";
import { ApiClient } from "./api-client";
export declare class FetchInterceptor {
    private config;
    private api;
    private fetchImpl;
    private totalSpentPaise;
    private verifiedClaims?;
    private grantVerifier?;
    private auditLogger?;
    constructor(config: PluralBuyerConfig, api: ApiClient, fetchImpl: FetchLike);
    /** Verify the configured Grantex token and cache claims for later spend checks. */
    verifyGrant(): Promise<GrantTokenClaims | undefined>;
    /** Send an HTTP request and automatically handle seller MPP 402 challenges. */
    request(method: string, url: string, init?: RequestInit): Promise<Response>;
    /** Create a one-time MPP token and wrap it in a Payment credential. */
    createCredentialForChallenge(challenge: Challenge): Promise<Credential>;
    private handle402;
}
