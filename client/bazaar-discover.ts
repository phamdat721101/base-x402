import "dotenv/config";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { withBazaar, type DiscoveryResource } from "@x402/extensions/bazaar";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { banner, section, ok, info, fail, dim, green, cyan, yellow, money } from "../lib/terminal.js";

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// --- Bazaar discovery client ---
function createBazaarClient() {
  return withBazaar(new HTTPFacilitatorClient({ url: FACILITATOR_URL }));
}

function createPaymentFetch() {
  const key = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return null;
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: privateKeyToAccount(key) });
  return wrapFetchWithPayment(fetch, client);
}

function printService(s: DiscoveryResource, i: number) {
  const price = s.accepts?.[0]
    ? `${s.accepts[0].amount} atomic (${s.accepts[0].scheme})`
    : "unknown";
  const net = s.accepts?.[0]?.network ?? "unknown";
  console.log(`  ${cyan(`[${i + 1}]`)} ${green(s.resource)}`);
  console.log(`      ${dim("Price:")} ${yellow(price)}  ${dim("Network:")} ${net}`);
  if (s.metadata?.description) console.log(`      ${dim("Desc:")}  ${s.metadata.description}`);
  if (s.lastUpdated) console.log(`      ${dim("Updated:")} ${s.lastUpdated}`);
}

async function main() {
  banner("x402 Bazaar — Discovery Client", [
    `${dim("Facilitator:")} ${FACILITATOR_URL}`,
    `${dim("Mode:")}        Browse Bazaar → select service → pay & call`,
  ]);

  // 1. Discover
  section("Discovering services");
  const bazaar = createBazaarClient();
  const discovery = await bazaar.extensions.discovery.listResources({
    type: "http",
    limit: 50,
    offset: 0,
  });

  console.log(info(`Found ${discovery.items.length} services (total: ${discovery.pagination.total})\n`));

  if (discovery.items.length === 0) {
    console.log(fail("No services found in Bazaar."));
    console.log(dim("  Services appear after their first successful payment through the facilitator."));
    console.log(dim("  Run the server (pnpm dev) and buyer (pnpm client) first, then retry.\n"));
    return;
  }

  discovery.items.forEach(printService);

  // 2. Pay & call first service
  const payFetch = createPaymentFetch();
  if (!payFetch) {
    console.log(`\n${yellow("⚠  PRIVATE_KEY not set — skipping paid call. Set it in .env to test payment.")}`);
    return;
  }

  const target = discovery.items[0];
  section(`Calling: ${target.resource}`);

  const method = (target.metadata as Record<string, unknown>)?.method as string | undefined;
  const isPost = method?.toUpperCase() === "POST";

  const res = isPost
    ? await payFetch(target.resource, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "What is Bitcoin?" }),
      })
    : await payFetch(target.resource);

  const data = await res.json();
  console.log(ok("Payment successful!"));
  console.log(money(`Response:`));
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(fail(e.message));
  process.exit(1);
});
