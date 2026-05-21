import {
  GrantTokenClaims,
  ParsedScope,
  SpendingLimit,
} from "../types";

export const MppScopes = {
  PAYMENT_INITIATE: "mpp:payment:initiate",
  MANDATE_READ: "mpp:mandate:read",
  MANDATE_CREATE: "mpp:mandate:create",
  TOKEN_READ: "mpp:token:read",
  TOKEN_CREATE: "mpp:token:create",
  TOKEN_REVOKE: "mpp:token:revoke",
  PAYMENT_ALL: "mpp:payment:*",
  MANDATE_ALL: "mpp:mandate:*",
  ALL: "mpp:*",
} as const;

export interface AuthorizationCheckResult {
  authorized: boolean;
  reason?: string;
  spendingLimit?: SpendingLimit;
  perTransactionLimit?: SpendingLimit;
}

/** Parse a Grantex scope such as `mpp:payment:initiate:max_500`. */
export function parseScope(scope: string): ParsedScope | undefined {
  const parts = scope.split(":");
  if (parts.length < 3) {
    return undefined;
  }
  return {
    resource: `${parts[0]}:${parts[1]}`,
    action: parts[2],
    constraint: parts.length > 3 ? parts.slice(3).join(":") : undefined,
  };
}

/** Return whether any grant scope satisfies a required scope. */
export function hasScope(grantScopes: string[], requiredScope: string): boolean {
  const required = parseScope(requiredScope);
  if (!required) {
    return false;
  }
  const requiredNamespace = required.resource.split(":")[0];
  return grantScopes.some((scope) => {
    if (scope === requiredScope || scope === `${requiredNamespace}:*`) {
      return true;
    }
    const parsed = parseScope(scope);
    if (!parsed) {
      return false;
    }
    if (parsed.resource === required.resource && parsed.action === "*") {
      return true;
    }
    return parsed.resource === required.resource && parsed.action === required.action;
  });
}

/** Extract cumulative spend limit from `mpp:payment:initiate:max_N`. */
export function extractSpendingLimit(scopes: string[]): SpendingLimit | undefined {
  for (const scope of scopes) {
    const parsed = parseScope(scope);
    if (!parsed || parsed.resource !== "mpp:payment" || parsed.action !== "initiate") {
      continue;
    }
    const match = parsed.constraint?.match(/^max_(\d+)$/);
    if (match) {
      return { maxAmountPaise: Number(match[1]) * 100, currency: "INR" };
    }
  }
  return undefined;
}

/** Extract per-transaction limit from `mpp:payment:initiate:per_tx_max_N`. */
export function extractPerTransactionLimit(scopes: string[]): SpendingLimit | undefined {
  for (const scope of scopes) {
    const parsed = parseScope(scope);
    if (!parsed || parsed.resource !== "mpp:payment" || parsed.action !== "initiate") {
      continue;
    }
    const match = parsed.constraint?.match(/^per_tx_max_(\d+)$/);
    if (match) {
      return { maxAmountPaise: Number(match[1]) * 100, currency: "INR" };
    }
  }
  return undefined;
}

/** Check whether verified grant claims authorize a payment amount. */
export function checkPaymentAuthorization(
  claims: GrantTokenClaims,
  amountPaise: number,
  totalSpentPaise = 0,
): AuthorizationCheckResult {
  if (!hasScope(claims.scp, MppScopes.PAYMENT_INITIATE)) {
    return {
      authorized: false,
      reason: `Grant ${claims.grnt} does not include payment:initiate scope`,
    };
  }

  const perTransactionLimit = extractPerTransactionLimit(claims.scp);
  if (perTransactionLimit && amountPaise > perTransactionLimit.maxAmountPaise) {
    return {
      authorized: false,
      reason: `Amount Rs ${amountPaise / 100} exceeds per-transaction limit Rs ${perTransactionLimit.maxAmountPaise / 100}`,
      perTransactionLimit,
    };
  }

  const spendingLimit = extractSpendingLimit(claims.scp);
  if (spendingLimit && totalSpentPaise + amountPaise > spendingLimit.maxAmountPaise) {
    return {
      authorized: false,
      reason: `Cumulative spend Rs ${(totalSpentPaise + amountPaise) / 100} exceeds grant limit Rs ${spendingLimit.maxAmountPaise / 100}`,
      spendingLimit,
    };
  }

  return { authorized: true, spendingLimit, perTransactionLimit };
}
