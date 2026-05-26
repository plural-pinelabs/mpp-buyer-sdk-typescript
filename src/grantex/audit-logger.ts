import { GrantAuditEvent, GrantexConfig, GrantTokenClaims } from "../types";

export class GrantAuditLogger {
  constructor(private config: GrantexConfig) {}

  /** Emit an audit event to the configured callback, ignoring callback failures. */
  async log(action: string, claims: GrantTokenClaims, details: Record<string, unknown> = {}): Promise<void> {
    if (!this.config.onAuditEvent) {
      return;
    }
    const event: GrantAuditEvent = {
      timestamp: new Date().toISOString(),
      action,
      grantId: claims.grnt,
      agentId: claims.agt,
      userId: claims.sub,
      details,
    };
    try {
      await this.config.onAuditEvent(event);
    } catch {
      // Audit failures are non-fatal.
    }
  }

  logGrantVerified(claims: GrantTokenClaims): Promise<void> {
    return this.log("grant.verified", claims, {
      scopes: claims.scp,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      delegationDepth: claims.delegationDepth ?? 0,
    });
  }

  logGrantDenied(claims: GrantTokenClaims, reason: string): Promise<void> {
    return this.log("grant.denied", claims, { reason });
  }

  logPaymentAuthorized(claims: GrantTokenClaims, amountPaise: number, resource: string): Promise<void> {
    return this.log("payment.authorized", claims, {
      amountPaise,
      amountDisplay: `Rs ${amountPaise / 100}`,
      resource,
    });
  }

  logPaymentDenied(claims: GrantTokenClaims, amountPaise: number, resource: string, reason: string): Promise<void> {
    return this.log("payment.denied", claims, {
      amountPaise,
      amountDisplay: `Rs ${amountPaise / 100}`,
      resource,
      reason,
    });
  }

  logSpendingLimitChecked(claims: GrantTokenClaims, amountPaise: number, totalSpent: number, limit: number): Promise<void> {
    return this.log("spending_limit.checked", claims, {
      amountPaise,
      totalSpentPaise: totalSpent,
      limitPaise: limit,
      remainingPaise: limit - totalSpent,
    });
  }
}
