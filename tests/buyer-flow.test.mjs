import assert from "node:assert/strict";
import test from "node:test";

import {
  P3PEnvironment,
  P3PError,
  PaymentGateway,
  PaymentMethod,
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

test("decodes challenges and encodes credentials with customer reference", () => {
  const challengePayload = {
    id: "ch_test",
    realm: "Plural P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "100.00",
      currency: "INR",
      resource: "/premium",
      availablePaymentMethods: ["SBMD", "CRYPTO"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const challenge = decodeChallenge(`Payment ${encodeJson(challengePayload)}`);
  const credential = buildCredential(challenge, "buyer-client", "P3P_TOK_test", PaymentMethod.Crypto, "cust-ref-123", "9876543210");
  const header = encodeCredentialHeader(credential);

  assert.equal(header.startsWith("Payment "), true);
  const encoded = header.slice("Payment ".length);
  const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(challenge.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(raw.payload.customer_reference, "cust-ref-123");
  assert.equal(raw.payload.mobile_number, "9876543210");
  assert.equal(raw.payload.payment_method, PaymentMethod.Crypto);
});

test("auto handles 402 challenge with the selected accepted payment method", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_123",
    realm: "Plural P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["SBMD", "CRYPTO"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, init });

    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal("Authorization" in init.headers, false);
      const body = JSON.parse(init.body);
      assert.deepEqual(body, {
        type: "CRYPTO",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_123",
        payment_amount: { value: 15000, currency: "INR" },
      });
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "CRYPTO",
          payment_method_reference_id: "mnd_test",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/premium") {
      const p3pCredential = init.headers?.["P3P-Credential"] ?? init.headers?.["p3p-credential"] ?? "";
      assert.equal(String(init.headers?.Authorization ?? ""), "");
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_123" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.payload.payment_method, PaymentMethod.Crypto);
      assert.equal(credential.payload.mobile_number, "9876543210");
      return response(
        200,
        { ok: true },
        {
          "Payment-Receipt": `Payment ${encodeJson({
            status: "success",
            paymentGateway: PaymentGateway.PineLabsOnline,
            paymentMethod: PaymentMethod.Crypto,
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
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.Crypto,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
    onPaymentComplete: (receipt) => {
      receiptSeen = receipt;
    },
  });

  const finalResponse = await buyer.get(
    "https://api.test/api/premium",
    {},
    {
      customerKey: "ck_test_customer",
      customerReference: "cust-ref-123",
      mobileNumber: "9876543210",
    },
  );
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), { ok: true });
  assert.equal(receiptSeen.settlement.amount, "150.00");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/premium", "/api/v1/customer/mpp/token", "/api/premium"],
  );
});

test("auto handles 402 using runtime customer context with a shared buyer", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_runtime",
    realm: "Plural P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/runtime",
      availablePaymentMethods: ["SBMD", "CRYPTO"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.host === "api.pluralpay.in" && parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_customer_123");
      assert.equal("Authorization" in init.headers, false);
      assert.deepEqual(JSON.parse(init.body), {
        type: "SBMD",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_runtime",
        payment_amount: { value: 15000, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_runtime",
        type: "SBMD",
        payment_method_reference_id: "auth_runtime",
        expires_in: 300,
      });
    }

    if (parsed.pathname === "/api/runtime") {
      assert.equal(init.headers["X-Request-Id"], "req_123");
      assert.equal("customerKey" in init, false);
      const p3pCredential = init.headers?.["P3P-Credential"] ?? init.headers?.["p3p-credential"] ?? "";
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_runtime" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.source, "cust_123");
      assert.equal(credential.payload.customer_reference, "cust_123");
      assert.equal(credential.payload.mobile_number, "9876543210");
      assert.equal(credential.payload.payment_method, PaymentMethod.UpiSbmd);
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    autoHandlePayment: true,
    fetch: fetchImpl,
  });

  const finalResponse = await buyer.get(
    "https://seller.example.com/api/runtime",
    { headers: { "X-Request-Id": "req_123" } },
    {
      customerKey: "ck_customer_123",
      customerReference: "cust_123",
      mobileNumber: "9876543210",
    },
  );

  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), { ok: true });
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    [
      "seller.example.com/api/runtime",
      "api.pluralpay.in/api/v1/customer/mpp/token",
      "seller.example.com/api/runtime",
    ],
  );
});

test("auto handling rejects when selected payment method is not accepted by seller", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_unsupported",
    realm: "Plural P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["SBMD"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/premium") {
      return response(
        402,
        { title: "Payment Required", status: 402, challengeId: "ch_unsupported" },
        { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
      );
    }

    return response(500, { error: "unexpected call" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.Crypto,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () => buyer.get("https://api.test/api/premium"),
    /not accepted/i,
  );
  assert.deepEqual(calls.map((call) => call.path), ["/api/premium"]);
});

test("auto handling requires customer runtime context when config defaults are absent", async () => {
  const challengePayload = {
    id: "ch_missing_context",
    realm: "Plural P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["SBMD"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === "/api/premium") {
      return response(
        402,
        { title: "Payment Required", status: 402, challengeId: "ch_missing_context" },
        { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
      );
    }
    return response(500, { error: "unexpected call" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () => buyer.get("https://api.test/api/premium"),
    /BuyerRuntimeContext: customerKey, customerReference, and mobileNumber are required/i,
  );
});

test("buyer token surface does not create mandates or expose revoke", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal("Authorization" in init.headers, false);
      assert.deepEqual(JSON.parse(init.body), {
        type: "SBMD",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_direct",
        payment_amount: { value: 100, currency: "INR" },
      });
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "SBMD",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  assert.equal("revokeToken" in buyer.methods, false);
  assert.equal("createMandate" in buyer.methods, false);
  assert.equal("getMandate" in buyer.methods, false);
  const token = await buyer.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.equal(token.token, "P3P_TOK_123");
  assert.equal(token.expires_in, 300);
  assert.deepEqual(calls.map((call) => call.path), ["/api/v1/customer/mpp/token"]);
});

test("buyer env selects sandbox URL for token calls without bearer auth", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal("Authorization" in init.headers, false);
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "SBMD",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await buyer.methods.createToken({
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["pluraluat.v2.pinepg.in/api/v1/customer/mpp/token"],
  );
});

test("buyer env defaults to production when omitted by JavaScript callers", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal("Authorization" in init.headers, false);
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "SBMD",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    fetch: fetchImpl,
  });

  await buyer.methods.createToken({
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["api.pluralpay.in/api/v1/customer/mpp/token"],
  );
});

test("buyer token creation uses fixed customer token endpoint with customer key", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.host === "pluraluat.v2.pinepg.in" && parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal("Authorization" in init.headers, false);
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.deepEqual(JSON.parse(init.body), {
        type: "SBMD",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_direct",
        payment_amount: { value: 100, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79",
        expires_in: 300,
        type: "SBMD",
        payment_method_reference_id: "v1-sub-260527235716-aa-TmOgVb",
        payment_amount: {
          value: 300,
          currency: "INR",
        },
        customer: {
          customer_id: "cust-v1-260527235715-aa-IawrBS",
          merchant_customer_reference: "abcd0008",
          mobile_number: "9876543210",
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const token = await buyer.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.equal(token.token, "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79");
  assert.equal(token.token_id, "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79");
  assert.equal(token.mandate_id, "v1-sub-260527235716-aa-TmOgVb");
  assert.equal(token.customer_id, "cust-v1-260527235715-aa-IawrBS");
  assert.equal(token.customer_reference, "abcd0008");
  assert.equal(token.mobile_number, "9876543210");
  assert.deepEqual(token.payment_amount, { value: 300, currency: "INR" });
  assert.equal(token.payment_method, PaymentMethod.UpiSbmd);
  assert.equal(token.expires_in, 300);
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["pluraluat.v2.pinepg.in/api/v1/customer/mpp/token"],
  );
});

test("P3PError parses swagger error response shapes", () => {
  const topLevel = P3PError.fromResponse(400, {
    status: 400,
    code: "INVALID_REQUEST",
    message: "customer_reference is required",
  });
  assert.equal(topLevel.code, "INVALID_REQUEST");
  assert.equal(topLevel.message, "customer_reference is required");

  const errorMap = P3PError.fromResponse(400, { error: "missing request header" });
  assert.equal(errorMap.message, "missing request header");
});

test("customer key is sent only from per-call token options", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal("Authorization" in init.headers, false);
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "SBMD",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const buyer = PluralBuyer.create({
    paymentGateway: PaymentGateway.PineLabsOnline,
    selectedPaymentMethod: PaymentMethod.UpiSbmd,
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await buyer.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(calls.map((call) => call.path), ["/api/v1/customer/mpp/token"]);
});

test("decodeReceipt parses Payment-Receipt headers", () => {
  const receipt = decodeReceipt(
    `Payment ${encodeJson({
      status: "success",
      paymentGateway: PaymentGateway.PineLabsOnline,
      paymentMethod: PaymentMethod.UpiSbmd,
      timestamp: "2030-01-01T00:00:00Z",
      reference: "cap_1",
      challengeId: "ch_1",
      settlement: { amount: "10.00", currency: "INR" },
    })}`,
  );

  assert.equal(receipt.status, "success");
  assert.equal("method" in receipt, false);
  assert.equal(receipt.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(receipt.paymentMethod, PaymentMethod.UpiSbmd);
  assert.equal(receipt.settlement.currency, "INR");
});

test("exports default P3P environments", () => {
  assert.equal(P3PEnvironment.SANDBOX, "https://pluraluat.v2.pinepg.in");
  assert.equal(P3PEnvironment.PRODUCTION, "https://api.pluralpay.in");
});
