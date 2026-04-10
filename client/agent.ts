import "dotenv/config";
import axios from "axios";
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = process.env.SERVER_URL ?? "http://localhost:4021";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(account))
  .register("eip155:*", new UptoEvmScheme(account));

const api = wrapAxiosWithPayment(axios.create(), client);

// --- Budget control ---
const TASK_BUDGET_CENTS = 5; // max 5 cents per task
let totalSpentAtomic = 0;

interface Task {
  name: string;
  method: "GET" | "POST";
  url: string;
  body?: Record<string, unknown>;
}

async function runTask(task: Task): Promise<boolean> {
  // Pre-flight: detect 402 and extract max price
  try {
    await axios({ method: task.method, url: task.url, data: task.body });
    return true;
  } catch (err: unknown) {
    if (!axios.isAxiosError(err) || err.response?.status !== 402) {
      console.log(`  [${task.name}] ERROR: unexpected failure`);
      return false;
    }

    // Parse PAYMENT-REQUIRED header (base64 JSON)
    const header = err.response.headers["payment-required"];
    if (header) {
      try {
        const decoded = JSON.parse(Buffer.from(header, "base64").toString());
        const accepts = decoded?.accepts ?? [];
        const maxAtomic = Math.max(
          ...accepts.map((a: { amount?: string }) => Number(a.amount ?? "0")),
        );
        const maxCents = maxAtomic / 10_000; // USDC 6 decimals → cents
        if (maxCents > TASK_BUDGET_CENTS) {
          console.log(
            `  [${task.name}] REJECTED: max ${maxCents}¢ > budget ${TASK_BUDGET_CENTS}¢`,
          );
          return false;
        }
        console.log(`  [${task.name}] APPROVED: max ${maxCents}¢ within budget`);
      } catch {
        console.log(`  [${task.name}] APPROVED: could not parse price, proceeding`);
      }
    }
  }

  // Execute with payment
  const res = await api({ method: task.method, url: task.url, data: task.body });
  const charged = Number(res.data?.chargedAtomic ?? 0);
  totalSpentAtomic += charged;
  console.log(
    `  [${task.name}] DONE | charged: ${charged} atomic | total: ${totalSpentAtomic} atomic`,
  );
  return true;
}

async function main() {
  console.log(`\nAgent budget: ${TASK_BUDGET_CENTS}¢ per task\n`);

  const tasks: Task[] = [
    { name: "price-feed", method: "GET", url: `${SERVER}/api/v1/price` },
    { name: "stats", method: "GET", url: `${SERVER}/api/v1/stats` },
    {
      name: "generate-short",
      method: "POST",
      url: `${SERVER}/api/v2/generate`,
      body: { prompt: "What is Bitcoin?" },
    },
    {
      name: "generate-long",
      method: "POST",
      url: `${SERVER}/api/v2/generate`,
      body: { prompt: "Write a detailed analysis of the entire BTCFi ecosystem including all major protocols their TVL and yield strategies" },
    },
  ];

  for (const task of tasks) {
    console.log(`Task: ${task.name}`);
    await runTask(task);
  }

  console.log(`\nSession total: ${totalSpentAtomic} atomic USDC`);
}

main().catch(console.error);
