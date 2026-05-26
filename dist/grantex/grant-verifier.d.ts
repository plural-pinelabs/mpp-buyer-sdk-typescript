import { FetchLike, GrantTokenClaims, GrantVerificationResult, JwksConfig } from "../types";
export declare class GrantVerifier {
    private readonly jwksUrl;
    private readonly cacheTtlMs;
    private readonly fetchImpl;
    private jwks?;
    private cacheExpiresAt;
    constructor(jwks: JwksConfig, fetchImpl?: FetchLike);
    /** Verify signature, time claims, required claims, and optional agent id. */
    verify(grantToken: string, expectedAgentId?: string): Promise<GrantVerificationResult>;
    /** Decode grant claims without verifying the token signature. */
    static decodeClaims(grantToken: string): GrantTokenClaims | undefined;
    private getSigningKey;
    private getJwks;
}
