import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { withBazaar } from "@x402/extensions/bazaar";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// --- Shared clients ---
const bazaar = withBazaar(new HTTPFacilitatorClient({ url: FACILITATOR_URL }));

function createPayFetch() {
  const key = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return null;
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: privateKeyToAccount(key) });
  return wrapFetchWithPayment(fetch, client);
}

const payFetch = createPayFetch();

// --- MCP Server ---
const mcp = new McpServer({ name: "x402-bazaar", version: "1.0.0" });

// Tool 1: Discover services
mcp.tool(
  "discover-services",
  "Search the x402 Bazaar for available paid APIs",
  { query: z.string().optional().describe("Filter keyword (e.g. 'weather', 'price', 'generate')") },
  async ({ query }) => {
    const discovery = await bazaar.extensions.discovery.listResources({ type: "http", limit: 50 });
    let items = discovery.items;

    if (query) {
      const kw = query.toLowerCase();
      items = items.filter((s) => {
        const text = `${s.resource} ${s.metadata?.description ?? ""}`.toLowerCase();
        return text.includes(kw);
      });
    }

    const results = items.map((s) => ({
      resource: s.resource,
      description: (s.metadata as Record<string, unknown>)?.description ?? "N/A",
      price: s.accepts?.[0]?.amount ?? "unknown",
      scheme: s.accepts?.[0]?.scheme ?? "unknown",
      network: s.accepts?.[0]?.network ?? "unknown",
      lastUpdated: s.lastUpdated,
    }));

    return { content: [{ type: "text" as const, text: `Found ${results.length} services:\n\n${JSON.stringify(results, null, 2)}` }] };
  },
);

// Tool 2: Call a paid service
mcp.tool(
  "call-paid-service",
  "Call an x402-enabled API with automatic USDC payment",
  {
    url: z.string().describe("Full URL of the service endpoint"),
    method: z.enum(["GET", "POST"]).default("GET").describe("HTTP method"),
    body: z.string().optional().describe("JSON body for POST requests"),
  },
  async ({ url, method, body }) => {
    if (!payFetch) {
      return { content: [{ type: "text" as const, text: "❌ PRIVATE_KEY not configured. Set it in .env to enable payments." }], isError: true };
    }

    try {
      const res =
        method === "POST"
          ? await payFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ?? "{}" })
          : await payFetch(url);

      const data = await res.json();
      return { content: [{ type: "text" as const, text: `✅ Payment successful!\n\n${JSON.stringify(data, null, 2)}` }] };
    } catch (e: unknown) {
      return { content: [{ type: "text" as const, text: `❌ Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

// Tool 3: Get service details
mcp.tool(
  "get-service-info",
  "Get detailed info about a specific service from Bazaar",
  { url: z.string().describe("The resource URL to look up") },
  async ({ url }) => {
    const discovery = await bazaar.extensions.discovery.listResources({ type: "http", limit: 100 });
    const service = discovery.items.find((s) => s.resource === url);

    if (!service) {
      return { content: [{ type: "text" as const, text: `❌ Service not found: ${url}` }], isError: true };
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(service, null, 2) }] };
  },
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error("✅ x402 Bazaar MCP Server started");
  console.error(`   Facilitator: ${FACILITATOR_URL}`);
  console.error(`   Payment: ${payFetch ? "enabled" : "disabled (no PRIVATE_KEY)"}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
