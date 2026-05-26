import { webcrypto } from "node:crypto";

import {
  FetchLike,
  GrantTokenClaims,
  GrantVerificationResult,
  JwksConfig,
} from "../types";
import { decodeBase64Url } from "../utils/base64url";
import { asRecord } from "../utils/parsers";

const DEFAULT_JWKS_CACHE_TTL_MS = 3_600_000;

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwksResponse {
  keys?: Jwk[];
}

type Jwk = JsonWebKey & { kid?: string; alg?: string; kty?: string };

export class GrantVerifier {
  private readonly jwksUrl: string;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: FetchLike;
  private jwks?: Jwk[];
  private cacheExpiresAt = 0;

  constructor(jwks: JwksConfig, fetchImpl?: FetchLike) {
    this.jwksUrl = normalizeJwksUrl(jwks.jwksUrl);
    this.cacheTtlMs = jwks.cacheTtlMs ?? DEFAULT_JWKS_CACHE_TTL_MS;
    this.fetchImpl = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetchImpl) {
      throw new Error("A fetch implementation is required for Grantex JWKS verification.");
    }
  }

  /** Verify signature, time claims, required claims, and optional agent id. */
  async verify(grantToken: string, expectedAgentId?: string): Promise<GrantVerificationResult> {
    let header: JwtHeader;
    let claims: GrantTokenClaims;
    try {
      const decoded = decodeJwt(grantToken);
      header = decoded.header;
      claims = dictToClaims(decoded.payload);
    } catch (error) {
      return { valid: false, error: `Grant verification failed: ${errorMessage(error)}` };
    }

    if (header.alg !== "RS256") {
      return { valid: false, error: `Unsupported algorithm: ${header.alg ?? "none"}. Expected RS256` };
    }

    const jwk = await this.getSigningKey(header.kid);
    if (!jwk) {
      return { valid: false, error: `No matching key found for kid: ${header.kid ?? "none"}` };
    }

    try {
      const validSignature = await verifyRs256(jwk, grantToken);
      if (!validSignature) {
        return { valid: false, error: "Invalid signature" };
      }
    } catch (error) {
      return { valid: false, error: `Grant verification failed: ${errorMessage(error)}` };
    }

    const validationError = validateClaims(claims, expectedAgentId);
    if (validationError) {
      return { valid: false, error: validationError };
    }
    return { valid: true, claims };
  }

  /** Decode grant claims without verifying the token signature. */
  static decodeClaims(grantToken: string): GrantTokenClaims | undefined {
    try {
      return dictToClaims(decodeJwt(grantToken).payload);
    } catch {
      return undefined;
    }
  }

  private async getSigningKey(kid?: string): Promise<Jwk | undefined> {
    const keys = await this.getJwks();
    const signingKeys = keys.filter((key) => key.kty === "RSA" && (!key.alg || key.alg === "RS256"));
    if (!kid) {
      return signingKeys.length === 1 ? signingKeys[0] : undefined;
    }
    return signingKeys.find((key) => key.kid === kid);
  }

  private async getJwks(): Promise<Jwk[]> {
    if (this.jwks && Date.now() < this.cacheExpiresAt) {
      return this.jwks;
    }
    const response = await this.fetchImpl(this.jwksUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`JWKS fetch failed with status ${response.status}`);
    }
    const body = asRecord(await response.json()) as JwksResponse | undefined;
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    this.jwks = keys;
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    return keys;
  }
}

function decodeJwt(token: string): { header: JwtHeader; payload: Record<string, unknown>; signingInput: string; signature: Uint8Array } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    header: asRecord(decodeJsonSegment(encodedHeader)) ?? {},
    payload: asRecord(decodeJsonSegment(encodedPayload)) ?? {},
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: decodeBase64Url(encodedSignature),
  };
}

async function verifyRs256(jwk: JsonWebKey, token: string): Promise<boolean> {
  const { signingInput, signature } = decodeJwt(token);
  const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;
  const key = await subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return subtle.verify("RSASSA-PKCS1-v1_5", key, toArrayBuffer(signature), new TextEncoder().encode(signingInput));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeJsonSegment(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

function dictToClaims(raw: Record<string, unknown>): GrantTokenClaims {
  const scopes = Array.isArray(raw.scp) ? raw.scp.map(String) : [];
  return {
    iss: String(raw.iss ?? ""),
    sub: String(raw.sub ?? ""),
    agt: String(raw.agt ?? ""),
    scp: scopes,
    grnt: String(raw.grnt ?? ""),
    iat: numberClaim(raw.iat),
    exp: numberClaim(raw.exp),
    dev: stringOrUndefined(raw.dev),
    nbf: optionalNumberClaim(raw.nbf),
    parentAgt: stringOrUndefined(raw.parentAgt),
    parentGrnt: stringOrUndefined(raw.parentGrnt),
    delegationDepth: optionalNumberClaim(raw.delegationDepth),
    raw,
  };
}

function validateClaims(claims: GrantTokenClaims, expectedAgentId?: string): string | undefined {
  const now = Math.floor(Date.now() / 1000);
  if (!claims.grnt) return "Missing grant ID (grnt)";
  if (!claims.sub) return "Missing subject (sub)";
  if (!claims.agt) return "Missing agent ID (agt)";
  if (!claims.iss) return "Missing issuer (iss)";
  if (!claims.scp.length) return "Missing or empty scopes (scp)";
  if (claims.exp && claims.exp < now) return `Grant expired at ${formatEpoch(claims.exp)}`;
  if (claims.nbf && claims.nbf > now) return `Grant not yet valid until ${formatEpoch(claims.nbf)}`;
  if (expectedAgentId && claims.agt !== expectedAgentId) {
    return `Agent ID mismatch: expected ${expectedAgentId}, got ${claims.agt}`;
  }
  return undefined;
}

function numberClaim(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function optionalNumberClaim(value: unknown): number | undefined {
  return value === undefined || value === null || value === "" ? undefined : numberClaim(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function formatEpoch(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(".000Z", "Z");
}

function normalizeJwksUrl(value: string): string {
  const url = new URL(value);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/.well-known/jwks.json";
  }
  return url.toString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
