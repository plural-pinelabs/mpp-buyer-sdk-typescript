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
  assert.equal(config.MppEnvironment.PRODUCTION, "https://api.pluralpay.in");
  assert.equal(types.PAYMENT_HEADER_PREFIX, "Payment ");
});
