# @plural/mpp-buyer-sdk

 

TypeScript SDK for Plural MPP buyer agents. It handles x402-style HTTP `402`

payment challenges, creates one-time MPP payment tokens, retries protected

requests with a `Payment` credential, and parses `Payment-Receipt` headers.

 

## Install

 

```bash

npm install @plural/mpp-buyer-sdk

```

 

Requires Node.js `>=18` or another runtime with `fetch`, `AbortSignal.timeout`,

and standard Web APIs.

 

## Package Layout

 

The SDK is split into small modules and exposed through npm subpath exports:

 

```ts

import { PluralBuyer } from "@plural/mpp-buyer-sdk";

import { PluralBuyer as Client } from "@plural/mpp-buyer-sdk/client";

import { MppEnvironment } from "@plural/mpp-buyer-sdk/config";

import { GrantVerifier } from "@plural/mpp-buyer-sdk/grantex";

import type { PluralBuyerConfig, Receipt } from "@plural/mpp-buyer-sdk/types";

import { decodeReceipt } from "@plural/mpp-buyer-sdk/utils";

```

 

Use the root import for most applications. Use subpath imports when building

larger services that want clearer ownership boundaries.

 

## Quick Start

 

```ts

import { MppEnvironment, PluralBuyer } from "@plural/mpp-buyer-sdk";

 

const buyer = PluralBuyer.create({

  clientId: "buyer-client-id",

  clientSecret: "buyer-client-secret",

  customerReference: "customer-ref",

  baseUrl: MppEnvironment.SANDBOX,

});

 

const response = await buyer.get("https://seller.example.com/api/premium");

console.log(await response.json());

```

 

## Configuration

 

```ts

const buyer = PluralBuyer.create({

  clientId: process.env.PLURAL_CLIENT_ID!,

  clientSecret: process.env.PLURAL_CLIENT_SECRET!,

  customerReference: "customer-ref",

  baseUrl: MppEnvironment.SANDBOX,

  requestTimeoutMs: 30_000,

  maxRetries: 3,

  onPaymentComplete(receipt) {

    console.log("captured", receipt);

  },

});

```

 

`baseUrl` is the Plural MPP base URL. Authentication always uses

`POST /api/auth/v1/token`; the same base URL can route that call internally to

your central Keycloak-backed auth service.

 

For Grantex grant verification, pass a JWKS URL such as

`https://grantex.dev/.well-known/jwks.json` or the base URL

`https://grantex.dev`. The SDK verifies RS256 signatures offline, caches JWKS,

checks expiry and agent ID, and enforces MPP payment scopes before retrying a

paid request.

 

## Flow

 

1. Your app calls `buyer.get(...)`, `buyer.post(...)`, or `buyer.request(...)`.

2. If the seller returns `402` with `WWW-Authenticate: Payment <challenge>`,

   the SDK decodes and validates the challenge.

3. The SDK authenticates with `POST /api/auth/v1/token`.

4. The SDK creates a payment token with `POST /mpp/v1/token`.

5. The SDK retries the original request with

   `Authorization: Payment <credential>`.

6. The SDK returns the final response and optionally calls

   `onPaymentComplete` with the decoded `Payment-Receipt`.

 

## Direct MPP APIs

 

```ts

await buyer.methods.createMandate({

  mobileNumber: "+919876543210",

  amount: { value: 50000, currency: "INR" },

  customerReference: "customer-ref",

});

 

await buyer.methods.getMandate("authorization-id");

await buyer.methods.createToken({ customerReference: "customer-ref" });

```

 

## Development

 

```bash

npm install

npm run build

npm test

npm pack --dry-run

```

 

`npm publish --access public` will run `prepublishOnly`, compile `dist/`, and

publish only the files declared in `package.json`.

 

## License

 

MIT
