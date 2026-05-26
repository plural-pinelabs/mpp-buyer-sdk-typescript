import { GrantTokenClaims, ParsedScope, SpendingLimit } from "../types";
export declare const MppScopes: {
    readonly PAYMENT_INITIATE: "mpp:payment:initiate";
    readonly MANDATE_READ: "mpp:mandate:read";
    readonly MANDATE_CREATE: "mpp:mandate:create";
    readonly TOKEN_READ: "mpp:token:read";
    readonly TOKEN_CREATE: "mpp:token:create";
    readonly TOKEN_REVOKE: "mpp:token:revoke";
    readonly PAYMENT_ALL: "mpp:payment:*";
    readonly MANDATE_ALL: "mpp:mandate:*";
    readonly ALL: "mpp:*";
};
export interface AuthorizationCheckResult {
    authorized: boolean;
    reason?: string;
    spendingLimit?: SpendingLimit;
    perTransactionLimit?: SpendingLimit;
}
/** Parse a Grantex scope such as `mpp:payment:initiate:max_500`. */
export declare function parseScope(scope: string): ParsedScope | undefined;
/** Return whether any grant scope satisfies a required scope. */
export declare function hasScope(grantScopes: string[], requiredScope: string): boolean;
/** Extract cumulative spend limit from `mpp:payment:initiate:max_N`. */
export declare function extractSpendingLimit(scopes: string[]): SpendingLimit | undefined;
/** Extract per-transaction limit from `mpp:payment:initiate:per_tx_max_N`. */
export declare function extractPerTransactionLimit(scopes: string[]): SpendingLimit | undefined;
/** Check whether verified grant claims authorize a payment amount. */
export declare function checkPaymentAuthorization(claims: GrantTokenClaims, amountPaise: number, totalSpentPaise?: number): AuthorizationCheckResult;
