"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrantAuditLogger = void 0;
class GrantAuditLogger {
    config;
    constructor(config) {
        this.config = config;
    }
    /** Emit an audit event to the configured callback, ignoring callback failures. */
    async log(action, claims, details = {}) {
        if (!this.config.onAuditEvent) {
            return;
        }
        const event = {
            timestamp: new Date().toISOString(),
            action,
            grantId: claims.grnt,
            agentId: claims.agt,
            userId: claims.sub,
            details,
        };
        try {
            await this.config.onAuditEvent(event);
        }
        catch {
            // Audit failures are non-fatal.
        }
    }
    logGrantVerified(claims) {
        return this.log("grant.verified", claims, {
            scopes: claims.scp,
            expiresAt: new Date(claims.exp * 1000).toISOString(),
            delegationDepth: claims.delegationDepth ?? 0,
        });
    }
    logGrantDenied(claims, reason) {
        return this.log("grant.denied", claims, { reason });
    }
    logPaymentAuthorized(claims, amountPaise, resource) {
        return this.log("payment.authorized", claims, {
            amountPaise,
            amountDisplay: `Rs ${amountPaise / 100}`,
            resource,
        });
    }
    logPaymentDenied(claims, amountPaise, resource, reason) {
        return this.log("payment.denied", claims, {
            amountPaise,
            amountDisplay: `Rs ${amountPaise / 100}`,
            resource,
            reason,
        });
    }
    logSpendingLimitChecked(claims, amountPaise, totalSpent, limit) {
        return this.log("spending_limit.checked", claims, {
            amountPaise,
            totalSpentPaise: totalSpent,
            limitPaise: limit,
            remainingPaise: limit - totalSpent,
        });
    }
}
exports.GrantAuditLogger = GrantAuditLogger;
