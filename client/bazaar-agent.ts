import "dotenv/config";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { withBazaar, type DiscoveryResource } from "@x402/extensions/bazaar";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { banner, section, ok, fail, info, dim, green, red, yellow, cyan, money } from "../lib/terminal.js";

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const TASK_BUDGET_CENTS = 5; // max 5 cents per task

// --- Setup ---
function setup() {
  const key = process.env.PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("PRIVATE_KEY required in .env");
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: privateKeyToAccount(key) });
  return {
    bazaar: withBazaar(new HTTPFacilitatorClient({ url: FACILITATOR_URL })),
    payFetch: wrapFetchWithPayment(fetch, client),
  };
}

// --- Service matching ---
function findServices(catalog: DiscoveryResource[], keyword: string): DiscoveryResource[] {
  const kw = keyword.toLowerCase();
  return catalog
    .filter((s) => {
      const text = `${s.resource} ${s.metadata?.description ?? ""}`.toLowerCase();
      return text.includes(kw);
    })
    .sort((a, b) => {
      const pa = Number(a.accepts?.[0]?.amount ?? "999999999");
      const pb = Number(b.accepts?.[0]?.amount ?? "999999999");
      return pa - pb; // cheapest first
    });
}

// --- Task runner ---
interface AgentTask {
  name: string;
  keyword: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}

async function runTask(
  task: AgentTask,
  catalog: DiscoveryResource[],
  payFetch: ReturnType<typeof wrapFetchWithPayment>,
): Promise<number> {
  section(`Task: ${task.name}`);

  const matches = findServices(catalog, task.keyword);
  if (matches.length === 0) {
    console.log(fail(`No services found for "${task.keyword}"`));
    return 0;
  }

  const svc = matches[0];
  const priceAtomic = Number(svc.accepts?.[0]?.amount ?? 0);
  const priceCents = priceAtomic / 10_000;

  console.log(info(`Best match: ${svc.resource}`));
  console.log(`  ${dim("Price:")} ${yellow(`${priceCents}¢`)} (${priceAtomic} atomic)  ${dim("Budget:")} ${TASK_BUDGET_CENTS}¢`);

  if (priceCents > TASK_BUDGET_CENTS) {
    console.log(red(`  ✗ REJECTED — exceeds budget (${priceCents}¢ > ${TASK_BUDGET_CENTS}¢)`));
    return 0;
  }

  console.log(green(`  ✓ APPROVED — within budget`));

  try {
    const res =
      task.method === "POST"
        ? await payFetch(svc.resource, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(task.body),
          })
        : await payFetch(svc.resource);

    const data = await res.json();
    const charged = Number((data as Record<string, unknown>).chargedAtomic ?? priceAtomic);
    console.log(ok(`Done — charged ${charged} atomic`));
    console.log(dim(`  ${JSON.stringify(data)}`));
    return charged;
  } catch (e: unknown) {
    console.log(fail(`Payment failed: ${(e as Error).message}`));
    return 0;
  }
}

// --- Main ---
async function main() {
  const { bazaar, payFetch } = setup();

  banner("x402 Bazaar — Autonomous Agent", [
    `${dim("Facilitator:")} ${FACILITATOR_URL}`,
    `${dim("Budget:")}      ${TASK_BUDGET_CENTS}¢ per task`,
    `${dim("Strategy:")}    Discover → rank by price → budget gate → pay`,
  ]);

  // 1. Discover catalog
  section("Loading Bazaar catalog");
  const discovery = await bazaar.extensions.discovery.listResources({ type: "http", limit: 100 });
  const catalog = discovery.items;
  console.log(info(`${catalog.length} services available\n`));

  if (catalog.length === 0) {
    console.log(fail("Empty catalog. Run server + buyer first to populate Bazaar."));
    return;
  }

  catalog.forEach((s, i) => {
    const price = s.accepts?.[0]?.amount ?? "?";
    console.log(`  ${cyan(`[${i + 1}]`)} ${dim(s.resource)} — ${yellow(`${price} atomic`)}`);
  });

  // 2. Run tasks
  const tasks: AgentTask[] = [
    { name: "price-feed", keyword: "price", method: "GET" },
    { name: "protocol-stats", keyword: "stats", method: "GET" },
    { name: "generate-text", keyword: "generate", method: "POST", body: { prompt: "What is Bitcoin?" } },
  ];

  let totalSpent = 0;
  for (const task of tasks) {
    totalSpent += await runTask(task, catalog, payFetch);
  }

  // 3. Summary
  section("Session Summary");
  console.log(money(`Total spent: ${totalSpent} atomic USDC`));
  console.log(dim(`  Tasks: ${tasks.length} | Budget per task: ${TASK_BUDGET_CENTS}¢\n`));
}

main().catch((e) => {
  console.error(fail(e.message));
  process.exit(1);
});
