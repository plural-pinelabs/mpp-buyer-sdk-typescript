import {
  Challenge,
  ChallengeRequest,
  Credential,
  MppChallengeError,
  PAYMENT_HEADER_PREFIX,
  Receipt,
} from "../types";
import { decodeJson, encodeJson, isBase64Url } from "../utils/base64url";
import { asRecord } from "../utils/parsers";

/** Decode and validate a seller `WWW-Authenticate: Payment ...` challenge. */
export function decodeChallenge(wwwAuthenticateHeader: string): Challenge {
  const encoded = extractBase64Payload(wwwAuthenticateHeader);
  if (!encoded) {
    throw new MppChallengeError("Invalid WWW-Authenticate header format", "");
  }
  const raw = decodeJson(encoded);
  const challenge = dictToChallenge(raw);
  validateChallenge(challenge);
  return challenge;
}

/** Build the buyer credential object that authorizes one seller debit attempt. */
export function buildCredential(
  challenge: Challenge,
  agentId: string,
  token: string,
  customerReference?: string,
): Credential {
  return {
    challenge,
    source: agentId,
    payload: {
      type: "token",
      token,
      customer_reference: customerReference?.trim() || undefined,
    },
  };
}

/** Encode a credential as an `Authorization: Payment <base64url>` header value. */
export function encodeCredentialHeader(credential: Credential): string {
  const payload: Record<string, unknown> = {
    type: credential.payload.type,
    token: credential.payload.token,
  };
  if (credential.payload.customer_reference) {
    payload.customer_reference = credential.payload.customer_reference;
  }
  return `${PAYMENT_HEADER_PREFIX}${encodeJson({
    challenge: credential.challenge,
    source: credential.source,
    payload,
  })}`;
}

/** Decode a seller `Payment-Receipt` header into a typed receipt. */
export function decodeReceipt(paymentReceiptHeader: string): Receipt {
  const encoded = extractBase64Payload(paymentReceiptHeader);
  if (!encoded) {
    throw new Error("Invalid Payment-Receipt header format");
  }
  const raw = asRecord(decodeJson(encoded)) ?? {};
  const settlement = asRecord(raw.settlement) ?? {};
  return {
    status: raw.status === "success" ? "success" : "failure",
    method: String(raw.method ?? ""),
    timestamp: String(raw.timestamp ?? ""),
    reference: String(raw.reference ?? ""),
    challengeId: String(raw.challengeId ?? ""),
    settlement: {
      amount: String(settlement.amount ?? "0.00"),
      currency: String(settlement.currency ?? "INR"),
    },
  };
}

/** Validate that a decoded challenge is usable and not expired. */
export function validateChallenge(challenge: Challenge): void {
  if (!challenge.id) {
    throw new MppChallengeError("Challenge missing id", "");
  }
  if (challenge.method !== "plural") {
    throw new MppChallengeError(`Unsupported payment method: ${challenge.method}. Expected "plural"`, challenge.id);
  }
  if (!challenge.request?.amount || !challenge.request.currency) {
    throw new MppChallengeError("Challenge missing payment request details", challenge.id);
  }
  const expiresMs = Date.parse(challenge.expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    throw new MppChallengeError("Challenge has expired", challenge.id);
  }
}

/** Return the challenge amount in paise for token creation. */
export function extractAmountPaise(challenge: Challenge): number {
  const majorUnits = Number(challenge.request.amount);
  if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
    throw new MppChallengeError(`Invalid challenge amount: ${challenge.request.amount}`, challenge.id);
  }
  return Math.round(majorUnits * 100);
}

function extractBase64Payload(header: string): string | undefined {
  const trimmed = header.trim();
  const payload = trimmed.startsWith(PAYMENT_HEADER_PREFIX)
    ? trimmed.slice(PAYMENT_HEADER_PREFIX.length).trim()
    : trimmed;
  return isBase64Url(payload) ? payload : undefined;
}

function dictToChallenge(raw: unknown): Challenge {
  const record = asRecord(raw) ?? {};
  const req = asRecord(record.request) ?? {};
  return {
    id: String(record.id ?? ""),
    realm: String(record.realm ?? ""),
    method: String(record.method ?? ""),
    intent: String(record.intent ?? ""),
    request: {
      scheme: String(req.scheme ?? ""),
      amount: String(req.amount ?? ""),
      currency: String(req.currency ?? ""),
      resource: String(req.resource ?? ""),
    } satisfies ChallengeRequest,
    expires: String(record.expires ?? ""),
  };
}
