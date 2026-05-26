"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeChallenge = decodeChallenge;
exports.buildCredential = buildCredential;
exports.encodeCredentialHeader = encodeCredentialHeader;
exports.decodeReceipt = decodeReceipt;
exports.validateChallenge = validateChallenge;
exports.extractAmountPaise = extractAmountPaise;
const types_1 = require("../types");
const base64url_1 = require("../utils/base64url");
const parsers_1 = require("../utils/parsers");
/** Decode and validate a seller `WWW-Authenticate: Payment ...` challenge. */
function decodeChallenge(wwwAuthenticateHeader) {
    const encoded = extractBase64Payload(wwwAuthenticateHeader);
    if (!encoded) {
        throw new types_1.MppChallengeError("Invalid WWW-Authenticate header format", "");
    }
    const raw = (0, base64url_1.decodeJson)(encoded);
    const challenge = dictToChallenge(raw);
    validateChallenge(challenge);
    return challenge;
}
/** Build the buyer credential object that authorizes one seller debit attempt. */
function buildCredential(challenge, agentId, token, customerReference) {
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
function encodeCredentialHeader(credential) {
    const payload = {
        type: credential.payload.type,
        token: credential.payload.token,
    };
    if (credential.payload.customer_reference) {
        payload.customer_reference = credential.payload.customer_reference;
    }
    return `${types_1.PAYMENT_HEADER_PREFIX}${(0, base64url_1.encodeJson)({
        challenge: credential.challenge,
        source: credential.source,
        payload,
    })}`;
}
/** Decode a seller `Payment-Receipt` header into a typed receipt. */
function decodeReceipt(paymentReceiptHeader) {
    const encoded = extractBase64Payload(paymentReceiptHeader);
    if (!encoded) {
        throw new Error("Invalid Payment-Receipt header format");
    }
    const raw = (0, parsers_1.asRecord)((0, base64url_1.decodeJson)(encoded)) ?? {};
    const settlement = (0, parsers_1.asRecord)(raw.settlement) ?? {};
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
function validateChallenge(challenge) {
    if (!challenge.id) {
        throw new types_1.MppChallengeError("Challenge missing id", "");
    }
    if (challenge.method !== "plural") {
        throw new types_1.MppChallengeError(`Unsupported payment method: ${challenge.method}. Expected "plural"`, challenge.id);
    }
    if (!challenge.request?.amount || !challenge.request.currency) {
        throw new types_1.MppChallengeError("Challenge missing payment request details", challenge.id);
    }
    const expiresMs = Date.parse(challenge.expires);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
        throw new types_1.MppChallengeError("Challenge has expired", challenge.id);
    }
}
/** Return the challenge amount in paise for limit checks and token creation. */
function extractAmountPaise(challenge) {
    const majorUnits = Number(challenge.request.amount);
    if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
        throw new types_1.MppChallengeError(`Invalid challenge amount: ${challenge.request.amount}`, challenge.id);
    }
    return Math.round(majorUnits * 100);
}
function extractBase64Payload(header) {
    const trimmed = header.trim();
    const payload = trimmed.startsWith(types_1.PAYMENT_HEADER_PREFIX)
        ? trimmed.slice(types_1.PAYMENT_HEADER_PREFIX.length).trim()
        : trimmed;
    return (0, base64url_1.isBase64Url)(payload) ? payload : undefined;
}
function dictToChallenge(raw) {
    const record = (0, parsers_1.asRecord)(raw) ?? {};
    const req = (0, parsers_1.asRecord)(record.request) ?? {};
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
        },
        expires: String(record.expires ?? ""),
    };
}
