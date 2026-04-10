import "dotenv/config";
import axios from "axios";
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = process.env.SERVER_URL ?? "http://localhost:4021";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

// Register both exact and upto schemes for all EVM networks
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(account))
  .register("eip155:*", new UptoEvmScheme(account));

const api = wrapAxiosWithPayment(axios.create(), client);

async function main() {
  // 1. exact scheme — pays exactly $0.001
  console.log("\n--- exact: GET /api/v1/price ---");
  const price = await api.get(`${SERVER}/api/v1/price`);
  console.log("Data:", price.data);

  // 2. upto scheme — authorizes $0.10, pays actual usage
  console.log("\n--- upto: POST /api/v2/generate ---");
  const gen = await api.post(`${SERVER}/api/v2/generate`, {
    prompt: "Summarize the BTCFi ecosystem in 100 words",
  });
  console.log("Data:", gen.data);
  console.log("Charged (atomic USDC):", gen.data.chargedAtomic);
}

main().catch(console.error);
