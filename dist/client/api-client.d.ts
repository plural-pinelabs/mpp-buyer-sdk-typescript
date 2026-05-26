import { CreateMandateOptions, CreateTokenOptions, FetchLike, Mandate, PluralBuyerConfig, Token } from "../types";
import { AuthManager } from "./auth-manager";
export declare class ApiClient {
    private config;
    private baseUrl;
    private auth;
    private fetchImpl;
    constructor(config: PluralBuyerConfig, baseUrl: string, auth: AuthManager, fetchImpl: FetchLike);
    /** Create an MPP mandate/pre-authorization and normalize the service response. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Fetch a mandate/pre-authorization by authorization id. */
    getMandate(mandateId: string): Promise<Mandate>;
    /** Create a one-time payment token for an active authorization. */
    createToken(options: CreateTokenOptions): Promise<Token>;
    /** Authenticated MPP request wrapper that unwraps `{ data: ... }` envelopes. */
    private request;
}
