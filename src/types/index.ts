/** Fetch-compatible function used by the SDK; pass this to run in tests, workers, or custom runtimes. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const PAYMENT_HEADER_PREFIX = "Payment ";

/** Logger interface used by SDK internals for retry/auth/payment diagnostics. */
export interface MppLogger {
  /** Low-volume diagnostic event, usually before a request or decision. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Informational event such as retries, auth refreshes, and successful responses. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Error event for failed auth, network, challenge, or payment operations. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** Money amount expressed in the smallest unit for the currency, e.g. paise for INR. */
export interface Amount {
  /** Amount in the smallest unit for the currency, e.g. paise for INR. */
  value: number;
  /** ISO-style currency code expected by MPP, e.g. `INR` or `PATHUSD`. */
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
  /** Optional legacy maximum charge count retained for constructor compatibility. */
  maxCharges?: number;
  /** Optional legacy token TTL retained for constructor compatibility; not sent to current `/token`. */
  ttlSeconds?: number;
}

/** JWKS endpoint configuration used to verify Grantex RS256 grant tokens. */
export interface JwksConfig {
  /** JWKS endpoint or base Grantex URL. Base URLs are normalized to `/.well-known/jwks.json`. */
  jwksUrl: string;
  /** How long fetched JWKS keys remain cached in memory. Defaults to one hour. */
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
  /** RS256 grant token delegated to this buyer agent. */
  grantToken: string;
  /** JWKS settings used to verify the grant token signature. */
  jwks: JwksConfig;
  /** Expected Grantex agent id (`agt` claim). When set, mismatches are rejected. */
  agentId?: string;
  /** Whether the buyer SDK enforces grant spend limits before retrying a 402 request. */
  enforceSpendingLimits?: boolean;
  /** Callback invoked when grant verification or payment authorization fails. */
  onGrantDenied?: (reason: string, context: GrantDeniedContext) => void | Promise<void>;
  /** Callback invoked for buyer-side grant audit events. */
  onAuditEvent?: (event: GrantAuditEvent) => void | Promise<void>;
}

/** Configuration required to construct a buyer SDK instance. */
export interface PluralBuyerConfig {
  /** Client id used for `POST /api/auth/v1/token` unless `accessToken` is supplied. */
  clientId: string;
  /** Client secret used for `POST /api/auth/v1/token` unless `accessToken` is supplied. */
  clientSecret: string;
  /** Buyer/customer reference sent to `/mpp/v1/token` and embedded in Payment credentials. */
  customerReference?: string;
  /** Shared base URL used for both auth and MPP service calls when specific base URLs are absent. */
  baseUrl?: string;
  /** Optional auth service base URL for `/api/auth/v1/token`. */
  authBaseUrl?: string;
  /** Optional MPP service base URL for `/mpp/v1/*` calls. */
  mppBaseUrl?: string;
  /** Set false to return seller 402 responses without automatic token creation and retry. */
  autoHandlePayment?: boolean;
  /** Callback invoked after a seller Payment challenge is decoded. */
  onChallenge?: (challenge: Challenge) => void | Promise<void>;
  /** Callback invoked with a decoded `Payment-Receipt` after a successful paid retry. */
  onPaymentComplete?: (receipt: Receipt) => void | Promise<void>;
  /** Legacy defaults retained for compatibility; current `/token` does not require them. */
  tokenDefaults?: TokenDefaults;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  requestTimeoutMs?: number;
  /** Number of retries for network errors, HTTP 429, and 5xx responses. Defaults to 3. */
  maxRetries?: number;
  /** Initial exponential-backoff retry delay in milliseconds. Defaults to 500. */
  initialRetryDelayMs?: number;
  /** Optional logger for request, retry, auth, and payment diagnostics. */
  logger?: MppLogger;
  /** Optional buyer-side Grantex grant verification and spend enforcement settings. */
  grantex?: GrantexConfig;
  /** Pre-issued bearer token. When supplied, the SDK skips client-credential exchange. */
  accessToken?: string;
  /** Custom fetch implementation for tests or non-standard runtimes. */
  fetch?: FetchLike;
}

/** Input for `buyer.methods.createMandate`, mapped to `POST /mpp/v1/pre-authorize`. */
export interface CreateMandateOptions {
  /** Buyer mobile number used for SBMD mandate creation; accepts E.164 or local 10-digit format. */
  mobileNumber: string;
  /** Mandate/pre-authorization amount in minor units. */
  amount: Amount;
  /** Preferred buyer/customer reference for MPP lookups. */
  customerReference?: string;
  /** Legacy alias used when `customerReference` is absent. */
  customerId?: string;
  /** Optional description stored with the pre-authorization. */
  description?: string;
  /** Optional caller metadata retained for compatibility; not required by current service contract. */
  metadata?: Record<string, string>;
  /** Optional legacy expiry value retained for compatibility; current service uses `validityInDays`. */
  expiry?: string;
  /** Optional idempotency key for pre-authorization creation. Generated when absent. */
  idempotencyKey?: string;
  /** MPP payment type. Defaults to `SBMD`; `CRYPTO` is supported by the service contract. */
  paymentType?: "SBMD" | "CRYPTO" | string;
  /** Authorization validity period in days. Defaults to 7. */
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
  /** Legacy usage-limit object retained for compatibility; not sent to current `/token`. */
  usageLimits?: CreateTokenUsageLimits;
  /** Customer reference used to find the active authorization for token creation. */
  customerReference?: string;
  /** Legacy alias used when `customerReference` is absent. */
  customerId?: string;
  /** Local challenge correlation id retained in SDK objects; not required by current `/token`. */
  challengeId?: string;
  /** Optional caller metadata retained for compatibility; not sent to current `/token`. */
  metadata?: Record<string, string>;
  /** MPP payment type. Defaults to `SBMD`; `CRYPTO` is supported by the service contract. */
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
  hold: { amount: number; status: string; expires_at: string };
  usage_limits: { max_amount: number; currency: string; expires_at: string; max_charges?: number };
  usage: { amount_used: number; charges_made: number };
  metadata?: Record<string, unknown>;
  created_at: string;
  raw: Record<string, unknown>;
}

/** Error type raised for non-2xx MPP service responses. */
export class MppError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MppError";
  }

  static fromResponse(status: number, body: unknown): MppError {
    const record = asRecord(body) ?? {};
    const error = asRecord(record.error) ?? record;
    return new MppError(
      String(error.code ?? "MPP_INTERNAL_ERROR"),
      String(error.message ?? `HTTP ${status}`),
      status,
      asRecord(error.additional_error_details),
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        additional_error_details: this.details,
      },
    };
  }
}

export class MppNetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "MppNetworkError";
  }
}

/** Error type raised when a seller challenge is missing, expired, or malformed. */
export class MppChallengeError extends Error {
  constructor(message: string, public challengeId: string) {
    super(message);
    this.name = "MppChallengeError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
