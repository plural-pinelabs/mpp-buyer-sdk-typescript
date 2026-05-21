import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  MppEnvironment,
  PluralBuyer,
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
} from "../dist/index.js";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function response(status, body, headers = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createGrantFixture(claimOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  publicJwk.kid = "test-grantex-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: publicJwk.kid });
  const payload = encodeJson({
    iss: "https://grantex.dev",
    sub: "user_123",
    agt: "buyer-client",
    scp: ["mpp:payment:initiate:max_200"],
    grnt: "grnt_123",
    iat: now,
    exp: now + 3600,
    ...claimOverrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return { grantToken: `${signingInput}.${signature}`, publicJwk };
}

test("decodes challenges and encodes credentials with customer reference", () => {
  const challengePayload = {
    id: "ch_test",
    realm: "Plural MPP",
    method: "plural",
    intent: "charge",
    request: { scheme: "exact", amount: "100.00", currency: "INR", resource: "/premium" },
    expires: "2030-01-01T00:00:00Z",
  };

  const challenge = decodeChallenge(`Payment ${encodeJson(challengePayload)}`);
  const credential = buildCredential(challenge, "buyer-client", "MPP_TOK_test", "cust-ref-123");
  const header = encodeCredentialHeader(credential);

  assert.equal(header.startsWith("Payment "), true);
  const encoded = header.slice("Payment ".length);
  const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(raw.payload.customer_reference, "cust-ref-123");
});

test("auto handles 402 challenge, creates payment token, and retries original request", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_123",
    realm: "Plural MPP",
    method: "plural",
    intent: "charge",
    request: { scheme: "exact", amount: "150.00", currency: "INR", resource: "/api/premium" },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "buyer-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/token") {
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { type: "SBMD", customer_reference: "cust-ref-123" });
      return response(200, {
        data: {
          payment_token: "MPP_TOK_123",
          type: "SBMD",
          authorization_id: "mnd_test",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/premium") {
      const authorization = init.headers?.Authorization ?? init.headers?.authorization ?? "";
      if (!String(authorization).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_123" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      return response(
        200,
        { ok: true },
        {
          "Payment-Receipt": `Payment ${encodeJson({
            status: "success",
            method: "plural",
            timestamp: "2030-01-01T00:00:00Z",
            reference: "cap_123",
            challengeId: "ch_123",
            settlement: { amount: "150.00", currency: "INR" },
          })}`,
        },
      );
    }

    return response(404, { error: "not found" });
  };

  let receiptSeen;
  const buyer = PluralBuyer.create({
    clientId: "buyer-client",
    clientSecret: "buyer-secret",
    customerReference: "cust-ref-123",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    onPaymentComplete: (receipt) => {
      receiptSeen = receipt;
    },
  });

  const finalResponse = await buyer.get("https://api.test/api/premium");
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), { ok: true });
  assert.equal(receiptSeen.settlement.amount, "150.00");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/premium", "/api/auth/v1/token", "/mpp/v1/token", "/api/premium"],
  );
});

test("verifies Grantex RS256 grants through grantex.dev JWKS and enforces payment scopes", async () => {
  const { grantToken, publicJwk } = createGrantFixture();
  const calls = [];
  const auditActions = [];
  const challengePayload = {
    id: "ch_grantex",
    realm: "Plural MPP",
    method: "plural",
    intent: "charge",
    request: { scheme: "exact", amount: "150.00", currency: "INR", resource: "/api/premium" },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/.well-known/jwks.json") {
      return response(200, { keys: [publicJwk] });
    }

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "buyer-access-token", expires_in: 3600 } });
    }

    if (parsed.pathname === "/mpp/v1/token") {
      return response(200, {
        data: {
          payment_token: "MPP_TOK_123",
          type: "SBMD",
          authorization_id: "mnd_test",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/premium") {
      const authorization = init.headers?.Authorization ?? init.headers?.authorization ?? "";
      if (!String(authorization).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_grantex" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      assert.equal(init.headers["X-Grantex-Token"], grantToken);
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    clientId: "buyer-client",
    clientSecret: "buyer-secret",
    customerReference: "cust-ref-123",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    grantex: {
      grantToken,
      jwks: { jwksUrl: "https://grantex.dev" },
      agentId: "buyer-client",
      onAuditEvent: (event) => auditActions.push(event.action),
    },
  });

  const claims = await buyer.verifyGrant();
  assert.equal(claims.grnt, "grnt_123");
  const finalResponse = await buyer.get("https://api.test/api/premium");
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/.well-known/jwks.json", "/api/premium", "/api/auth/v1/token", "/mpp/v1/token", "/api/premium"],
  );
  assert.deepEqual(auditActions, ["grant.verified", "spending_limit.checked", "payment.authorized"]);
});

test("buyer token surface does not require mandate id or expose revoke", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "buyer-access-token", expires_in: 3600 } });
    }
    if (parsed.pathname === "/mpp/v1/token") {
      assert.deepEqual(JSON.parse(init.body), { type: "SBMD", customer_reference: "cust-ref-123" });
      return response(200, {
        data: {
          payment_token: "MPP_TOK_123",
          type: "SBMD",
          authorization_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    clientId: "buyer-client",
    clientSecret: "buyer-secret",
    customerReference: "cust-ref-123",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
  });

  assert.equal("revokeToken" in buyer.methods, false);
  const token = await buyer.methods.createToken({ customerReference: "cust-ref-123" });

  assert.equal(token.token, "MPP_TOK_123");
  assert.deepEqual(calls.map((call) => call.path), ["/api/auth/v1/token", "/mpp/v1/token"]);
});

test("decodeReceipt parses Payment-Receipt headers", () => {
  const receipt = decodeReceipt(
    `Payment ${encodeJson({
      status: "success",
      method: "plural",
      timestamp: "2030-01-01T00:00:00Z",
      reference: "cap_1",
      challengeId: "ch_1",
      settlement: { amount: "10.00", currency: "INR" },
    })}`,
  );

  assert.equal(receipt.status, "success");
  assert.equal(receipt.settlement.currency, "INR");
});

test("exports default MPP environments", () => {
  assert.equal(MppEnvironment.SANDBOX, "https://pluraluat.v2.pinepg.in");
  assert.equal(MppEnvironment.PRODUCTION, "https://api.pluralpay.in");
});
