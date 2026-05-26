import { Challenge, Credential, Receipt } from "../types";
/** Decode and validate a seller `WWW-Authenticate: Payment ...` challenge. */
export declare function decodeChallenge(wwwAuthenticateHeader: string): Challenge;
/** Build the buyer credential object that authorizes one seller debit attempt. */
export declare function buildCredential(challenge: Challenge, agentId: string, token: string, customerReference?: string): Credential;
/** Encode a credential as an `Authorization: Payment <base64url>` header value. */
export declare function encodeCredentialHeader(credential: Credential): string;
/** Decode a seller `Payment-Receipt` header into a typed receipt. */
export declare function decodeReceipt(paymentReceiptHeader: string): Receipt;
/** Validate that a decoded challenge is usable and not expired. */
export declare function validateChallenge(challenge: Challenge): void;
/** Return the challenge amount in paise for limit checks and token creation. */
export declare function extractAmountPaise(challenge: Challenge): number;
