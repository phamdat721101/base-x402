# x402 Kit for Base

A minimal, learnable starter kit for the [x402 HTTP payment protocol](https://docs.x402.org) on Base. Covers **exact** (fixed-price) and **upto** (usage-based) payment schemes, plus the **Bazaar discovery layer** for AI agents — with server, client, agent, and MCP examples.

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

1. Client requests a paid resource — server responds **HTTP 402** with a `PAYMENT-REQUIRED` header.
2. Client SDK signs a payment payload using the wallet private key.
3. Client retries with a `PAYMENT-SIGNATURE` header.
4. Server middleware forwards to a **facilitator** for on-chain verification.
5. If valid, server returns data. Facilitator settles the USDC transfer on-chain.

## Project Structure

```
x402-kit/
├── server/
│   ├── index.ts              # Express entry point — colored startup banner
│   ├── facilitator.ts        # Testnet/mainnet facilitator toggle
│   └── routes/
│       ├── exact.ts          # Fixed-price endpoints + Bazaar discovery metadata
│       └── upto.ts           # Usage-based endpoint + Bazaar discovery metadata
├── client/
│   ├── index.ts              # Simple buyer — calls exact + upto endpoints
│   ├── agent.ts              # Autonomous agent with budget control
│   ├── bazaar-discover.ts    # Bazaar discovery client — browse & call paid APIs
│   ├── bazaar-agent.ts       # Bazaar-aware agent — discover, rank, budget-gate, pay
│   └── mcp-server.ts         # MCP server — Claude Desktop integration
├── lib/
│   └── terminal.ts           # Shared ANSI color/formatting utilities
├── .env.example
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/installation)
- A wallet with testnet USDC on Base Sepolia — get from [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet)

## Setup

```bash
pnpm install

cp .env.example .env
# Edit .env:
#   WALLET_ADDRESS = your receiving address (server)
#   PRIVATE_KEY    = your funded wallet key (client)
#   NETWORK        = testnet (default) or mainnet
```

## Run

```bash
# Terminal 1 — Start server (Bazaar-enabled)
pnpm dev

# Terminal 2 — Run buyer client (pays for exact + upto endpoints)
pnpm client

# Terminal 3 — Run autonomous agent (budget-gated)
pnpm agent
```

## Bazaar Discovery

The [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar) is the discovery layer for x402 — a machine-readable catalog that lets AI agents find, evaluate, and pay for API endpoints automatically.

### How Bazaar Works

1. **Server declares metadata** — Routes include `declareDiscoveryExtension()` with input/output schemas
2. **First payment catalogs the service** — When a buyer pays, the facilitator indexes the endpoint
3. **Agents discover services** — Query `facilitator/discovery/resources` to browse the catalog
4. **Agents pay and consume** — Use `@x402/fetch` to auto-handle 402 → sign → retry

### Run Bazaar Examples

```bash
# Browse the Bazaar catalog and call a discovered service
pnpm bazaar:discover

# Run the Bazaar-aware autonomous agent (discovers → ranks → budget-gates → pays)
pnpm bazaar:agent
```

> **Note:** Services appear in the Bazaar after their first successful payment. Run `pnpm dev` + `pnpm client` first to populate the catalog.

### MCP Integration (Claude Desktop)

The MCP server exposes 3 tools for Claude Desktop:

- `discover-services` — Search the Bazaar for paid APIs
- `call-paid-service` — Call an API with automatic USDC payment
- `get-service-info` — Get detailed info about a service

```bash
# Start MCP server (stdio transport)
pnpm mcp
```

**Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "x402-bazaar": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/x402-kit/client/mcp-server.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourPrivateKeyHere"
      }
    }
  }
}
```

Then ask Claude: *"Search the Bazaar for price services"* or *"Call the weather API for Tokyo"*.

## Payment Schemes

### exact — Fixed Price

The client pays exactly the advertised amount. Used for `GET /api/v1/price` ($0.001) and `GET /api/v1/stats` ($0.005).

```typescript
accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo }]
```

### upto — Usage-Based Billing

The client authorizes a **maximum** amount, but the server settles only what was consumed. Used for `POST /api/v2/generate` (max $0.10).

```typescript
accepts: [{ scheme: "upto", price: "$0.10", network: "eip155:8453", payTo }]
setSettlementOverrides(res, { amount: String(actualCostAtomic) });
```

> **Note:** The `upto` scheme requires the CDP facilitator (mainnet only). On testnet, the generate endpoint falls back to `exact`.

## Autonomous Agent Pattern

The agent in `client/agent.ts` demonstrates budget-controlled payment:

```
For each task:
  1. Pre-flight request → receives 402
  2. Parse PAYMENT-REQUIRED header → extract max price
  3. Budget gate: if max price > per-task budget → REJECT
  4. If approved → retry with payment
  5. Track actual spend
```

The Bazaar agent (`client/bazaar-agent.ts`) extends this with dynamic discovery:

```
1. Query Bazaar catalog
2. For each task:
   a. Find matching services by keyword
   b. Rank by price (cheapest first)
   c. Budget gate
   d. Execute with payment via @x402/fetch
3. Report total session spend
```

## Verified SDK API Reference (v2.10.0)

### Server-side (Seller)

```typescript
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";

const server = new x402ResourceServer(facilitatorClient)
  .register(network, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(paymentMiddleware({
  "GET /price": {
    accepts: [{ scheme: "exact", price: "$0.001", network, payTo }],
    extensions: {
      ...declareDiscoveryExtension({
        output: { example: { btc: 95000 }, schema: { properties: { btc: { type: "number" } } } },
      }),
    },
  },
}, server));
```

### Client-side (Buyer with Bazaar)

```typescript
import { HTTPFacilitatorClient } from "@x402/core/http";
import { withBazaar } from "@x402/extensions/bazaar";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

// Discover
const bazaar = withBazaar(new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" }));
const services = await bazaar.extensions.discovery.listResources({ type: "http", limit: 50 });

// Pay & call
const client = new x402Client();
registerExactEvmScheme(client, { signer: privateKeyToAccount(key) });
const payFetch = wrapFetchWithPayment(fetch, client);
const res = await payFetch(services.items[0].resource);
```

## Switching to Mainnet

1. Set `NETWORK=mainnet` in `.env`
2. Add CDP API keys: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`
3. Fund your wallet with real USDC on Base
4. The server will use the CDP facilitator and enable the `upto` scheme

## Network Reference

| Network      | CAIP-2 ID       | exact | upto | Facilitator            |
|-------------|-----------------|-------|------|------------------------|
| Base Sepolia | `eip155:84532`  | Yes   | No*  | `x402.org/facilitator` |
| Base Mainnet | `eip155:8453`   | Yes   | Yes  | Coinbase CDP           |

*upto requires CDP facilitator — testnet falls back to exact.

## Key Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@x402/express` | 2.10.0 | Server middleware |
| `@x402/evm` | 2.10.0 | EVM scheme implementations |
| `@x402/core` | 2.10.0 | Protocol core — `HTTPFacilitatorClient`, `x402ResourceServer` |
| `@x402/extensions` | 2.10.0 | Bazaar extension — `declareDiscoveryExtension`, `withBazaar` |
| `@x402/fetch` | 2.10.0 | Fetch wrapper with payment — `wrapFetchWithPayment` |
| `@x402/axios` | 2.10.0 | Axios wrapper with payment |
| `@coinbase/x402` | 2.1.0 | CDP facilitator config for mainnet |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP server for Claude Desktop |
| `viem` | 2.47+ | Wallet signer |

## License

MIT
