"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MppChallengeError = exports.MppNetworkError = exports.MppError = exports.PAYMENT_HEADER_PREFIX = void 0;
/** Prefix used for MPP Payment credentials in HTTP auth headers. */
exports.PAYMENT_HEADER_PREFIX = "Payment ";
/** Error type raised for non-2xx MPP service responses. */
class MppError extends Error {
    code;
    httpStatus;
    details;
    constructor(code, message, httpStatus, details) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = "MppError";
    }
    static fromResponse(status, body) {
        const record = asRecord(body) ?? {};
        const error = asRecord(record.error) ?? record;
        return new MppError(String(error.code ?? "MPP_INTERNAL_ERROR"), String(error.message ?? `HTTP ${status}`), status, asRecord(error.additional_error_details));
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                additional_error_details: this.details,
            },
        };
    }
}
exports.MppError = MppError;
/** Error type raised when a network request fails before receiving an MPP response. */
class MppNetworkError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "MppNetworkError";
    }
}
exports.MppNetworkError = MppNetworkError;
/** Error type raised when a seller challenge is missing, expired, or malformed. */
class MppChallengeError extends Error {
    challengeId;
    constructor(message, challengeId) {
        super(message);
        this.challengeId = challengeId;
        this.name = "MppChallengeError";
    }
}
exports.MppChallengeError = MppChallengeError;
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
