import { GrantexConfig, GrantTokenClaims } from "../types";
export declare class GrantAuditLogger {
    private config;
    constructor(config: GrantexConfig);
    /** Emit an audit event to the configured callback, ignoring callback failures. */
    log(action: string, claims: GrantTokenClaims, details?: Record<string, unknown>): Promise<void>;
    logGrantVerified(claims: GrantTokenClaims): Promise<void>;
    logGrantDenied(claims: GrantTokenClaims, reason: string): Promise<void>;
    logPaymentAuthorized(claims: GrantTokenClaims, amountPaise: number, resource: string): Promise<void>;
    logPaymentDenied(claims: GrantTokenClaims, amountPaise: number, resource: string, reason: string): Promise<void>;
    logSpendingLimitChecked(claims: GrantTokenClaims, amountPaise: number, totalSpent: number, limit: number): Promise<void>;
}
