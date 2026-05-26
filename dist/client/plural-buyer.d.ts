import { Challenge, Credential, CreateMandateOptions, CreateTokenOptions, FetchLike, GrantTokenClaims, Mandate, PluralBuyerConfig, Token } from "../types";
import { ApiClient } from "./api-client";
import { FetchInterceptor } from "./fetch-interceptor";
export declare class BuyerMethods {
    private api;
    constructor(api: ApiClient);
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options: CreateMandateOptions): Promise<Mandate>;
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId: string): Promise<Mandate>;
    /** Create a one-time payment token through `POST /mpp/v1/token`. */
    createToken(options: CreateTokenOptions): Promise<Token>;
}
export declare class PluralBuyerInstance {
    private interceptor;
    private httpFetch;
    methods: BuyerMethods;
    grantClaims?: GrantTokenClaims;
    constructor(interceptor: FetchInterceptor, httpFetch: FetchLike, methods: BuyerMethods);
    /** Send an HTTP request and automatically handle MPP 402 challenges. */
    request(method: string, url: string, init?: RequestInit): Promise<Response>;
    get(url: string, init?: RequestInit): Promise<Response>;
    post(url: string, init?: RequestInit): Promise<Response>;
    put(url: string, init?: RequestInit): Promise<Response>;
    delete(url: string, init?: RequestInit): Promise<Response>;
    patch(url: string, init?: RequestInit): Promise<Response>;
    /** Fetch-style alias for `request`, matching browser naming. */
    fetch(url: string, method?: string, init?: RequestInit): Promise<Response>;
    /** Send an HTTP request without automatic 402 payment handling. */
    rawRequest(method: string, url: string, init?: RequestInit): Promise<Response>;
    /** Manually create a Payment credential for a decoded seller challenge. */
    createCredential(challenge: Challenge): Promise<Credential>;
    /** Verify the configured Grantex grant token and cache its claims. */
    verifyGrant(): Promise<GrantTokenClaims | undefined>;
    close(): void;
}
export declare class PluralBuyer {
    /** Create a buyer SDK instance from `PluralBuyerConfig`. */
    static create(config: PluralBuyerConfig): PluralBuyerInstance;
    /** Create a buyer SDK instance and immediately verify its Grantex grant token. */
    static createVerified(config: PluralBuyerConfig): Promise<PluralBuyerInstance>;
}
