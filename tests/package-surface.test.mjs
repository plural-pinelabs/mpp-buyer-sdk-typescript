import assert from "node:assert/strict";
import test from "node:test";

test("buyer package exposes modular entry points", async () => {
  const root = await import("../dist/index.js");
  const client = await import("../dist/client/index.js");
  const types = await import("../dist/types/index.js");
  const utils = await import("../dist/utils/index.js");
  const config = await import("../dist/config/index.js");

  assert.equal(typeof root.PluralBuyer.create, "function");
  assert.equal(client.PluralBuyer, root.PluralBuyer);
  assert.equal(typeof utils.decodeChallenge, "function");
  assert.equal(config.P3PEnvironment.PRODUCTION, "https://api.pluralpay.in");
  assert.equal(config.isP3PEnvironment(config.P3PEnvironment.SANDBOX), true);
  assert.equal(config.resolveP3PBaseUrl(), "https://api.pluralpay.in");
  assert.equal(root.P3PEnvironment, config.P3PEnvironment);
  assert.equal(root.MppEnvironment, undefined);
  assert.equal(types.PAYMENT_HEADER_PREFIX, "Payment ");
  assert.equal(types.PAYMENT_CREDENTIAL_HEADER, "P3P-Credential");
  assert.equal(root.PaymentGateway.PineLabsOnline, "PINE LABS ONLINE");
  assert.equal(root.PaymentMethod.UpiSbmd, "SBMD");
  assert.equal(root.PaymentMethod.Crypto, "CRYPTO");
});
