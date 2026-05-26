import { FetchLike, PluralBuyerConfig } from "../types";
export declare class AuthManager {
    private config;
    private baseUrl;
    private fetchImpl;
    private accessToken?;
    private expiresAt;
    private readonly staticAccessToken?;
    constructor(config: PluralBuyerConfig, baseUrl: string, fetchImpl: FetchLike);
    /** Return a valid bearer token, reusing cached/static tokens where possible. */
    getAccessToken(): Promise<string>;
    /** Clear the cached token so the next request exchanges credentials again. */
    invalidate(): void;
    private exchangeToken;
}
