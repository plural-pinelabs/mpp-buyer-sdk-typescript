import { Mandate, Token } from "../types";

export function parseMandate(data: unknown): Mandate {
  const record = asRecord(data) ?? {};
  const metadata = asRecord(record.metadata) ?? {};
  const sbmdData = asRecord(metadata.sbmd_data) ?? asRecord(metadata.sbmdData) ?? {};
  const amount = asRecord(record.amount);
  const amountValue = amount?.value ?? record.amount_value ?? metadata.amount ?? 0;
  const amountCurrency = amount?.currency ?? record.amount_currency ?? metadata.currency ?? "INR";
  const challengeUrl = record.challenge_url ?? record.challengeUrl;
  const challenge = asRecord(record.challenge);
  return {
    mandate_id: String(record.authorization_id ?? record.authorizationId ?? record.mandate_id ?? record.mandateId ?? metadata.external_subscription_id ?? ""),
    object: String(record.object ?? "mandate"),
    order_id: String(record.order_id ?? sbmdData.order_id ?? ""),
    order_status: String(record.order_status ?? record.payment_status ?? record.status ?? ""),
    payment_status: String(record.payment_status ?? record.order_status ?? record.status ?? ""),
    customer_reference: String(record.customer_reference ?? record.customer_id ?? ""),
    customer_id: String(record.customer_id ?? record.customer_reference ?? ""),
    agent_id: String(record.agent_id ?? ""),
    amount: { value: amountToInt(amountValue), currency: String(amountCurrency) },
    amount_blocked: Number(record.amount_blocked ?? sbmdData.amount_blocked ?? 0),
    amount_debited: Number(record.amount_debited ?? sbmdData.amount_debited ?? 0),
    amount_held: Number(record.amount_held ?? sbmdData.amount_held ?? 0),
    amount_available: Number(record.amount_available ?? sbmdData.amount_available ?? 0),
    mobile_number: String(record.mobile_number ?? ""),
    description: stringOrUndefined(record.description ?? metadata.description),
    metadata,
    expires_at: String(record.expiry_at ?? record.expires_at ?? sbmdData.expires_at ?? ""),
    created_at: String(record.created_at ?? sbmdData.created_at ?? ""),
    challenge: challenge || challengeUrl ? {
      type: String(challenge?.type ?? sbmdData.challenge_type ?? ""),
      qr_url: String(challenge?.qr_url ?? challengeUrl ?? ""),
      deep_link: String(challenge?.deep_link ?? challengeUrl ?? ""),
      expires_at: String(challenge?.expires_at ?? record.expiry_at ?? sbmdData.expires_at ?? ""),
    } : undefined,
    raw: record,
  };
}

export function parseToken(data: unknown): Token {
  const record = asRecord(data) ?? {};
  const hold = asRecord(record.hold) ?? {};
  const usage = asRecord(record.usage) ?? {};
  const limits = asRecord(record.usage_limits) ?? {};
  const paymentToken = String(record.payment_token ?? record.token ?? record.token_id ?? "");
  return {
    token_id: paymentToken,
    object: String(record.object ?? "plural_payment_token"),
    customer_reference: String(record.customer_reference ?? record.customer_id ?? ""),
    customer_id: String(record.customer_id ?? record.customer_reference ?? ""),
    mandate_id: String(record.authorization_id ?? record.mandate_id ?? ""),
    token: paymentToken,
    challenge_id: stringOrUndefined(record.challenge_id),
    hold: {
      amount: Number(hold.amount ?? 0),
      status: String(hold.status ?? ""),
      expires_at: String(hold.expires_at ?? ""),
    },
    usage_limits: {
      max_amount: Number(limits.max_amount ?? 0),
      currency: String(limits.currency ?? "INR"),
      expires_at: String(limits.expires_at ?? ""),
      max_charges: limits.max_charges === undefined ? undefined : Number(limits.max_charges),
    },
    usage: {
      amount_used: Number(usage.amount_used ?? 0),
      charges_made: Number(usage.charges_made ?? 0),
    },
    metadata: asRecord(record.metadata) ?? { type: record.type ?? "SBMD" },
    created_at: String(record.created_at ?? ""),
    raw: record,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function amountToInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
