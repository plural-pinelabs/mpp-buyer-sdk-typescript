/** Fetch-compatible HTTP function used by the SDK. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
/** Prefix used for MPP Payment credentials in HTTP auth headers. */
export declare const PAYMENT_HEADER_PREFIX = "Payment ";
/** Logger interface used by SDK internals for retry/auth/payment diagnostics. */
export interface MppLogger {
    /** Emit verbose diagnostic information. */
    debug(message: string, context?: Record<string, unknown>): void;
    /** Emit informational SDK lifecycle events. */
    info(message: string, context?: Record<string, unknown>): void;
    /** Emit recoverable and terminal SDK errors. */
    error(message: string, context?: Record<string, unknown>): void;
}
/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export interface Amount {
    /** Integer amount in the smallest unit for the currency. */
    value: number;
    /** ISO 4217 currency code, for example `INR`. */
    currency: string;
}
/** Payment request embedded in a seller 402 challenge. */
export interface ChallengeRequest {
    scheme: string;
    amount: string;
    currency: string;
    resource: string;
}
/** Decoded seller challenge from `WWW-Authenticate: Payment <payload>`. */
export interface Challenge {
    id: string;
    realm: string;
    method: string;
    intent: string;
    request: ChallengeRequest;
    expires: string;
}
/** Buyer payment credential payload sent back to the seller. */
export interface CredentialPayload {
    type: "token";
    token: string;
    customer_reference?: string;
}
/** Payment credential sent as `Authorization: Payment <payload>`. */
export interface Credential {
    challenge: Challenge;
    source: string;
    payload: CredentialPayload;
}
/** Settlement amount encoded in a seller `Payment-Receipt` header. */
export interface Settlement {
    amount: string;
    currency: string;
}
/** Decoded `Payment-Receipt` data returned after seller capture succeeds. */
export interface Receipt {
    status: "success" | "failure";
    method: string;
    timestamp: string;
    reference: string;
    challengeId: string;
    settlement: Settlement;
}
/** Optional defaults used when the buyer SDK creates payment tokens automatically. */
export interface TokenDefaults {
    /** Maximum number of captures allowed against an automatically created token. */
    maxCharges?: number;
    /** Token time-to-live in seconds. */
    ttlSeconds?: number;
}
/** JWKS endpoint configuration used to verify Grantex RS256 grant tokens. */
export interface JwksConfig {
    /** JWKS URL or Grantex base URL; base URLs resolve to `/.well-known/jwks.json`. */
    jwksUrl: string;
    /** JWKS cache duration in milliseconds. */
    cacheTtlMs?: number;
}
/** Verified Grantex JWT claims used for buyer-side payment authorization decisions. */
export interface GrantTokenClaims {
    iss: string;
    sub: string;
    agt: string;
    scp: string[];
    grnt: string;
    iat: number;
    exp: number;
    dev?: string;
    nbf?: number;
    parentAgt?: string;
    parentGrnt?: string;
    delegationDepth?: number;
    raw: Record<string, unknown>;
}
/** Parsed representation of a colon-delimited Grantex scope. */
export interface ParsedScope {
    resource: string;
    action: string;
    constraint?: string;
}
/** Payment spend limit extracted from a Grantex scope constraint. */
export interface SpendingLimit {
    maxAmountPaise: number;
    currency: string;
}
/** Result of verifying a Grantex grant token. */
export interface GrantVerificationResult {
    valid: boolean;
    claims?: GrantTokenClaims;
    error?: string;
}
/** Context passed to `onGrantDenied` callbacks. */
export interface GrantDeniedContext {
    grantId: string;
    agentId: string;
    requestedAmount?: number;
    requestedResource?: string;
    scopeViolation?: string;
}
/** Audit event emitted by buyer-side Grantex hooks. */
export interface GrantAuditEvent {
    timestamp: string;
    action: string;
    grantId: string;
    agentId: string;
    userId: string;
    details: Record<string, unknown>;
}
/** Buyer-side Grantex authorization settings. */
export interface GrantexConfig {
    /** Grantex grant JWT presented by the buyer agent. */
    grantToken: string;
    /** JWKS configuration used to verify the grant token. */
    jwks: JwksConfig;
    /** Expected agent id (`agt`) claim. */
    agentId?: string;
    /** Whether to enforce spending limits from MPP payment scopes before retrying. */
    enforceSpendingLimits?: boolean;
    /** Callback invoked when grant verification or scope checks deny a payment. */
    onGrantDenied?: (reason: string, context: GrantDeniedContext) => void | Promise<void>;
    /** Callback invoked for buyer-side Grantex audit events. */
    onAuditEvent?: (event: GrantAuditEvent) => void | Promise<void>;
}
/** Configuration required to construct a buyer SDK instance. */
export interface PluralBuyerConfig {
    /** Pine Labs OAuth client id issued after merchant onboarding. */
    clientId: string;
    /** Pine Labs OAuth client secret issued with the client id. */
    clientSecret: string;
    /** Stable buyer/customer reference used when creating payment tokens. */
    customerReference?: string;
    /** Base host for both auth and MPP APIs, for example `MppEnvironment.SANDBOX`. */
    baseUrl?: string;
    /** Optional auth host override; omit when it is the same as `baseUrl`. */
    authBaseUrl?: string;
    /** Optional MPP host override; omit when it is the same as `baseUrl`. */
    mppBaseUrl?: string;
    /** Whether `buyer.fetch`/`buyer.request` should automatically handle seller 402 challenges. */
    autoHandlePayment?: boolean;
    /** Callback invoked after a seller 402 challenge is decoded and validated. */
    onChallenge?: (challenge: Challenge) => void | Promise<void>;
    /** Callback invoked after the final response includes a valid `Payment-Receipt`. */
    onPaymentComplete?: (receipt: Receipt) => void | Promise<void>;
    /** Defaults applied when the SDK creates a one-time payment token for a 402 retry. */
    tokenDefaults?: TokenDefaults;
    /** Per-request timeout in milliseconds. */
    requestTimeoutMs?: number;
    /** Number of retry attempts for retriable auth and MPP API requests. */
    maxRetries?: number;
    /** Initial retry backoff delay in milliseconds. */
    initialRetryDelayMs?: number;
    /** Optional logger for auth, retry, payment, and Grantex diagnostics. */
    logger?: MppLogger;
    /** Optional Grantex verification and payment authorization settings. */
    grantex?: GrantexConfig;
    /** Pre-resolved bearer token for environments that manage auth outside the SDK. */
    accessToken?: string;
    /** Custom fetch implementation for tests, workers, or non-standard runtimes. */
    fetch?: FetchLike;
}
/** Input for `buyer.methods.createMandate`, mapped to `POST /mpp/v1/pre-authorize`. */
export interface CreateMandateOptions {
    /** Buyer mobile number in 10-digit Indian or E.164 format. */
    mobileNumber: string;
    /** Mandate/pre-authorization amount. */
    amount: Amount;
    /** Stable buyer/customer reference; preferred over `customerId`. */
    customerReference?: string;
    /** Backwards-compatible buyer customer id fallback. */
    customerId?: string;
    /** Human-readable mandate description. */
    description?: string;
    /** Additional metadata sent to the MPP service when supported. */
    metadata?: Record<string, string>;
    /** Optional explicit expiry timestamp retained for compatibility. */
    expiry?: string;
    /** Idempotency key for mandate creation. */
    idempotencyKey?: string;
    /** Payment rail type. Current examples use `SBMD`; other rails are future scope. */
    paymentType?: "SBMD" | "CRYPTO" | string;
    /** Mandate validity period in days. */
    validityInDays?: number;
}
/** Normalized mandate/pre-authorization response returned by the MPP service. */
export interface Mandate {
    mandate_id: string;
    object: string;
    order_id: string;
    order_status: string;
    payment_status: string;
    customer_reference: string;
    customer_id: string;
    agent_id: string;
    amount: Amount;
    amount_blocked: number;
    amount_debited: number;
    amount_held: number;
    amount_available: number;
    mobile_number: string;
    description?: string;
    metadata?: Record<string, unknown>;
    expires_at: string;
    created_at: string;
    challenge?: {
        type: string;
        qr_url: string;
        deep_link: string;
        expires_at: string;
    };
    raw: Record<string, unknown>;
}
/** Legacy token-limit shape kept for backwards-compatible constructors. */
export interface CreateTokenUsageLimits {
    maxAmount: number;
    currency: string;
    expiresAt: string;
    maxCharges?: number;
}
/** Input for `buyer.methods.createToken`, mapped to `POST /mpp/v1/token`. */
export interface CreateTokenOptions {
    /** Legacy usage limit shape retained for compatibility; current token API only requires customer reference. */
    usageLimits?: CreateTokenUsageLimits;
    /** Stable buyer/customer reference used to resolve the active authorization. */
    customerReference?: string;
    /** Backwards-compatible buyer customer id fallback. */
    customerId?: string;
    /** Seller challenge id associated with this token, retained for compatibility. */
    challengeId?: string;
    /** Additional token metadata retained for compatibility. */
    metadata?: Record<string, string>;
    /** Payment rail type. Current examples use `SBMD`; other rails are future scope. */
    paymentType?: "SBMD" | "CRYPTO" | string;
}
/** Normalized one-time MPP payment token response. */
export interface Token {
    token_id: string;
    object: string;
    customer_reference: string;
    customer_id: string;
    mandate_id: string;
    token: string;
    challenge_id?: string;
    hold: {
        amount: number;
        status: string;
        expires_at: string;
    };
    usage_limits: {
        max_amount: number;
        currency: string;
        expires_at: string;
        max_charges?: number;
    };
    usage: {
        amount_used: number;
        charges_made: number;
    };
    metadata?: Record<string, unknown>;
    created_at: string;
    raw: Record<string, unknown>;
}
/** Error type raised for non-2xx MPP service responses. */
export declare class MppError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown> | undefined);
    static fromResponse(status: number, body: unknown): MppError;
    toJSON(): Record<string, unknown>;
}
/** Error type raised when a network request fails before receiving an MPP response. */
export declare class MppNetworkError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/** Error type raised when a seller challenge is missing, expired, or malformed. */
export declare class MppChallengeError extends Error {
    challengeId: string;
    constructor(message: string, challengeId: string);
}
