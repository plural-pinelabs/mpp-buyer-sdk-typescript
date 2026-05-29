# Plural P3P Buyer SDK

TypeScript SDK for Plural P3P buyer clients. It handles HTTP
`402 Payment Required` seller challenges, creates one-time P3P payment tokens,
retries protected requests with a `Payment` credential, and parses
`Payment-Receipt` headers.

## Install

```bash
npm install @pine-labs-online/p3p-buyer-sdk
```

Requires Node.js `>=18` or another runtime with `fetch`, `AbortSignal.timeout`,
and standard Web APIs.

## Quick Start

```ts
import {
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PluralBuyer,
} from "@pine-labs-online/p3p-buyer-sdk";

const buyer = PluralBuyer.create({
  paymentGateway: PaymentGateway.PineLabsOnline,
  selectedPaymentMethod: PaymentMethod.UpiSbmd,
  env: P3PEnvironment.SANDBOX,
});

const response = await buyer.get(
  "https://seller.example.com/api/premium",
  { headers: { "X-Request-Id": "req_123" } },
  {
    customerKey: "ck_customer_123",
    customerReference: "customer-ref-123",
    mobileNumber: "9876543210",
  },
);
console.log(await response.json());
```

## Payment Selection

The buyer config selects one payment method for this buyer instance:

```ts
const buyer = PluralBuyer.create({
  paymentGateway: PaymentGateway.PineLabsOnline,
  selectedPaymentMethod: PaymentMethod.Crypto,
  env: P3PEnvironment.SANDBOX,
});
```

`env` selects the Plural P3P service URL. If plain JavaScript callers
omit it, the SDK defaults to `P3PEnvironment.PRODUCTION`.

Customer identity is supplied only per request so a single buyer instance can
serve many customers. `customerKey`, `customerReference`, and `mobileNumber`
are not part of `PluralBuyerConfig`.

Runtime context is passed as a separate argument after `RequestInit`; it is not
merged into fetch options and is never sent to the seller as part of the
original request:

```ts
await buyer.get(url, requestInit, {
  customerKey: "ck_customer_123",
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
});
```

When a seller returns a 402 challenge, the SDK validates
`paymentGateway === "PINE LABS ONLINE"` and checks that the selected method is
included in `request.availablePaymentMethods`. The selected method is sent as
the P3P service payload `type` when creating a token and is embedded as
`payload.payment_method` in the returned Payment credential.

Currently supported values:

- `PaymentMethod.UpiSbmd` -> `"SBMD"`
- `PaymentMethod.Crypto` -> `"CRYPTO"`

## Direct P3P API

```ts
await buyer.methods.createToken({
  customerKey: "ck_customer_123",
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
  challengeId: "ch_...",
  paymentAmount: { value: 50000, currency: "INR" },
  paymentMethod: PaymentMethod.UpiSbmd,
});
```

If `paymentMethod` is omitted, the SDK uses `config.selectedPaymentMethod`.
Mandate/pre-authorization creation belongs on the seller/server side; the buyer
SDK only creates the one-time token for a seller challenge.

Token creation always uses the configured environment base URL and the fixed
customer token endpoint `POST /api/v1/customer/mpp/token`. The buyer SDK does
not send a bearer `Authorization` header to this endpoint.

### Current sandbox token endpoint caveat

The sandbox P3P environment host, `https://pluraluat.v2.pinepg.in`, currently
does not expose `POST /api/v1/customer/mpp/token`; calling that URL returns
`HTTP 404`.

For the customer-token flow used by the playground login/API-token journey, the
working staging endpoint is currently served by checkout-BFF:

```text
POST https://api-staging.pluralonline.com/api/v3/checkout-bff/customer/mpp/token
X-Customer-Key: <customer API token>
Content-Type: application/json
```

Until the SDK is updated to route token creation through that checkout-BFF
origin/path, an automatic `402` flow can fail after the seller challenge with
`HTTP 404` during token creation. Mandate creation and seller debit continue to
use the seller SDK / P3P service flow.

The current P3P request bodies use nested customer objects:

- `POST /api/v1/customer/mpp/token` sends `customer.mobile_number`,
  `challenge_id`, and numeric `payment_amount.value`.

## 402 Flow

1. Your app calls `buyer.get(...)`, `buyer.post(...)`, or `buyer.request(...)`.
2. The seller returns `HTTP 402` with
   `WWW-Authenticate: Payment <challenge>`.
3. The SDK decodes and validates the challenge gateway and available methods.
4. The SDK creates a payment token with runtime customer context.
5. The SDK retries the original request with
   `P3P-Credential: Payment <credential>`.
6. The seller captures the payment and may return `Payment-Receipt`.

Decoded receipts include `paymentGateway` and `paymentMethod` when the seller
adds that context. The older receipt `method` field is not emitted.

## Utilities

```ts
import {
  decodeChallenge,
  decodeReceipt,
  validateChallenge,
} from "@pine-labs-online/p3p-buyer-sdk";

const challenge = decodeChallenge(wwwAuthenticateHeader);
validateChallenge(challenge);

const receipt = decodeReceipt(paymentReceiptHeader);
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
