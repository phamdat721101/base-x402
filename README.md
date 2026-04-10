# x402 Kit for Base

A minimal, learnable starter kit for the [x402 HTTP payment protocol](https://docs.x402.org) on Base. Covers both **exact** (fixed-price) and **upto** (usage-based) payment schemes with server, client, and autonomous agent examples.

## How x402 Works

```
Client                    Server                   Facilitator
  |                         |                          |
  |-- GET /api/v1/price -->|                          |
  |<-- 402 + PAYMENT-REQUIRED header --|              |
  |                         |                          |
  | (sign payment payload)  |                          |
  |                         |                          |
  |-- GET + PAYMENT-SIGNATURE header ->|              |
  |                         |-- POST /verify -------->|
  |                         |<-- valid ---------------|
  |<-- 200 + data ----------|                          |
  |                         |-- POST /settle -------->|
  |                         |<-- tx hash -------------|
```

1. Client requests a paid resource -- server responds **HTTP 402** with a `PAYMENT-REQUIRED` header (base64 JSON containing scheme, price, network, payTo).
2. Client SDK parses the 402, signs a payment payload using the wallet private key.
3. Client retries the request with a `PAYMENT-SIGNATURE` header.
4. Server middleware forwards the payload to a **facilitator** for on-chain verification.
5. If valid, the server executes the handler and returns data. The facilitator settles the USDC transfer on-chain.

## Project Structure

```
x402-kit/
├── server/
│   ├── index.ts           # Express entry point -- mounts routes, health check
│   ├── facilitator.ts     # Testnet/mainnet facilitator toggle
│   └── routes/
│       ├── exact.ts       # Fixed-price endpoints (exact scheme)
│       └── upto.ts        # Usage-based endpoint (upto on mainnet, exact fallback on testnet)
├── client/
│   ├── index.ts           # Simple buyer -- calls both exact and upto endpoints
│   └── agent.ts           # Autonomous agent with budget control
├── .env.example
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/installation)
- A wallet with testnet USDC on Base Sepolia -- get from [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet)

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env:
#   WALLET_ADDRESS = your receiving address (server)
#   PRIVATE_KEY    = your funded wallet key (client)
#   NETWORK        = testnet (default) or mainnet
```

## Run

```bash
# Terminal 1 -- Start server
pnpm dev

# Terminal 2 -- Run buyer client (pays for exact + upto endpoints)
pnpm client

# Terminal 3 -- Run autonomous agent (budget-gated)
pnpm agent
```

## Test 402 Response

```bash
# Without payment -- returns 402 with payment requirements
curl -v http://localhost:4021/api/v1/price

# Health check -- always free
curl http://localhost:4021/health
```

## Payment Schemes

### exact -- Fixed Price

The client pays exactly the advertised amount. Used for `GET /api/v1/price` ($0.001) and `GET /api/v1/stats` ($0.005).

```typescript
// Server route config
accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo }]
```

### upto -- Usage-Based Billing

The client authorizes a **maximum** amount, but the server settles only what was actually consumed. Used for `POST /api/v2/generate` (max $0.10).

```typescript
// Server route config
accepts: [{ scheme: "upto", price: "$0.10", network: "eip155:8453", payTo }]

// In handler -- settle actual cost (atomic USDC units, 6 decimals)
setSettlementOverrides(res, { amount: String(actualCostAtomic) });
```

> **Note:** The `upto` scheme requires the CDP facilitator (mainnet only). On testnet, the generate endpoint falls back to `exact` so you can still test the full flow.

## Autonomous Agent Pattern

The agent in `client/agent.ts` demonstrates how an AI agent can autonomously decide whether to pay for a resource:

```
For each task:
  1. Pre-flight request (no payment) -> receives 402
  2. Parse PAYMENT-REQUIRED header -> extract max price
  3. Budget gate: if max price > per-task budget -> REJECT
  4. If approved -> retry with payment via wrapAxiosWithPayment
  5. Track actual spend from response data
```

Key design points:
- **Budget ceiling per task** -- agent refuses tasks that exceed its budget
- **Cumulative spend tracking** -- agent knows total session cost
- **upto safety** -- with the upto scheme, the agent authorizes a max but only pays actual usage

## Verified SDK API Reference (v2.9.0)

### Server-side imports

```typescript
// Facilitator client
import { HTTPFacilitatorClient } from "@x402/core/server";
// CDP mainnet facilitator config (reads CDP_API_KEY_ID/SECRET from env)
import { facilitator } from "@coinbase/x402";

// Express middleware
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";

// Scheme implementations (server-side)
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
```

### Client-side imports

```typescript
// Axios wrapper
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";

// Scheme implementations (client-side -- different subpath from server!)
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";

// Wallet signer
import { privateKeyToAccount } from "viem/accounts";
```

### Server pattern

```typescript
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

app.use(paymentMiddleware(routes, server));
```

### Client pattern

```typescript
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(account))
  .register("eip155:*", new UptoEvmScheme(account));
const api = wrapAxiosWithPayment(axios.create(), client);
// api.get/post now auto-handles 402 -> sign -> retry
```

## Switching to Mainnet

1. Set `NETWORK=mainnet` in `.env`
2. Add CDP API keys:
   ```
   CDP_API_KEY_ID=your-key-id
   CDP_API_KEY_SECRET=your-key-secret
   ```
3. Fund your wallet with real USDC on Base
4. The server will use the CDP facilitator and enable the `upto` scheme

## Network Reference

| Network      | CAIP-2 ID       | exact | upto | Facilitator            |
|-------------|-----------------|-------|------|------------------------|
| Base Sepolia | `eip155:84532`  | Yes   | No*  | `x402.org/facilitator` |
| Base Mainnet | `eip155:8453`   | Yes   | Yes  | Coinbase CDP           |

*upto requires CDP facilitator -- testnet falls back to exact.

## Key Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@x402/express` | 2.9.0 | Server middleware -- `paymentMiddleware`, `setSettlementOverrides` |
| `@x402/evm` | 2.9.0 | EVM scheme implementations -- `ExactEvmScheme`, `UptoEvmScheme` |
| `@x402/core` | 2.9.0 | Protocol core -- `HTTPFacilitatorClient`, `x402ResourceServer` |
| `@x402/axios` | 2.9.0 | Client wrapper -- `wrapAxiosWithPayment`, `x402Client` |
| `@coinbase/x402` | 2.1.0 | CDP facilitator config for mainnet |
| `viem` | 2.47+ | Wallet signer -- `privateKeyToAccount` |

## License

MIT
